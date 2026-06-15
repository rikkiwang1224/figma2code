import { existsSync, readdirSync, readFileSync } from 'fs';
import { basename, join, normalize, relative, resolve } from 'path';
import type { CodeFile, CodeFileType } from '../../types/code.js';
import { isWithinDirectory } from './pathSafety.js';

const RUNTIME_FILES = new Set([
  '.codegen-input.json',
  '.codegen-result.json',
]);

export interface CollectGeneratedFilesParams {
  outputDir: string;
}

export interface CollectGeneratedFilesResult {
  files: CodeFile[];
  warnings: string[];
}

export function collectGeneratedFiles(
  params: CollectGeneratedFilesParams,
): CollectGeneratedFilesResult {
  return collectFiles(params, { includeRuntimeFiles: false });
}

export function collectDbArtifactFiles(
  params: CollectGeneratedFilesParams,
): CollectGeneratedFilesResult {
  return collectFiles(params, { includeRuntimeFiles: true });
}

function collectFiles(
  params: CollectGeneratedFilesParams,
  options: { includeRuntimeFiles: boolean },
): CollectGeneratedFilesResult {
  const outputDir = normalize(resolve(params.outputDir));
  const warnings: string[] = [];
  const files: CodeFile[] = [];

  if (!existsSync(outputDir)) {
    return {
      files,
      warnings: [`output directory does not exist: ${outputDir}`],
    };
  }

  const relativePaths = scanFiles(outputDir, outputDir, warnings).sort();
  for (const relativePath of relativePaths) {
    if (!options.includeRuntimeFiles && RUNTIME_FILES.has(basename(relativePath))) continue;

    const absolutePath = normalize(resolve(join(outputDir, relativePath)));
    if (!isWithinDirectory(absolutePath, outputDir)) {
      warnings.push(`generated file path escapes output directory and was ignored: ${relativePath}`);
      continue;
    }

    try {
      files.push({
        name: normalize(relativePath),
        type: inferFileType(relativePath),
        content: readFileSync(absolutePath, 'utf-8'),
      });
    } catch (error) {
      warnings.push(`failed to read generated file and it was ignored: ${relativePath}`);
    }
  }

  return { files, warnings };
}

function scanFiles(dir: string, baseDir: string, warnings: string[]): string[] {
  const result: string[] = [];

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    warnings.push(`failed to scan output directory: ${dir}`);
    return result;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...scanFiles(fullPath, baseDir, warnings));
      continue;
    }
    if (!entry.isFile()) continue;

    const relativePath = relative(baseDir, fullPath);
    if (relativePath && !relativePath.startsWith('..')) {
      result.push(relativePath);
    }
  }

  return result;
}

function inferFileType(filename: string): CodeFileType {
  if (filename.endsWith('.tsx')) return 'tsx';
  if (filename.endsWith('.ts')) return 'ts';
  if (filename.endsWith('.jsx')) return 'jsx';
  if (filename.endsWith('.js')) return 'js';
  if (filename.endsWith('.less')) return 'less';
  if (filename.endsWith('.css')) return 'css';
  if (filename.endsWith('.scss')) return 'scss';
  if (filename.endsWith('.json')) return 'json';
  return 'tsx';
}
