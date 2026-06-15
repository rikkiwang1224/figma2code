/**
 * 统一 Resolver 入口
 * 
 * 根据 registry.json 中的 contextLevel 配置，
 * 从 npm 包和 component-data 中组装组件数据。
 */

import type { ComponentLibrary, ComponentSource } from '../types.js';
import type { ContextLevel } from './types.js';
import { getContextLevel, getComponentConfig, getLibraryConfig, componentNameToDir, isRegisteredLibrary } from './registryLoader.js';
import * as npmResolver from './npmResolver.js';
import * as examplesResolver from './examplesResolver.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('Figma2Code.ComponentResolver');

export { loadRegistry, getLibraryConfig, getContextLevel, isRegisteredLibrary, componentNameToDir } from './registryLoader.js';
export type { ContextLevel, Registry, LibraryConfig, ComponentConfig } from './types.js';

export interface ResolveOptions {
  includeExamples?: boolean;
  includeProps?: boolean;
  /** 设计分析阶段识别出的相关功能特征，用于对示例进行语义相关性排序 */
  relevantFeatures?: string[];
}

/**
 * 获取组件数据
 * 
 * 根据 contextLevel 决定返回内容：
 * - types-only: 仅类型定义
 * - types-with-brief-example: 类型定义 + 最多 2 个示例
 * - full-example: 类型定义 + 全部示例
 *
 * 当提供 relevantFeatures 时，示例会按语义相关性排序，
 * 确保最相关的示例出现在前面（被完整展示）。
 */
export function resolveComponentSource(
  library: ComponentLibrary,
  componentName: string,
  includeExamples: boolean = false,
  includeProps: boolean = true,
  relevantFeatures: string[] = [],
): ComponentSource | null {
  if (!isRegisteredLibrary(library)) {
    logger.warn('Library not registered', { library });
    return null;
  }

  const compConfig = getComponentConfig(library, componentName);
  const contextLevel = compConfig.contextLevel;
  logger.info('Resolving component', { library, componentName, contextLevel, relevantFeatures });

  const result: ComponentSource = {
    name: componentName,
    library,
    subsumes: compConfig.subsumes,
  };

  // 1. 类型定义（从 npm）
  if (includeProps) {
    const typesContent = npmResolver.resolveTypes(library, componentName);
    if (typesContent) {
      result.typesContent = typesContent;
    }
  }

  // 2. 示例（从 component-data）
  const shouldIncludeExamples = includeExamples || contextLevel !== 'types-only';

  if (shouldIncludeExamples) {
    let examples = examplesResolver.resolveExamples(library, componentName);

    if (examples.length > 0 && relevantFeatures.length > 0) {
      examples = examplesResolver.rankExamplesByRelevance(examples, relevantFeatures);
    }

    if (examples.length > 0) {
      result.examples = contextLevel === 'types-with-brief-example' && !includeExamples
        ? examples.slice(0, 2)
        : examples;
    }
  }

  // 至少有类型或示例才返回
  if (!result.typesContent && (!result.examples || result.examples.length === 0)) {
    logger.warn('No data resolved', { library, componentName });
    return null;
  }

  return result;
}

/** 列出组件库中的所有组件 */
export function listComponents(library: ComponentLibrary): string[] {
  return npmResolver.listComponents(library);
}
