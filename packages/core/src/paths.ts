import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfig } from './config/index.js';

export function getOutputDir(config: AgentConfig): string {
  const dir = config.outputDir ?? join(process.cwd(), 'output');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getReportsDir(config: AgentConfig): string {
  const dir = config.reportsDir ?? join(process.cwd(), 'reports');
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getConversationOutputDir(
  config: AgentConfig,
  conversationId: string,
): string {
  const dir = join(getOutputDir(config), conversationId);
  mkdirSync(dir, { recursive: true });
  return dir;
}
