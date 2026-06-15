import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '../../../lib/logger.js';
import { MessageConverter } from '../../engine/MessageConverter.js';
import type { AgentMessage } from '../../types/message.js';
import {
  isAssistantMessage,
  isResultMessage,
  isStreamEvent,
  isSystemMessage,
} from '../../types/sdk.js';
import { SUBMIT_DESIGN_ANALYSIS_FULL_TOOL_ID } from '../../../mcp/index.js';
import { MergedQueryError, type MergedQueryPhase } from '../errors.js';
import type { MergedQueryPerformanceCollector } from '../performanceCollector.js';

const logger = createLogger('Figma2Code.MergedQueryPhaseRunner');

export interface RunMergedQueryPhaseParams {
  prompt: string;
  options: Options;
  performanceCollector?: MergedQueryPerformanceCollector;
}

export interface MergedQueryPhaseResult {
  resultText: string;
  sessionId?: string;
  submittedDesignAnalysis?: unknown;
  submitDesignAnalysisCount: number;
  inferredFolderName?: string;
}

export async function* runMergedQueryPhase(
  params: RunMergedQueryPhaseParams,
): AsyncGenerator<AgentMessage, MergedQueryPhaseResult, unknown> {
  const phase: MergedQueryPhase = 'merged-query';
  const converter = new MessageConverter();
  const textParts: string[] = [];
  let resultText = '';
  let sessionId: string | undefined;
  let inferredFolderName: string | undefined;
  let firstToolName: string | undefined;
  let submittedDesignAnalysis: unknown;
  let submitDesignAnalysisCount = 0;

  logger.info('Merged-query phase started', {
    phase,
    promptLength: params.prompt.length,
  });

  params.performanceCollector?.startPhase({
    promptLength: params.prompt.length,
  });

  try {
    for await (const sdkMessage of query({ prompt: params.prompt, options: params.options })) {
      params.performanceCollector?.observeSdkMessage(sdkMessage);
      sessionId = extractSessionId(sdkMessage) ?? sessionId;

      if (isAssistantMessage(sdkMessage)) {
        const content = sdkMessage.message?.content as any[] | undefined;
        const toolUses = content?.filter((item: any) => item.type === 'tool_use') ?? [];
        for (const toolUse of toolUses) {
          const toolName = toolUse.name || '';
          const input = toolUse.input || {};
          if (!firstToolName && toolName) {
            firstToolName = toolName;
          }
          if (toolName === SUBMIT_DESIGN_ANALYSIS_FULL_TOOL_ID) {
            submittedDesignAnalysis = input.designAnalysis;
            if (isRecord(input.designAnalysis) && typeof input.designAnalysis.inferredFolderName === 'string') {
              inferredFolderName = input.designAnalysis.inferredFolderName;
            }
            submitDesignAnalysisCount += 1;
          }
        }

        const textBlocks = content?.filter((item: any) => item.type === 'text') ?? [];
        for (const block of textBlocks) {
          if (block.text) textParts.push(block.text);
        }
      }

      if (isStreamEvent(sdkMessage) && sdkMessage.event?.type === 'content_block_delta') {
        // Streaming deltas are forwarded for UI responsiveness. We do not collect them
        // because the SDK result message contains the full text.
      }

      if (isResultMessage(sdkMessage)) {
        if (sdkMessage.subtype === 'success') {
          resultText = sdkMessage.result;
        } else {
          throw new MergedQueryError(
            phase,
            `${phase} failed: ${sdkMessage.errors.join(', ')}`,
          );
        }
      }

      const agentMessage = converter.convert(sdkMessage);
      if (!agentMessage) continue;
      if (agentMessage.type === 'system' && agentMessage.subtype === 'result') continue;

      yield {
        ...agentMessage,
        sessionId,
      } as AgentMessage;
    }

    const finalText = resultText || textParts.join('\n');
    if (!finalText.trim()) {
      logger.warn('Merged-query phase completed without result text; downstream flow expects tool submissions', {
        phase,
        sessionId,
      });
    }

    params.performanceCollector?.completePhase({
      sessionId,
      resultLength: finalText.length,
      inferredFolderName,
      firstToolName,
      submitDesignAnalysisCount,
      hasSubmittedDesignAnalysis: submittedDesignAnalysis !== undefined,
    });

    logger.info('Merged-query phase completed', {
      phase,
      sessionId,
      resultLength: finalText.length,
      inferredFolderName,
      firstToolName,
      submitDesignAnalysisCount,
      hasSubmittedDesignAnalysis: submittedDesignAnalysis !== undefined,
    });

    return {
      resultText: finalText,
      sessionId,
      submittedDesignAnalysis,
      submitDesignAnalysisCount,
      inferredFolderName,
    };
  } catch (error) {
    params.performanceCollector?.failPhase(error);
    throw error;
  }
}

function extractSessionId(message: SDKMessage): string | undefined {
  if (isSystemMessage(message) || isAssistantMessage(message) || isResultMessage(message) || isStreamEvent(message)) {
    return message.session_id;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
