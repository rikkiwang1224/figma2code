import { randomUUID } from 'node:crypto';
import { registerAntDesignAdapter } from './adapters/ant-design/register.js';
import { adapterRegistry } from '../config/adapterRegistry.js';
import { MergedQueryAgentService } from './engine/MergedQueryAgentService.js';
import { configurePaths } from '../config/paths.js';
import type { PlatformType } from './types/platform.js';
import type { CodeStyleProfile } from '../types/codeStyle.js';
import type { CodeGenerationContext } from './types/context.js';
import type { AgentMessage } from './types/message.js';
import type { AgentConfig } from '../config/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('Figma2Code');

let initialized = false;

function ensureInitialized(): void {
  if (!initialized) {
    registerAntDesignAdapter();
    initialized = true;
  }
}

export interface GenerateCodeParams {
  figmaUrl: string;
  adapterId?: string;
  conversationId?: string;
  folderName?: string;
  codeStyle?: CodeStyleProfile;
  cursorRules?: string;
  cwd?: string;
  outputDir?: string;
  reportsDir?: string;
  agentConfig?: AgentConfig;
}

export async function* generateCode(
  params: GenerateCodeParams,
): AsyncGenerator<AgentMessage, void, unknown> {
  ensureInitialized();

  const conversationId = params.conversationId ?? randomUUID();
  const adapterId = params.adapterId ?? 'ant-design';

  const { loadAgentConfig } = await import('../config/index.js');
  const agentConfig =
    params.agentConfig ??
    loadAgentConfig({
      cwd: params.cwd,
      outputDir: params.outputDir,
      reportsDir: params.reportsDir,
    });

  configurePaths({
    outputDir: agentConfig.outputDir,
    reportsDir: agentConfig.reportsDir,
  });

  const runtimeAdapter = adapterRegistry.get('pc');
  const agentService = new MergedQueryAgentService(runtimeAdapter, agentConfig);

  const context: CodeGenerationContext = {
    platform: 'pc' as PlatformType,
    adapterId,
    figmaUrl: params.figmaUrl,
    conversationId,
    folder_name: params.folderName,
    codeStyle: params.codeStyle,
    cursorRules: params.cursorRules,
    currentFiles: [],
  };

  logger.info('generateCode started', {
    conversationId,
    adapterId,
    figmaUrl: params.figmaUrl.slice(0, 100),
  });

  yield* agentService.run(
    `请根据这个 Figma 设计稿生成 PC 代码：${params.figmaUrl}`,
    context,
  );
}

export type { AgentMessage } from './types/message.js';
export type { CodeGenerationContext } from './types/context.js';
