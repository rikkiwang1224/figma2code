/**
 * Merged-query only Agent service (no legacy mode, no DB persistence).
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfig } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';
import { configurePaths, getReportsDir } from '../../config/paths.js';
import { MergedQueryFigma2CodeOrchestrator } from '../merged-query/MergedQueryFigma2CodeOrchestrator.js';
import { MergedQueryError } from '../merged-query/errors.js';
import { MergedQueryPerformanceCollector } from '../merged-query/performanceCollector.js';
import type { RuntimeAdapter } from '../adapters/types.js';
import type { CodeGenerationContext } from '../types/context.js';
import type { AgentMessage } from '../types/message.js';

const logger = createLogger('Figma2Code.MergedQueryAgentService');

export class MergedQueryAgentService {
  constructor(
    private readonly runtimeAdapter: RuntimeAdapter,
    private readonly agentConfig: AgentConfig,
  ) {}

  async *run(
    prompt: string,
    context: CodeGenerationContext,
  ): AsyncGenerator<AgentMessage, void, unknown> {
    if (!context.figmaUrl) {
      throw new Error('figmaUrl is required');
    }

    configurePaths({
      outputDir: this.agentConfig.outputDir,
      reportsDir: this.agentConfig.reportsDir,
    });

    const envGuard = this.setupEnvironment();
    const performanceCollector = new MergedQueryPerformanceCollector(context, this.agentConfig);
    let taskStatus: 'completed' | 'failed' = 'failed';
    let stopReason: string | null = null;

    try {
      const orchestrator = new MergedQueryFigma2CodeOrchestrator(
        this.runtimeAdapter,
        this.agentConfig,
        performanceCollector,
      );
      yield* orchestrator.run(prompt, context);
      taskStatus = 'completed';
    } catch (error) {
      const phase = error instanceof MergedQueryError ? error.phase : 'merged-query';
      const message = error instanceof Error ? error.message : String(error);
      stopReason = `[${phase}] ${message}`;
      logger.error('Merged-query execution failed', error, {
        conversationId: context.conversationId,
      });
      yield { type: 'error', error: stopReason };
      throw error;
    } finally {
      performanceCollector.finish({
        taskStatus,
        stopReason,
        codeFiles: [],
        visibleFiles: [],
      });
      this.savePerformanceReport(performanceCollector, context);
      envGuard.restore();
    }
  }

  private setupEnvironment(): { restore: () => void } {
    const original = { ...process.env };
    if (this.agentConfig.baseUrl) {
      process.env.ANTHROPIC_BASE_URL = this.agentConfig.baseUrl;
    }
    if (this.agentConfig.apiKey) {
      process.env.ANTHROPIC_API_KEY = this.agentConfig.apiKey;
    }
    return {
      restore: () => {
        process.env = original;
      },
    };
  }

  private savePerformanceReport(
    collector: MergedQueryPerformanceCollector,
    context: CodeGenerationContext,
  ): void {
    if (!context.conversationId) return;
    try {
      const reportsDir = getReportsDir();
      mkdirSync(reportsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const conversationIdShort = context.conversationId.slice(0, 8);
      const reportPath = join(
        reportsDir,
        `performance_${timestamp}_${conversationIdShort}.json`,
      );
      writeFileSync(
        reportPath,
        JSON.stringify(collector.toSerializableReport(), null, 2),
        'utf-8',
      );
      logger.info('Performance report saved', { reportPath });
    } catch (error) {
      logger.error('Failed to save performance report', error);
    }
  }
}
