/**
 * npm Resolver
 * 从 node_modules 中的 npm 包读取 .d.ts 类型定义
 * 
 * 类型解析优先级：
 * 1. 预生成的扁平化类型（AST 精确提取，build-time 生成）
 * 2. 运行时深度引用链解析（BFS 跟踪 import/export）
 * 3. 单文件直接读取（基础组件回退）
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { dirname, resolve as pathResolve, relative as pathRelative, join } from 'path';
import { fileURLToPath } from 'url';
import type { ComponentLibrary } from '../types.js';
import type { LibraryConfig } from './types.js';
import { getLibraryConfig, componentNameToDir, getComponentConfig } from './registryLoader.js';
import { createLogger } from '../../../lib/logger.js';

const logger = createLogger('Figma2Code.NpmResolver');

// ======================== 基础工具 ========================

/**
 * 解析 node_modules 路径
 */
function resolveNodeModules(): string | null {
  const candidates = [
    process.cwd(),
  ];

  for (const base of candidates) {
    const nmPath = `${base}/node_modules`;
    if (existsSync(nmPath)) {
      return nmPath;
    }
  }
  
  return null;
}

/**
 * 在 npm 包中查找组件的主类型定义文件路径
 */
function findPrimaryTypesFile(
  libConfig: LibraryConfig,
  packageDir: string,
  compDir: string,
): string | null {
  const typesPathPatterns = Array.isArray(libConfig.typesPath)
    ? libConfig.typesPath
    : [libConfig.typesPath];

  for (const pattern of typesPathPatterns) {
    const resolvedPath = pattern.replace(/\{component\}/g, compDir);
    const fullPath = `${packageDir}/${resolvedPath}`;
    if (existsSync(fullPath)) return fullPath;
  }

  const fallbackPaths = [
    `typings/components/${compDir}/types.d.ts`,
    `dist/esm/components/${compDir}/types.d.ts`,
    `dist/esm/components/${compDir}/${compDir}.d.ts`,
    `es/components/${compDir}/types.d.ts`,
    `lib/components/${compDir}/types.d.ts`,
  ];

  for (const fallback of fallbackPaths) {
    const fullPath = `${packageDir}/${fallback}`;
    if (existsSync(fullPath)) return fullPath;
  }

  return null;
}

// ======================== 深度引用链解析 ========================

/**
 * 提取 .d.ts 文件中所有 import/export 的模块路径
 * 
 * 支持的语法：
 * - import type { X } from './path'
 * - import { X } from './path'
 * - import type * as X from 'pkg'
 * - export * from './path'
 * - export type { X } from './path'
 */
