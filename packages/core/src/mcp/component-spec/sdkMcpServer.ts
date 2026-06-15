/**
 * 组件规格 MCP 服务器（SDK 模式）- 按需深度检索
 * 使用 createSdkMcpServer 创建，与 Agent SDK 集成
 *
 * 数据来源：
 * - 类型定义：从 npm 包的 .d.ts 文件获取（跟随 npm 版本自动更新）
 * - 示例代码：从 component-data/examples/ 获取（仅高阶组件）
 * - 通过 registry.json 的 contextLevel 控制返回内容粒度
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { ComponentLibrary } from './types';
import { resolveComponentSource, listComponents } from './resolvers/index.js';
import { formatComponentSourceForAI } from './utils';

export const componentSourceServer = createSdkMcpServer({
  name: 'component-spec',
  version: '2.0.0',
  tools: [
    tool(
      'get-component-source',
      '获取指定组件库中某个组件的类型定义和使用示例，帮助理解组件 API 和用法',
      {
        componentName: z.string().describe('组件名称（例如：ProTable, Button, Form）'),
        library: z.enum(['antd', 'ant-design-pro-components']).describe('组件库名称'),
        includeExamples: z.boolean().default(false).describe('是否包含使用示例代码（高阶组件会根据 contextLevel 自动包含）'),
        includeProps: z.boolean().default(true).describe('是否包含类型定义（.d.ts），默认 true'),
        maxLength: z.number().default(50000).describe('返回内容的最大长度（字符数），超过此长度将截断'),
        relevantFeatures: z.array(z.string()).optional().describe(
          '与当前设计相关的功能特征关键词（来自设计分析的 semanticLabels），' +
          '用于优先返回最相关的示例代码。例如 ["visible-columns-control", "row-selection"]'
        ),
      },
      async (args) => {
        try {
          const { componentName, library, includeExamples = false, includeProps = true, maxLength = 50000, relevantFeatures = [] } = args;

          if (!componentName) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({ error: '必须提供 componentName 参数' }, null, 2)
              }]
            };
          }

          if (!library) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: '必须提供 library 参数（antd 或 ant-design-pro-components）'
                }, null, 2)
              }]
            };
          }

          const validLibraries: ComponentLibrary[] = ['antd', 'ant-design-pro-components'];

          if (!validLibraries.includes(library)) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: `无效的组件库: ${library}，必须是 ${validLibraries.join(', ')} 之一`
                }, null, 2)
              }]
            };
          }

          const result = resolveComponentSource(library, componentName, includeExamples, includeProps, relevantFeatures);

          if (!result) {
            const availableComponents = listComponents(library);
            const componentsHint = availableComponents.length > 0
              ? `可用组件: ${availableComponents.slice(0, 20).join(', ')}${availableComponents.length > 20 ? '...' : ''}`
              : '可用组件列表为空，请确认 npm 包是否已安装';
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: `找不到组件 "${componentName}" 在组件库 "${library}" 中。\n` + componentsHint
                }, null, 2)
              }]
            };
          }

          const formattedSource = formatComponentSourceForAI(result, maxLength);

          return {
            content: [
              {
                type: 'text',
                text: formattedSource,
              },
            ],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `获取组件源码失败: ${error instanceof Error ? error.message : String(error)}`
              }, null, 2)
            }]
          };
        }
      }
    ),
  ]
});
