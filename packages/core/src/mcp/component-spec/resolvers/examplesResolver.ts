/**
 * Examples Resolver
 * 从 component-data/examples/ 读取组件示例代码
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ComponentLibrary, ClassifiedFile } from '../types.js';
import { componentNameToDir } from './registryLoader.js';
import { createLogger } from '../../../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const EXAMPLES_BASE = join(__dirname, '../../component-data/examples');

const logger = createLogger('Figma2Code.ExamplesResolver');

/**
 * 递归读取目录中的所有文件
 */
function readFilesRecursive(dir: string, baseDir: string): ClassifiedFile[] {
  const files: ClassifiedFile[] = [];
  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const relativePath = fullPath.replace(baseDir + '/', '');

    if (entry.isDirectory()) {
      files.push(...readFilesRecursive(fullPath, baseDir));
    } else if (entry.isFile()) {
      // 只读取源码相关文件
      const validExts = ['.tsx', '.ts', '.jsx', '.js', '.less', '.css'];
      if (!validExts.some(ext => entry.name.endsWith(ext))) continue;

      try {
        const content = readFileSync(fullPath, 'utf-8');
        files.push({
          path: relativePath,
          name: entry.name,
          content,
        });
      } catch (error) {
        logger.warn('Failed to read example file', { path: fullPath, error: String(error) });
      }
    }
  }

  return files;
}

/**
 * 获取组件的示例文件
 */
export function resolveExamples(library: ComponentLibrary, componentName: string): ClassifiedFile[] {
  const compDir = componentNameToDir(componentName, library);
  const examplesDir = join(EXAMPLES_BASE, library, compDir);

  if (!existsSync(examplesDir)) {
    logger.debug('No examples found', { library, componentName, dir: examplesDir });
    return [];
  }

  const files = readFilesRecursive(examplesDir, examplesDir);
  logger.debug('Resolved examples', { library, componentName, count: files.length });
  return files;
}

/**
 * 检查组件是否有示例
 */
export function hasExamples(library: ComponentLibrary, componentName: string): boolean {
  const compDir = componentNameToDir(componentName, library);
  const examplesDir = join(EXAMPLES_BASE, library, compDir);
  return existsSync(examplesDir);
}

// ======================== 语义相关性排序 ========================

/**
 * 从示例文件的 JSDoc 头部提取 title 和 desc
 */
function extractExampleMeta(content: string): { title: string; desc: string } {
  const jsdocMatch = content.match(/\/\*\*\s*([\s\S]*?)\s*\*\//);
  if (!jsdocMatch) return { title: '', desc: '' };

  const block = jsdocMatch[1];
  const titleMatch = block.match(/\*\s*title:\s*(.+)/);
  const title = titleMatch?.[1]?.trim() ?? '';

  const descParts: string[] = [];
  const lines = block.split('\n');
  let inDesc = false;
  for (const line of lines) {
    const trimmed = line.replace(/^\s*\*\s?/, '');
    if (trimmed.startsWith('desc:')) {
      inDesc = true;
      const rest = trimmed.replace(/^desc:\s*/, '');
      if (rest) descParts.push(rest);
    } else if (inDesc) {
      if (trimmed.startsWith('title:') || trimmed === '/') break;
      descParts.push(trimmed);
    }
  }

  return { title, desc: descParts.join(' ').trim() };
}

/**
 * 将 feature 关键词展开为匹配 token 列表
 *
 * 例如 "visible-columns-control" → ["visible", "columns", "control", "visible-columns", "visiblecols", ...]
 */
function expandFeatureTokens(feature: string): string[] {
  const lower = feature.toLowerCase();
  const parts = lower.split(/[-_\s]+/).filter(Boolean);
  const tokens = [lower, ...parts];

  if (parts.length >= 2) {
    tokens.push(parts.join(''));
  }

  return tokens;
}

/**
 * 计算单个示例对每个 feature 的命中分数
 *
 * 评分来源（权重从高到低）：
 * - 文件名命中：权重 3（文件名是最直接的功能标识）
 * - JSDoc title 命中：权重 3
 * - JSDoc desc 命中：权重 2
 * - 代码内容命中：权重 1（避免偶然匹配过度加分）
 */
function scoreExamplePerFeature(
  file: ClassifiedFile,
  featureTokenSets: string[][],
): { total: number; perFeature: number[] } {
  const nameLC = file.name.toLowerCase().replace(/\.[^.]+$/, '');
  const { title, desc } = extractExampleMeta(file.content);
  const titleLC = title.toLowerCase();
  const descLC = desc.toLowerCase();
  const contentLC = file.content.toLowerCase();

  const perFeature: number[] = [];
  let total = 0;

  for (const tokens of featureTokenSets) {
    let featureScore = 0;
    for (const tok of tokens) {
      if (nameLC.includes(tok)) featureScore += 3;
      if (titleLC.includes(tok)) featureScore += 3;
      if (descLC.includes(tok)) featureScore += 2;
      else if (contentLC.includes(tok)) featureScore += 1;
    }
    perFeature.push(featureScore);
    total += featureScore;
  }

  if (nameLC.startsWith('issue-')) {
    total = Math.floor(total * 0.5);
    for (let i = 0; i < perFeature.length; i++) {
      perFeature[i] = Math.floor(perFeature[i] * 0.5);
    }
  }

  return { total, perFeature };
}

/**
 * 根据 relevantFeatures 对示例列表进行相关性排序，保障特征多样性。
 *
 * 策略：先为每个有匹配的 feature 各选出最佳代表示例（避免同类特征垄断 top 位置），
 * 然后按总分补满剩余位置。这确保设计同时涉及多个功能（如 expandable + visible-cols）时，
 * 每个功能的最相关示例都有机会被完整展示。
 */
export function rankExamplesByRelevance(
  examples: ClassifiedFile[],
  relevantFeatures: string[],
): ClassifiedFile[] {
  if (!relevantFeatures.length) return examples;

  const featureTokenSets = relevantFeatures.map(expandFeatureTokens);

  const scored = examples.map((file, idx) => ({
    file,
    ...scoreExamplePerFeature(file, featureTokenSets),
    originalIdx: idx,
  }));

  // Phase 1: 为每个 feature 选出最佳代表（去重），保障多样性
  const selected = new Set<number>();
  const diverseTop: typeof scored = [];

  for (let fi = 0; fi < relevantFeatures.length; fi++) {
    let bestIdx = -1;
    let bestScore = 0;
    for (let ei = 0; ei < scored.length; ei++) {
      const s = scored[ei];
      if (selected.has(ei)) continue;
      if (s.perFeature[fi] > bestScore) {
        bestScore = s.perFeature[fi];
        bestIdx = ei;
      }
    }
    if (bestIdx >= 0 && bestScore > 0) {
      selected.add(bestIdx);
      diverseTop.push(scored[bestIdx]);
    }
  }

  // Phase 2: 按总分降序补充剩余示例
  const remaining = scored
    .filter((_, idx) => !selected.has(idx))
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.originalIdx - b.originalIdx;
    });

  const result = [...diverseTop, ...remaining];

  logger.debug('Ranked examples by relevance (diversity-aware)', {
    features: relevantFeatures,
    diverseTop: diverseTop.map(s => ({ name: s.file.name, total: s.total, perFeature: s.perFeature })),
    topResults: result.slice(0, 5).map(s => ({ name: s.file.name, total: s.total })),
  });

  return result.map(s => s.file);
}
