/**
 * Resolver 层类型定义
 * 
 * 将组件数据获取从 reference/ 本地目录迁移到：
 * - npm 包（.d.ts 类型定义）
 * - component-data（示例代码）
 */

import type { ComponentLibrary, ComponentSource, ClassifiedFile } from '../types.js';

/** 上下文级别 */
export type ContextLevel = 'types-only' | 'types-with-brief-example' | 'full-example';

/** 单个组件在 registry 中的配置 */
export interface ComponentConfig {
  contextLevel?: ContextLevel;
  dirName?: string;
  typesPath?: string;
  aliases?: string[];
  flattenTypes?: boolean;
  /** 本组件通过 fields 配置内化的基础组件列表（无需单独查询） */
  subsumes?: string[];
}

/** 单个组件库在 registry 中的配置 */
export interface LibraryConfig {
  displayName: string;
  platform: string[];
  importPrefix: string;
  npmPackage: string;
  typesPath: string | string[];
  examplesDir?: string;
  defaultContextLevel: ContextLevel;
  skill?: string;
  components?: Record<string, ComponentConfig>;
}

/** registry.json 的完整类型 */
export interface Registry {
  version: string;
  libraries: Record<string, LibraryConfig>;
}

/** Resolver 接口：从某个数据源获取组件部分数据 */
export interface ComponentDataResolver {
  /** 获取组件的类型定义 */
  resolveTypes(library: ComponentLibrary, componentName: string): string | null;
  
  /** 获取组件的示例文件 */
  resolveExamples(library: ComponentLibrary, componentName: string): ClassifiedFile[];
  
  /** 列出库中所有可用组件 */
  listComponents(library: ComponentLibrary): string[];
}
