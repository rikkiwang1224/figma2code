import { join } from 'node:path';
import type { AgentConfig } from './index.js';

let configuredOutputDir: string | null = null;
let configuredReportsDir: string | null = null;

export function configurePaths(options: {
  outputDir?: string;
  reportsDir?: string;
}): void {
  configuredOutputDir = options.outputDir ?? null;
  configuredReportsDir = options.reportsDir ?? null;
}

export function getOutputDir(): string {
  return configuredOutputDir ?? join(process.cwd(), 'output');
}

export function getReportsDir(): string {
  return configuredReportsDir ?? join(process.cwd(), 'reports');
}

export function getConversationOutputDir(
  config: AgentConfig,
  conversationId: string,
): string {
  const base = config.outputDir ?? getOutputDir();
  return join(base, conversationId);
}
