import {
  buildMergedCodeGeneratorPrompt,
  getMergedQueryPlatformProfile,
} from './prompts/index.js';
import { resolveStyleFileName } from './types/codeStyle.js';
import { extractFigmaParams } from './runtime/helpers/figmaUtils.js';

export interface PreviewPromptParams {
  figmaUrl: string;
  adapterId?: string;
  folderName?: string;
  outputDir?: string;
  userPrompt?: string;
}

/** 组装 merged-query 完整 prompt（用于调试/预览，不调用 LLM） */
export function previewMergedQueryPrompt(params: PreviewPromptParams): string {
  const adapterId = params.adapterId ?? 'ant-design';
  const profile = getMergedQueryPlatformProfile(adapterId);
  const { fileKey, nodeId } = extractFigmaParams(params.figmaUrl);
  const folderName = params.folderName?.trim() || undefined;

  return buildMergedCodeGeneratorPrompt({
    figmaUrl: params.figmaUrl,
    fileKey,
    nodeId,
    outputDir: params.outputDir ?? './output/preview',
    styleFileName: resolveStyleFileName(),
    folderName,
    shouldInferFolderName: !folderName,
    userPrompt: params.userPrompt,
    platformProfile: profile,
  });
}
