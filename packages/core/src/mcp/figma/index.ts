/**
 * Figma MCP 服务器（SDK 模式）
 * Figma 设计数据规范化（样式去重、引用化，供生码使用；与 CSS/Design Token 提取无关）
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { normalizeRawFigmaObject, allExtractors, collapseSvgContainers, flattenTransparentFrames, composeAfterChildren, annotateSiblingOverlap } from './extractors/index.js';
import type { NormalizedNode, GlobalVars } from './extractors/types.js';
import { detectAndFoldRepetition } from './transformers/repetition.js';
import { FigmaService } from './services/figma.js';
import type { AgentConfig } from '../../config/index.js';
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import { writeFigmaLogs } from './utils/logger.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('Figma2Code.FigmaMCP');

export const SET_FOLDER_NAME_TOOL = 'set_folder_name';
export const SET_FOLDER_NAME_FULL_TOOL_ID = 'mcp__figma__set_folder_name';
const FOLDER_NAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

/**
 * LLM 工具返回结果缓存（规范化、清理后的 MCP toolResult）
 * 
 * 缓存范围：normalizeRawFigmaObject + SVG获取 + 重复检测 + 去重
 * 缓存生命周期：进程级别（会话结束自动清理）
 * 缓存键格式：normalized:fileKey:nodeId:depth
 */
const normalizedResultCache = new Map<string, any>();

/** Check whether a node's fills resolve to a raster IMAGE (photo container, not an icon). */
function hasImageFill(node: NormalizedNode, styles: GlobalVars['styles']): boolean {
  if (!node.fills) return false;
  const fillDef = styles[node.fills];
  return (
    Array.isArray(fillDef) &&
    fillDef.some((f: any) => typeof f === 'object' && f.type === 'IMAGE')
  );
}

/**
 * Deduplicate svgContent: move repeated SVG strings into globalVars.styles
 * and replace inline content with a reference key.
 */
function deduplicateSvgContent(
  nodes: NormalizedNode[],
  styles: GlobalVars['styles'],
): void {
  const svgMap = new Map<string, string>(); // svgContent → key
  let counter = 0;

  function walk(nodeList: NormalizedNode[]) {
    for (const node of nodeList) {
      if (node.svgContent) {
        const existing = svgMap.get(node.svgContent);
        if (existing) {
          node.svgContent = existing;
        } else {
          const key = `svg_${counter++}`;
          styles[key] = node.svgContent;
          svgMap.set(node.svgContent, key);
          node.svgContent = key;
        }
      }
      if (node.children) walk(node.children);
    }
  }

  walk(nodes);
}

const GENERIC_NAME_RE = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Instance) \d+/;

/**
 * 序列化前清理：删除 LLM 不需要的字段以缩减上下文体积。
 * - id: Figma 内部节点 ID，仅用于 SVG 获取，对 LLM 无语义价值
 * - name: 自动生成的通用名称（如 "Frame 427320692"）对 LLM 无语义价值
 */
function stripFieldsForLLM(
  nodes: NormalizedNode[],
  options: { includeNodeIds?: boolean } = {},
): void {
  function walk(node: NormalizedNode) {
    if (options.includeNodeIds) {
      (node as any).nodeId = node.id;
    }
    delete (node as any).id;
    if (GENERIC_NAME_RE.test(node.name)) {
      delete (node as any).name;
    }
    node.children?.forEach(walk);
  }
  nodes.forEach(walk);
}

/** Recursively collect IMAGE-SVG nodes, skipping raster-image containers. */
function collectSvgNodes(
  nodes: NormalizedNode[],
  styles: GlobalVars['styles'],
): Map<string, NormalizedNode> {
  const map = new Map<string, NormalizedNode>();
  function walk(node: NormalizedNode) {
    if (node.type === 'IMAGE-SVG' && !hasImageFill(node, styles)) {
      map.set(node.id, node);
    }
    node.children?.forEach(walk);
  }
  nodes.forEach(walk);
  return map;
}

// Figma API 响应类型（使用 any 避免类型依赖问题）
type GetFileResponse = any;
type GetFileNodesResponse = any;

/**
 * 
 * @param agentConfig - Agent 配置
 * @returns MCP 服务器配置，如果配置无效则返回 null
 */
