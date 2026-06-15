/**
 * Registry 加载器
 * 从 component-data/registry.json 加载组件库注册配置
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { Registry, LibraryConfig, ComponentConfig, ContextLevel } from './types.js';
import type { ComponentLibrary } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REGISTRY_PATH = join(__dirname, '../../component-data/registry.json');

let _registry: Registry | null = null;

/** 加载 registry（带缓存） */
export function loadRegistry(): Registry {
  if (!_registry) {
    const content = readFileSync(REGISTRY_PATH, 'utf-8');
    _registry = JSON.parse(content) as Registry;
  }
  return _registry;
}

/** 获取库配置 */
export function getLibraryConfig(library: ComponentLibrary): LibraryConfig | null {
  const registry = loadRegistry();
  return registry.libraries[library] || null;
}

/** 获取组件配置（合并库默认值） */
export function getComponentConfig(library: ComponentLibrary, componentName: string): ComponentConfig & { contextLevel: ContextLevel } {
  const libConfig = getLibraryConfig(library);
  if (!libConfig) {
    return { contextLevel: 'types-only' };
  }
  
  const compConfig = libConfig.components?.[componentName] || {};
  return {
    ...compConfig,
    contextLevel: compConfig.contextLevel || libConfig.defaultContextLevel,
  };
}

/** 获取组件的上下文级别 */
export function getContextLevel(library: ComponentLibrary, componentName: string): ContextLevel {
  return getComponentConfig(library, componentName).contextLevel;
}

/** 获取 registry 中所有已注册的库名 */
export function getRegisteredLibraries(): ComponentLibrary[] {
  const registry = loadRegistry();
  return Object.keys(registry.libraries) as ComponentLibrary[];
}

/** 检查库是否已注册 */
export function isRegisteredLibrary(library: string): library is ComponentLibrary {
  const registry = loadRegistry();
  return library in registry.libraries;
}

/** 将 PascalCase 组件名转换为 kebab-case 目录名 */
export function componentNameToDir(componentName: string, library?: ComponentLibrary): string {
  // 先检查 registry 中是否有自定义 dirName
  if (library) {
    const libConfig = getLibraryConfig(library);
    const compConfig = libConfig?.components?.[componentName];
    if (compConfig?.dirName) {
      return compConfig.dirName;
    }
  }
  
  // 子组件 (如 "Form.Item", "ProForm.BasicForm") → 取父组件部分解析目录
  if (componentName.includes('.')) {
    const parent = componentName.split('.')[0];
    return parent
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '');
  }

  // 默认：PascalCase → kebab-case
  return componentName
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}
