export interface GenerateCodeParams {
  figmaUrl: string;
  adapterId?: string;
  conversationId?: string;
  folderName?: string;
  cwd?: string;
  outputDir?: string;
}

export interface AgentMessage {
  type: string;
  [key: string]: unknown;
}

/**
 * Public entry for code generation.
 * Phase 1 will wire this to the migrated AgentService + merged-query orchestrator.
 */
export async function* generateCode(
  params: GenerateCodeParams,
): AsyncGenerator<AgentMessage, void, unknown> {
  const { loadAgentConfig } = await import('./config/index.js');
  const config = loadAgentConfig({
    cwd: params.cwd,
    outputDir: params.outputDir,
  });

  if (config.agentMode !== 'merged-query') {
    throw new Error(
      `Agent mode "${config.agentMode}" is not implemented in open-source core yet. Use merged-query.`,
    );
  }

  yield {
    type: 'system',
    subtype: 'init',
    message: 'Figma2Code core migration in progress. Agent engine will be wired in Phase 1.',
    agentMode: config.agentMode,
    figmaUrl: params.figmaUrl,
    adapterId: params.adapterId ?? 'ant-design',
  };

  throw new Error(
    'Agent engine not migrated yet. Next step: copy agent-server/src/agent into packages/core/src/agent.',
  );
}

export {
  loadAgentConfig,
  getAgentConfig,
  resetAgentConfigCache,
  type AgentConfig,
  type AgentMode,
} from './config/index.js';

export {
  getOutputDir,
  getReportsDir,
  getConversationOutputDir,
} from './paths.js';