export function createFigmaMcpServer(
  agentConfig: AgentConfig
): McpSdkServerConfigWithInstance | null {
  if (!agentConfig.figmaApiKey) {
    logger.warn('Figma API Key not configured, Figma MCP will be unavailable');
    return null;
  }

  try {
    // 创建 FigmaService 实例（使用相对目录下的实现）
    const figmaService = new FigmaService({
      figmaApiKey: agentConfig.figmaApiKey!,
      figmaOAuthToken: '', // 当前配置不支持 OAuth，使用空字符串
      useOAuth: false, // 使用 Personal Access Token 认证
    });

    // 创建 SDK 模式的 MCP 服务器
    const figmaSdkServer = createSdkMcpServer({
      name: 'figma',
      version: '1.0.0',
      tools: [
        tool(
          'get_figma_data',
          '获取 Figma 设计数据，包括文件结构、节点信息、样式等。这是从 Figma 设计生成代码的核心工具。返回规范化设计数据（样式去重引用 + globalVars），包括布局、填充、描边、效果、字体与组件信息。生码时再据此提取或映射 CSS/Design Token。',
          {
            fileKey: z
              .string()
              .regex(/^[a-zA-Z0-9]+$/, 'File key must be alphanumeric')
              .describe(
                'Figma 文件的 key，通常可以从 URL 中找到，例如 figma.com/(file|design)/<fileKey>/...'
              ),
            nodeId: z
              .string()
              .regex(
                /^I?\d+[:|-]\d+(?:;\d+[:|-]\d+)*$/,
                "Node ID must be like '1234:5678' or 'I5666:180910;1:10515;1:10336'"
              )
              .optional()
              .describe(
                '节点的 ID，通常可以从 URL 参数 node-id=<nodeId> 中找到。如果提供了，将只获取该节点的数据。格式为 "1234:5678" 或 "I5666:180910;1:10515;1:10336"（多个节点）'
              ),
            depth: z
              .number()
              .optional()
              .describe(
                '⚠️ 禁止使用此参数。设置 depth 会截断深层嵌套的文本内容（筛选项标签、表格列名等），严重影响还原度。'
              ),
            includeNodeIds: z
              .boolean()
              .optional()
              .describe(
                '是否在返回节点中保留 nodeId。merged-query 模式需要开启，用于组件 evidence 和 icon fallback。'
              ),
          },
          async (args) => {
            try {
              const { fileKey, nodeId: rawNodeId, depth, includeNodeIds = false } = args;

              // 将 nodeId 中的 - 替换为 :（Figma API 期望 : 格式）
              const nodeId = rawNodeId?.replace(/-/g, ':');

              // 🆕 检查完整结果缓存
              const depthStr = depth !== undefined && depth !== null ? String(depth) : '';
              const normalizedCacheKey = `normalized:${fileKey}:${nodeId ?? 'full'}:${depthStr}:nodeIds=${includeNodeIds ? '1' : '0'}`;
              if (normalizedResultCache.has(normalizedCacheKey)) {
                logger.info('Cache hit: returning cached normalized result', {
                  fileKey,
                  nodeId,
                  depth,
                  includeNodeIds,
                  cacheKey: normalizedCacheKey,
                });
                return normalizedResultCache.get(normalizedCacheKey);
              }

              logger.info('Cache miss: processing Figma data', {
                fileKey,
                nodeId,
                depth,
                includeNodeIds,
                cacheKey: normalizedCacheKey,
              });

              logger.info('Fetching Figma file data', {
                fileKey,
                nodeId,
                depth,
                includeNodeIds,
                depthDescription: depth ? `${depth} layers deep` : 'all layers',
                nodeDescription: nodeId ? `node ${nodeId} from file` : 'full file'
              });

              // 使用 FigmaService 获取原始 API 响应
              let rawApiResponse: GetFileResponse | GetFileNodesResponse;
              if (nodeId) {
                rawApiResponse = await figmaService.getRawNode(fileKey, nodeId, depth);
              } else {
                rawApiResponse = await figmaService.getRawFile(fileKey, depth);
              }

              // 输出原始节点树到日志
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const logPrefix = `${timestamp}_${fileKey}${nodeId ? `_${nodeId.replace(/[:;]/g, '-')}` : ''}`;
              writeFigmaLogs(`${logPrefix}_raw-node-tree.json`, rawApiResponse);
              logger.info('Raw node tree logged', { 
                logFile: `logs/${logPrefix}_raw-node-tree.json`
              });

              // 使用统一的设计提取（一致处理节点和组件）
              const normalizedDesign = normalizeRawFigmaObject(rawApiResponse, allExtractors, {
                maxDepth: depth,
                afterChildren: composeAfterChildren(collapseSvgContainers, flattenTransparentFrames, annotateSiblingOverlap),
              });

              // Fetch real SVG markup for IMAGE-SVG nodes via Figma export API
              // NOTE: must run BEFORE repetition folding so that svgContent
              // differences are captured in _repeat.variables.
              const svgNodeMap = collectSvgNodes(
                normalizedDesign.nodes,
                normalizedDesign.globalVars.styles,
              );
              if (svgNodeMap.size > 0) {
                try {
                  const svgContents = await figmaService.fetchSvgContents(
                    fileKey,
                    Array.from(svgNodeMap.keys()),
                  );
                  for (const [id, content] of Object.entries(svgContents)) {
                    const node = svgNodeMap.get(id);
                    if (node) node.svgContent = content;
                  }
                  logger.info('SVG content fetched for IMAGE-SVG nodes', {
                    requested: svgNodeMap.size,
                    fetched: Object.keys(svgContents).length,
                  });
                } catch (e) {
                  logger.warn('Failed to fetch SVG contents (non-fatal)', {
                    error: e instanceof Error ? e.message : String(e),
                  });
                }
              }

              // Post-processing: detect and fold repeated sibling structures
              // Runs after SVG fetch so svgContent diffs are properly captured.
              for (const node of normalizedDesign.nodes) {
                detectAndFoldRepetition(node);
              }

              // Deduplicate identical SVG content into globalVars to reduce payload
              deduplicateSvgContent(
                normalizedDesign.nodes,
                normalizedDesign.globalVars.styles,
              );

              // 输出规范化节点树到日志
              writeFigmaLogs(`${logPrefix}_normalized-node-tree.json`, normalizedDesign);
              logger.info('Normalized node tree logged', { 
                logFile: `logs/${logPrefix}_normalized-node-tree.json`
              });

              logger.info('Data extraction completed', {
                nodesCount: normalizedDesign.nodes.length,
                stylesCount: Object.keys(normalizedDesign.globalVars?.styles || {}).length
              });

              // 构建结果（标注覆盖率统计请用 pnpm run coverage:figma 对 logs 下 raw JSON 汇总）
              const { nodes, globalVars, ...metadata } = normalizedDesign;

              // 序列化前清理：去掉 LLM 不需要的字段以缩减上下文
              stripFieldsForLLM(nodes, { includeNodeIds });

              const result = {
                metadata,
                nodes,
                globalVars,
              };

              logger.info('Generating JSON result from extracted data');
              const formattedResult = JSON.stringify(result);

              const toolResult = {
                content: [{
                  type: 'text' as const,
                  text: formattedResult
                }]
              };

              // 🆕 缓存完整结果
              normalizedResultCache.set(normalizedCacheKey, toolResult);
              logger.info('Cached normalized result', { 
                cacheKey: normalizedCacheKey,
                resultSize: formattedResult.length,
              });

              logger.info('Sending result to client');
              return toolResult;
            } catch (error) {
              const message = error instanceof Error ? error.message : JSON.stringify(error);
              logger.error('Error fetching Figma file', error instanceof Error ? error : new Error(message), { 
                fileKey: args.fileKey
              });
              return {
                isError: true,
                content: [{
                  type: 'text' as const,
                  text: `Error fetching file: ${message}`
                }]
              };
            }
          }
        ),
        tool(
          SET_FOLDER_NAME_TOOL,
          '设置生成代码的目录名（folder_name）。在用户未指定 folder_name 时，根据 Figma 设计稿的页面/Frame 名称推断一个语义化的目录名。目录名应使用 kebab-case 英文命名。',
          {
            folder_name: z
              .string()
              .min(1)
              .max(128)
              .describe(
                '推断的目录名，使用 kebab-case 英文命名，如 "user-login"、"order-list"、"home-page"',
              ),
          },
          async (args) => {
            const { folder_name } = args;
            const trimmed = folder_name.trim().replace(/\/+$/, '');

            if (!FOLDER_NAME_PATTERN.test(trimmed)) {
              return {
                isError: true,
                content: [{
                  type: 'text' as const,
                  text: `Invalid folder name "${trimmed}". Use kebab-case alphanumeric characters, e.g. "user-login".`,
                }],
              };
            }

            return {
              content: [{
                type: 'text' as const,
                text: `Folder name set to: ${trimmed}`,
              }],
            };
          },
        ),
      ],
    });

    logger.info('Figma MCP server instance created (SDK mode)');
    return figmaSdkServer;
  } catch (error) {
    logger.error('Failed to create Figma MCP server instance', error);
    return null;
  }
}
