import { mkdirSync } from 'fs';
import { join } from 'path';
import type { AgentConfig } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { getOutputDir } from '../../config/paths.js';
import { extractFigmaParams } from '../helpers/figmaUtils.js';
import type { RuntimeAdapter } from '../adapters/types.js';
import type { CodeFile } from '../types/code.js';
import type { CodeGenerationContext } from '../types/context.js';
import type { AgentMessage } from '../types/message.js';
import { resolveStyleFileName } from '../../types/codeStyle.js';
import { MergedQueryError } from './errors.js';
import { collectDbArtifactFiles, collectGeneratedFiles } from './finalization/generatedFiles.js';
import type { MergedQueryPerformanceCollector } from './performanceCollector.js';
import { buildMergedQueryPhaseOptions } from './phase/phaseOptions.js';
import { runMergedQueryPhase } from './phase/phaseRunner.js';
import { buildMergedCodeGeneratorPrompt } from '../../prompts/merged-query/mergedCodeGeneratorPrompt.js';
import { getMergedQueryPlatformProfile } from '../../prompts/merged-query/platforms/index.js';

const logger = createLogger('Figma2Code.MergedQueryOrchestrator');
const FOLDER_NAME_PATTERN = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/;

type FolderNameSource =
  | 'user'
  | 'designAnalysis'
  | 'generatedFiles'
  | 'conversationId';

interface ResolvedFolderName {
  value: string;
  source: FolderNameSource;
  warnings: string[];
}

export interface MergedQueryRunResult {
  visibleFiles: CodeFile[];
  dbArtifactFiles: CodeFile[];
}

export class MergedQueryFigma2CodeOrchestrator {
  constructor(
    private readonly runtimeAdapter: RuntimeAdapter,
    private readonly agentConfig: AgentConfig,
    private readonly performanceCollector?: MergedQueryPerformanceCollector,
  ) {}

  async *run(
    prompt: string,
    context: CodeGenerationContext,
  ): AsyncGenerator<AgentMessage, MergedQueryRunResult, unknown> {
    if (!context.figmaUrl) {
      throw new MergedQueryError('merged-query', 'merged-query mode requires figmaUrl');
    }

    const adapterId = context.adapterId ?? 'ant-design';
    const platformProfile = getMergedQueryPlatformProfile(adapterId);
    const { fileKey, nodeId } = extractFigmaParams(context.figmaUrl);
    if (!fileKey || !nodeId) {
      throw new MergedQueryError('merged-query', 'Failed to extract fileKey/nodeId from figmaUrl');
    }

    const outputDir = join(getOutputDir(), context.conversationId);
    const styleFileName = resolveStyleFileName(context.codeStyle);
    mkdirSync(outputDir, { recursive: true });

    logger.info('Merged-query figma2code started', {
      conversationId: context.conversationId,
      requestId: context.requestId,
      platform: platformProfile.platform,
      fileKey,
      nodeId,
      outputDir,
      styleFileName,
    });

    const userFolderName = normalizeFolderName(context.folder_name);
    const mergedPrompt = buildMergedCodeGeneratorPrompt({
      figmaUrl: context.figmaUrl,
      fileKey,
      nodeId,
      outputDir,
      styleFileName,
      folderName: userFolderName,
      shouldInferFolderName: !userFolderName,
      codeStyle: context.codeStyle,
      cursorRules: context.cursorRules,
      userPrompt: prompt,
      platformProfile,
    });
    const mergedOptions = buildMergedQueryPhaseOptions({
      runtimeAdapter: this.runtimeAdapter,
      context,
      agentConfig: this.agentConfig,
      outputDir,
      performanceCollector: this.performanceCollector,
    });

    const mergedResult = yield* runMergedQueryPhase({
      prompt: mergedPrompt,
      options: mergedOptions,
      performanceCollector: this.performanceCollector,
    });

    const { files: visibleFiles, warnings } = collectGeneratedFiles({ outputDir });
    const { files: dbArtifactFiles, warnings: artifactWarnings } = collectDbArtifactFiles({ outputDir });
    if (visibleFiles.length === 0) {
      const error = new MergedQueryError('merged-query', 'Merged query did not write any code files');
      this.performanceCollector?.failPhase(error, {
        warningsCount: warnings.length,
        submitDesignAnalysisCount: mergedResult.submitDesignAnalysisCount,
      });
      throw error;
    }

    const resolvedFolderName = resolveFolderNameForCodegen({
      userFolderName: context.folder_name,
      designAnalysis: mergedResult.submittedDesignAnalysis,
      generatedFiles: visibleFiles,
      fallback: context.conversationId,
    });
    const folderNameWarnings = resolvedFolderName.warnings.map((warning) => `folderName: ${warning}`);
    const submitWarnings = mergedResult.submitDesignAnalysisCount === 1
      ? []
      : [`merged-query: expected exactly one submit_design_analysis call, got ${mergedResult.submitDesignAnalysisCount}`];
    const allWarnings = [...warnings, ...folderNameWarnings, ...submitWarnings];

    if (allWarnings.length > 0 || artifactWarnings.length > 0) {
      logger.warn('Merged-query finalization completed with warnings', {
        conversationId: context.conversationId,
        warnings: allWarnings,
        artifactWarnings,
      });
    }

    if (resolvedFolderName.value && !context.folder_name) {
      yield {
        type: 'system',
        subtype: 'folder_name',
        folder_name: resolvedFolderName.value,
      };
    }

    const resultMetadata = allWarnings.length > 0
      ? {
          warnings: allWarnings,
          folderName: {
            value: resolvedFolderName.value,
            source: resolvedFolderName.source,
            ...(resolvedFolderName.warnings.length > 0 && {
              warnings: resolvedFolderName.warnings,
            }),
          },
        }
      : undefined;

    yield {
      type: 'system',
      subtype: 'result',
      files: visibleFiles,
      folder_name: resolvedFolderName.value,
      ...(resultMetadata && { result: resultMetadata }),
    };

    logger.info('Merged-query figma2code completed', {
      conversationId: context.conversationId,
      filesCount: visibleFiles.length,
      artifactFilesCount: dbArtifactFiles.length,
      folderName: resolvedFolderName.value,
      folderNameSource: resolvedFolderName.source,
      submitDesignAnalysisCount: mergedResult.submitDesignAnalysisCount,
    });

    return {
      visibleFiles,
      dbArtifactFiles,
    };
  }
}

