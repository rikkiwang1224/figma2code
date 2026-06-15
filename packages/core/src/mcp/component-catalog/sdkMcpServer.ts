/**
 * 组件目录 MCP 服务器（SDK 模式）- 轻量摘要
 * 使用 createSdkMcpServer 创建，与 Agent SDK 集成
 *
 * 数据来源：metadata/*.json（由 csi:sync 从 CSI 索引合并生成）
 */

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import type { PlatformType, ComponentLibrary } from '../../runtime/types/platform.js';
import {
  getLibrariesByPlatform,
  getAvailableLibraries,
  getIconsSummary,
} from './index';
import { MetadataLoader } from './loader/metadataLoader.js';
import type { ComponentSummary } from './types';

const metadataLoader = new MetadataLoader();

async function getComponentSummaries(library: ComponentLibrary): Promise<ComponentSummary[]> {
  return metadataLoader.load(library);
}

export const componentListServer = createSdkMcpServer({
  name: 'component-catalog',
  version: '1.0.0',
  tools: [
    tool(
      'list-available-components',
      '查询指定平台或组件库的可用组件列表，返回组件名称、描述和核心 Props。注意：必须提供 platform 或 library 参数之一',
      {
        platform: z.enum(['pc', 'ant-design']).optional().describe('目标平台。pc 或 ant-design 均返回 Ant Design 组件库列表'),
        library: z.enum(['antd', 'ant-design-pro-components']).optional().describe('组件库名称'),
        includeProps: z.boolean().default(true).describe('是否包含组件的核心 Props 信息'),
      },
      async (args) => {
        try {
          const { platform, library, includeProps = true } = args;

          // 验证参数
          if (!platform && !library) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: '必须提供 platform 或 library 参数之一'
                }, null, 2)
              }]
            };
          }

          let components: Array<{
            name: string;
            description: string;
            library: ComponentLibrary;
            keyProps?: string[];
          }> = [];

          if (platform) {
            const normalizedPlatform: PlatformType =
              platform === 'ant-design' ? 'pc' : (platform as PlatformType);
            const libraries = getLibrariesByPlatform(normalizedPlatform);
            for (const lib of libraries) {
              const libComponents = await getComponentSummaries(lib);
              components.push(
                ...libComponents.map((comp) => ({
                  name: comp.name,
                  description: comp.description,
                  library: lib,
                  ...(includeProps && { keyProps: comp.keyProps }),
                }))
              );
            }
          } else if (library) {
            const libComponents = await getComponentSummaries(library);
            components = libComponents.map((comp) => ({
              name: comp.name,
              description: comp.description,
              library,
              ...(includeProps && { keyProps: comp.keyProps }),
            }));
          }

          // 格式化输出
          const normalizedPlatform: PlatformType | undefined = platform 
            ? (platform as PlatformType)
            : undefined;
          const result = {
            total: components.length,
            components,
            libraries: normalizedPlatform
              ? getLibrariesByPlatform(normalizedPlatform)
              : library
              ? [library]
              : getAvailableLibraries(),
          };

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2),
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `查询组件列表失败: ${error instanceof Error ? error.message : String(error)}`
              }, null, 2)
            }]
          };
        }
      }
    ),

    tool(
      'list-icons',
      '获取指定平台的图标列表和摘要信息，包括图标命名规则、样式说明和常用图标分类',
      {
        platform: z.enum(['pc', 'h5', 'ant-design']).describe('目标平台（pc / ant-design 使用 Ant Design 图标）'),
      },
      async (args) => {
        try {
          const { platform } = args;

          if (!platform || (platform !== 'pc' && platform !== 'h5' && platform !== 'ant-design')) {
            return {
              content: [{
                type: 'text',
                text: JSON.stringify({
                  error: `无效的平台类型: ${platform}，必须是 'pc'、'h5' 或 'ant-design'`
                }, null, 2)
              }]
            };
          }

          const normalizedPlatform: PlatformType = platform as PlatformType;
          
          // 获取图标摘要
          const iconsSummary = getIconsSummary(normalizedPlatform);

          // 格式化输出
          const result = {
            platform: normalizedPlatform,
            summary: iconsSummary,
          };

          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2),
            }],
          };
        } catch (error) {
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                error: `查询图标列表失败: ${error instanceof Error ? error.message : String(error)}`
              }, null, 2)
            }]
          };
        }
      }
    ),
  ]
});
