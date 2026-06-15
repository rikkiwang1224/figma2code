import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export interface LlmConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  maxTokens: number;
  enableStreaming: boolean;
  agentCwd: string;
}

export interface FigmaConfig {
  figmaApiKey: string;
  figmaMcpPort: number;
}

export interface AgentConfig {
  apiKey?: string;
  baseUrl?: string;
  figmaApiKey?: string;
  figmaMcpPort?: number;
  defaultModel?: string;
  maxTokens?: number;
  cwd?: string;
  enableStreaming?: boolean;
  outputDir?: string;
  reportsDir?: string;
}

function loadLlmConfig(agentCwd: string): LlmConfig {
  const apiKey =
    process.env.FIGMA2CODE_API_TOKEN ||
    process.env.API_TOKEN ||
    process.env.ANTHROPIC_API_KEY ||
    '';

  return {
    apiKey,
    baseUrl: process.env.FIGMA2CODE_BASE_URL || process.env.BASE_URL || '',
    defaultModel:
      process.env.FIGMA2CODE_MODEL || process.env.MODEL || 'claude-sonnet-4-5',
    maxTokens: process.env.FIGMA2CODE_MAX_TOKENS
      ? Number(process.env.FIGMA2CODE_MAX_TOKENS)
      : 16000,
    enableStreaming:
      process.env.FIGMA2CODE_ENABLE_STREAMING === 'true' ||
      process.env.FIGMA2CODE_ENABLE_STREAMING === '1',
    agentCwd,
  };
}

function loadFigmaConfig(): FigmaConfig {
  return {
    figmaApiKey: process.env.FIGMA_API_KEY ?? '',
    figmaMcpPort: process.env.FIGMA2CODE_MCP_PORT
      ? Number(process.env.FIGMA2CODE_MCP_PORT)
      : 3333,
  };
}

export function validateLlmConfig(config: LlmConfig): void {
  if (!config.apiKey?.trim()) {
    throw new Error(
      'API Key is required. Set ANTHROPIC_API_KEY or FIGMA2CODE_API_TOKEN.',
    );
  }
}

export function validateFigmaConfig(config: FigmaConfig): void {
  if (!config.figmaApiKey?.trim()) {
    throw new Error('FIGMA_API_KEY is required.');
  }
}

export interface LoadAgentConfigOptions {
  cwd?: string;
  agentCwd?: string;
  outputDir?: string;
  reportsDir?: string;
}

let cachedAgentConfig: AgentConfig | null = null;

export function loadAgentConfig(options: LoadAgentConfigOptions = {}): AgentConfig {
  const cwd = options.cwd ?? process.cwd();
  const agentCwd = resolve(
    cwd,
    options.agentCwd ||
      process.env.FIGMA2CODE_AGENT_CWD ||
      PACKAGE_ROOT,
  );
  const outputDir = resolve(
    cwd,
    options.outputDir || process.env.FIGMA2CODE_OUTPUT_DIR || 'output',
  );
  const reportsDir = resolve(
    cwd,
    options.reportsDir || process.env.FIGMA2CODE_REPORTS_DIR || 'reports',
  );

  const llm = loadLlmConfig(agentCwd);
  validateLlmConfig(llm);
  const figma = loadFigmaConfig();
  validateFigmaConfig(figma);

  return {
    ...llm,
    figmaApiKey: figma.figmaApiKey,
    figmaMcpPort: figma.figmaMcpPort,
    cwd: llm.agentCwd,
    outputDir,
    reportsDir,
  };
}

export function getAgentConfig(options?: LoadAgentConfigOptions): AgentConfig {
  if (options) {
    return loadAgentConfig(options);
  }

  if (!cachedAgentConfig) {
    cachedAgentConfig = loadAgentConfig();
  }

  return cachedAgentConfig;
}

export function resetAgentConfigCache(): void {
  cachedAgentConfig = null;
}

export {
  configurePaths,
  getOutputDir,
  getReportsDir,
  getConversationOutputDir,
} from './paths.js';

export { AdapterRegistry, adapterRegistry } from './adapterRegistry.js';