function extractImportPaths(content: string): Array<{ path: string; isRelative: boolean }> {
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:\{[\s\S]*?\}|\*(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/g;
  const results: Array<{ path: string; isRelative: boolean }> = [];
  let match;
  while ((match = pattern.exec(content)) !== null) {
    results.push({
      path: match[1],
      isRelative: match[1].startsWith('.'),
    });
  }
  return results;
}

/**
 * 将 import 路径解析为文件系统绝对路径
 */
function resolveImportFilePath(importPath: string, currentFilePath: string): string | null {
  const dir = dirname(currentFilePath);
  const candidates = [
    pathResolve(dir, importPath + '.d.ts'),
    pathResolve(dir, importPath + '.ts'),
    pathResolve(dir, importPath + '/index.d.ts'),
    pathResolve(dir, importPath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

interface DeepResolveOptions {
  /** 最大递归深度，默认 3 */
  maxDepth?: number;
  /** 最大解析文件数，默认 30 */
  maxFiles?: number;
  /** 最大总内容大小（字节），默认 100KB */
  maxTotalSize?: number;
}

/**
 * 深度解析类型定义文件，自动追踪 import/export 引用链
 * 
 * 使用 BFS 确保优先解析近距离依赖：
 * - 跟踪相对路径 import（同包内跨文件引用）
 * - 跳过外部包 import（react, history 等）
 * - 循环引用检测
 * 
 * 输出格式：
 * - 单文件时直接返回内容
 * - 多文件时添加文件路径标注，帮助 AI 理解类型来源
 */
function deepResolveTypes(
  primaryFilePath: string,
  packageRoot: string,
  options: DeepResolveOptions = {},
): string {
  const {
    maxDepth = 3,
    maxFiles = 30,
    maxTotalSize = 100 * 1024,
  } = options;

  const queue: Array<{ filePath: string; depth: number }> = [
    { filePath: primaryFilePath, depth: 0 },
  ];
  const visited = new Set<string>();
  const resolvedFiles: Array<{ relativePath: string; content: string; depth: number }> = [];
  let totalSize = 0;

  while (queue.length > 0) {
    const { filePath, depth } = queue.shift()!;
    const normalized = pathResolve(filePath);

    if (visited.has(normalized)) continue;
    if (depth > maxDepth) continue;
    if (resolvedFiles.length >= maxFiles) break;
    if (totalSize >= maxTotalSize) break;

    visited.add(normalized);

    try {
      const content = readFileSync(normalized, 'utf-8');
      if (!content.trim()) continue;

      const relativePath = pathRelative(packageRoot, normalized);
      resolvedFiles.push({ relativePath, content, depth });
      totalSize += content.length;

      const imports = extractImportPaths(content);
      for (const imp of imports) {
        if (!imp.isRelative) continue;
        const resolved = resolveImportFilePath(imp.path, normalized);
        if (resolved && !visited.has(pathResolve(resolved))) {
          queue.push({ filePath: resolved, depth: depth + 1 });
        }
      }
    } catch {
      // ignore read errors
    }
  }

  if (resolvedFiles.length === 0) return '';

  if (resolvedFiles.length === 1) return resolvedFiles[0].content;

  logger.info('Deep resolve completed', {
    primaryFile: pathRelative(packageRoot, primaryFilePath),
    totalFiles: resolvedFiles.length,
    totalSize,
    files: resolvedFiles.map(f => f.relativePath),
  });

  const sections = resolvedFiles.map((file, idx) => {
    const label = idx === 0
      ? `${file.relativePath} (主文件)`
      : `引用链: ${file.relativePath}`;
    return `// ========== ${label} ==========\n${file.content}`;
  });

  return sections.join('\n\n');
}

// ======================== 公共 API ========================

// ======================== 预生成扁平化类型 ========================

const __filename_local = fileURLToPath(import.meta.url);
const __dirname_local = dirname(__filename_local);
const FLATTENED_TYPES_DIR = join(__dirname_local, '../../component-data/flattened-types');

/**
 * 尝试读取预生成的扁平化类型定义
 * 由 scripts/generate-flattened-types.mts 在 build-time 通过 AST 精确提取
 */
function resolveFlattenedTypes(library: ComponentLibrary, componentName: string): string | null {
  const compConfig = getComponentConfig(library, componentName);
  if (!compConfig.flattenTypes) return null;

  const flattenedPath = join(FLATTENED_TYPES_DIR, library, `${componentName}.d.ts`);
  if (!existsSync(flattenedPath)) {
    logger.debug('Flattened types file not found', { library, componentName, path: flattenedPath });
    return null;
  }

  try {
    const content = readFileSync(flattenedPath, 'utf-8');
    if (content.trim()) {
      logger.debug('Resolved from flattened types', { library, componentName });
      return content;
    }
  } catch {
    // fall through to deep resolve
  }

  return null;
}

// ======================== 公共 API ========================

/**
 * 从 npm 包中解析组件的类型定义
 * 
 * 解析优先级：
 * 1. 预生成的扁平化类型（AST 精确提取，最干净）
 * 2. 运行时深度引用链解析（BFS 跟踪 import/export）
 */
export function resolveTypes(library: ComponentLibrary, componentName: string): string | null {
  // 1. 优先使用预生成的扁平化类型
  const flattened = resolveFlattenedTypes(library, componentName);
  if (flattened) return flattened;

  // 2. 回退到运行时深度解析
  const libConfig = getLibraryConfig(library);
  if (!libConfig) {
    logger.warn('Library not found in registry', { library });
    return null;
  }

  const nodeModules = resolveNodeModules();
  if (!nodeModules) {
    logger.warn('node_modules not found');
    return null;
  }

  const compDir = componentNameToDir(componentName, library);
  const packageDir = `${nodeModules}/${libConfig.npmPackage}`;

  const primaryFilePath = findPrimaryTypesFile(libConfig, packageDir, compDir);
  if (!primaryFilePath) {
    logger.warn('Types not found in npm package', { library, componentName, compDir });
    return null;
  }

  const content = deepResolveTypes(primaryFilePath, packageDir);
  if (content) {
    logger.debug('Resolved types with deep resolve', {
      library, componentName, path: primaryFilePath,
    });
    return content;
  }

  return null;
}

/**
 * 列出 npm 包中所有可用的组件目录
 */
export function listComponents(library: ComponentLibrary): string[] {
  const libConfig = getLibraryConfig(library);
  if (!libConfig) return [];

  const nodeModules = resolveNodeModules();
  if (!nodeModules) return [];

  // 根据 typesPath 推断组件目录位置
  const typesPath = Array.isArray(libConfig.typesPath) ? libConfig.typesPath[0] : libConfig.typesPath;
  // 从 "typings/components/{component}/types.d.ts" 提取 "typings/components"
  const componentsDir = typesPath.split('/{component}')[0];
  const fullDir = `${nodeModules}/${libConfig.npmPackage}/${componentsDir}`;

  if (!existsSync(fullDir)) return [];

  try {
    return readdirSync(fullDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .filter(d => !d.name.startsWith('_'))
      .map(d => d.name);
  } catch {
    return [];
  }
}