function resolveFolderNameForCodegen(params: {
  userFolderName?: unknown;
  designAnalysis: unknown;
  generatedFiles?: CodeFile[];
  fallback: string;
}): ResolvedFolderName {
  const warnings: string[] = [];
  const userFolderName = normalizeFolderName(params.userFolderName);
  if (userFolderName) {
    return {
      value: userFolderName,
      source: 'user',
      warnings,
    };
  }

  const rawDesignAnalysisFolderName = isRecord(params.designAnalysis)
    ? params.designAnalysis.inferredFolderName
    : undefined;
  let designAnalysisFolderName = normalizeFolderName(rawDesignAnalysisFolderName);

  if (designAnalysisFolderName && !FOLDER_NAME_PATTERN.test(designAnalysisFolderName)) {
    warnings.push(`ignored invalid designAnalysis.inferredFolderName "${designAnalysisFolderName}"`);
    designAnalysisFolderName = undefined;
  }
  if (designAnalysisFolderName) {
    return {
      value: designAnalysisFolderName,
      source: 'designAnalysis',
      warnings,
    };
  }

  const generatedFolderName = inferFolderNameFromGeneratedFiles(params.generatedFiles);
  if (generatedFolderName) {
    warnings.push('designAnalysis.inferredFolderName is missing; using generated file folder');
    return {
      value: generatedFolderName,
      source: 'generatedFiles',
      warnings,
    };
  }

  warnings.push('designAnalysis.inferredFolderName is missing; using conversationId');
  return {
    value: params.fallback,
    source: 'conversationId',
    warnings,
  };
}

function inferFolderNameFromGeneratedFiles(files?: CodeFile[]): string | undefined {
  if (!files?.length) return undefined;
  const firstSegments = files
    .map((file) => file.name.split(/[\\/]/)[0])
    .filter((segment) => segment && !segment.includes('.'));
  const [firstSegment] = firstSegments;
  if (!firstSegment) return undefined;
  if (!FOLDER_NAME_PATTERN.test(firstSegment)) return undefined;
  return firstSegment;
}

function normalizeFolderName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\/+$/, '');
  return normalized ? normalized : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
