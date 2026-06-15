import { randomUUID } from 'node:crypto';
import type { AgentConfig } from './config/index.js';
import type { AgentMessage } from './runtime/types/message.js';
import {
  configurePaths,
  getOutputDir,
  getReportsDir,
  getConversationOutputDir,
  loadAgentConfig,
} from './config/index.js';

export type { AgentConfig } from './config/index.js';
export {
  getAgentConfig,
  loadAgentConfig,
  resetAgentConfigCache,
} from './config/index.js';

export {
  buildMergedCodeGeneratorPrompt,
  getMergedQueryPlatformProfile,
  type BuildMergedCodeGeneratorPromptParams,
  type MergedQueryPlatformProfile,
} from './prompts/index.js';

export type { CodeStyleProfile } from './types/codeStyle.js';
export { resolveStyleFileName } from './types/codeStyle.js';

export type { AgentMessage } from './runtime/types/message.js';

export interface GenerateCodeParams {
  figmaUrl: string;
  adapterId?: string;
  conversationId?: string;
  folderName?: string;
  codeStyle?: import('./types/codeStyle.js').CodeStyleProfile;
  cursorRules?: string;
  cwd?: string;
  outputDir?: string;
  reportsDir?: string;
  agentConfig?: AgentConfig;
}

export async function* generateCode(
  params: GenerateCodeParams,
): AsyncGenerator<AgentMessage, void, unknown> {
  const { loadAgentConfig } = await import('./config/index.js');
  const config =
    params.agentConfig ??
    loadAgentConfig({
      cwd: params.cwd,
      outputDir: params.outputDir,
      reportsDir: params.reportsDir,
    });

  configurePaths({
    outputDir: config.outputDir,
    reportsDir: config.reportsDir,
  });

  const { generateCode: runAgent } = await import('./runtime/generate.js');
  const conversationId = params.conversationId ?? randomUUID();

  yield* runAgent({
    ...params,
    conversationId,
    agentConfig: config,
  });
}

export { getOutputDir, getReportsDir, getConversationOutputDir };

export { previewMergedQueryPrompt, type PreviewPromptParams } from './preview.js';
