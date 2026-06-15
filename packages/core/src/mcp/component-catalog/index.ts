/**
 * 组件摘要配置统一导出
 * 
 * 用于 AI System Prompt,替代完整源码注入
 * 
 * 设计原则：
 * - 每个组件 3-5 行描述，足够 AI 理解用途和选择
 * - 使用元数据文件（JSON）替代硬编码，支持自动生成
 */

import type { PlatformType, ComponentLibrary } from '../../runtime/types/platform.js';
import { PLATFORM_LIBRARIES } from './constants';
import { getIconsSummary } from './icons';
import type { ComponentSummary, DetailedProp } from './types';
import { MetadataLoader } from './loader';
import type { ComponentMetadata } from './loader';

// 创建全局元数据加载器实例
const metadataLoader = new MetadataLoader();

/**
 * 组件摘要数据（从元数据文件加载）
 * 保持向后兼容的接口
 */
export async function getComponentSummaries(): Promise<Record<ComponentLibrary, ComponentSummary[]>> {
  const summaries: Record<ComponentLibrary, ComponentSummary[]> = {
    antd: [],
    'ant-design-pro-components': [],
  };

  for (const library of Object.keys(summaries) as ComponentLibrary[]) {
    try {
      const metadata = await metadataLoader.load(library);
      summaries[library] = metadata;
    } catch (error) {
      console.warn(`[ComponentList] Failed to load metadata for ${library}, using empty array:`, error);
    }
  }

  return summaries;
}

/**
 * 同步获取组件摘要（从缓存）
 * 如果缓存未加载，返回空数组
 */
export function getComponentSummariesSync(): Record<ComponentLibrary, ComponentSummary[]> {
  // 注意：这是一个同步接口，但元数据是异步加载的
  // 为了向后兼容，我们返回一个可能为空的映射
  // 实际使用时应该使用异步接口
  return {
    antd: [],
    'ant-design-pro-components': [],
  };
}

/**
 * 获取所有可用的组件库名称列表
 */
export function getAvailableLibraries(): ComponentLibrary[] {
  return ['antd', 'ant-design-pro-components'];
}

/**
 * 根据平台获取可用的组件库列表
 */
export function getLibrariesByPlatform(platform: PlatformType): ComponentLibrary[] {
  return PLATFORM_LIBRARIES[platform];
}

/**
 * 验证是否为有效的组件库名称
 */
export function isValidLibrary(library: string): library is ComponentLibrary {
  return getAvailableLibraries().includes(library as ComponentLibrary);
}

/**
 * 验证是否为有效的平台类型
 */
export function isValidPlatform(platform: string): platform is PlatformType {
  return platform in PLATFORM_LIBRARIES;
}

/**
 * 根据组件库和组件名获取组件摘要
 * @param library - 组件库名称
 * @param componentName - 组件名称
 * @returns 组件摘要，如果未找到则返回 undefined
 */
export async function getComponentSummary(
  library: ComponentLibrary,
  componentName: string
): Promise<ComponentSummary | undefined> {
  const summaries = await metadataLoader.load(library);
  return summaries.find((summary) => summary.name === componentName);
}

/**
 * 同步版本（从缓存获取）
 */
export function getComponentSummarySync(
  library: ComponentLibrary,
  componentName: string
): ComponentSummary | undefined {
  // 注意：这是一个同步接口，但元数据是异步加载的
  // 为了向后兼容，返回 undefined
  // 实际使用时应该使用异步接口
  return undefined;
}

/**
 * 根据组件库和组件名获取详细 Props
 * @param library - 组件库名称
 * @param componentName - 组件名称
 * @returns 详细 Props 数组，如果未找到或未配置则返回 undefined
 */
export async function getDetailedProps(
  library: ComponentLibrary,
  componentName: string
): Promise<DetailedProp[] | undefined> {
  const summary = await getComponentSummary(library, componentName);
  return summary?.detailedProps;
}

/**
 * 同步版本（从缓存获取）
 */
export function getDetailedPropsSync(
  library: ComponentLibrary,
  componentName: string
): DetailedProp[] | undefined {
  const summary = getComponentSummarySync(library, componentName);
  return summary?.detailedProps;
}

// 重新导出类型和常量
export type { ComponentSummary, DetailedProp };
export { PLATFORM_LIBRARIES, getIconsSummary };

// 导出元数据加载器（供外部使用）
export { MetadataLoader } from './loader';
export type { ComponentMetadata, ComponentMetadataFile } from './loader';

// 导出 MCP 服务器
export { componentListServer as createComponentCatalogMcpServer } from './sdkMcpServer';
