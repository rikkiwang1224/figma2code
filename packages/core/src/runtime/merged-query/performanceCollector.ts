import type {
  HookCallback,
  HookInput,
  Options,
  PostToolUseFailureHookInput,
  PostToolUseHookInput,
  PreToolUseHookInput,
  SDKMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { createLogger } from '../../lib/logger.js';
import type { AgentConfig } from '../../config/index.js';
import { getModelPricing } from '../monitoring/ModelPricing.js';
import type { ModelCost, TokenUsage, ToolCallStats } from '../monitoring/types.js';
import type { CodeFile } from '../types/code.js';
import type { CodeGenerationContext } from '../types/context.js';
import {
  isAssistantMessage,
  isResultMessage,
  isSystemMessage,
  isUserMessage,
} from '../types/sdk.js';
import { WRITE_CODE_FILE_FULL_TOOL_ID } from '../../mcp/code-output/index.js';
import type { MergedQueryPhase } from './errors.js';

const logger = createLogger('Figma2Code.MergedQueryPerformance');

type MergedQueryTaskStatus = 'completed' | 'failed';
type MergedQueryPhaseStatus = 'running' | 'completed' | 'failed';

type PhaseRecord = {
  phase: MergedQueryPhase;
  status: MergedQueryPhaseStatus;
  startTime: Date;
  endTime?: Date;
  durationSec?: number;
  promptLength?: number;
  resultLength?: number;
  sessionId?: string;
  error?: string;
  metadata?: Record<string, unknown>;
};

type MutableToolCall = {
  toolName: string;
  toolUseId?: string;
  timestamp: number;
  duration: number;
  input: Record<string, unknown>;
  contentLength?: number;
  phase?: MergedQueryPhase;
  startedAtMs?: number;
};

export class MergedQueryPerformanceCollector {
  private readonly startTime = new Date();
  private endTime?: Date;
  private activePhase?: MergedQueryPhase;
  private taskStatus: MergedQueryTaskStatus = 'failed';
  private stopReason: string | null = null;
  private codeFiles: CodeFile[] = [];
  private visibleFiles: CodeFile[] = [];

  private readonly phases: PhaseRecord[] = [];
  private readonly phaseSessionIds = new Map<MergedQueryPhase, string>();
  private readonly toolCallsById = new Map<string, MutableToolCall>();
  private readonly anonymousToolCalls: MutableToolCall[] = [];
  private readonly toolCallOrder: MutableToolCall[] = [];
  private readonly modelUsageCosts = new Map<string, number>();
  private readonly permissionDenials: Array<Record<string, unknown>> = [];
  private readonly billablePhasesStarted = new Set<MergedQueryPhase>();
  private readonly phasesWithUsage = new Set<MergedQueryPhase>();
  private readonly phasesWithCost = new Set<MergedQueryPhase>();

  private hasUsage = false;
  private hasCost = false;
  private totalCostUsd = 0;
  private totalTurns = 0;
  private modelName: string;

  private readonly tokenUsage: TokenUsage = {
    cacheReadInputTokens: 0,
    cacheCreationTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalInputTokens: 0,
    totalTokens: 0,
  };

  constructor(
    private readonly context: CodeGenerationContext,
    private readonly agentConfig: AgentConfig,
  ) {
    this.modelName = agentConfig.defaultModel || 'unknown';
  }

  createHooks(): NonNullable<Options['hooks']> {
    return {
      PreToolUse: [
        {
          matcher: '.*',
          hooks: [this.onPreToolUse],
        },
      ],
      PostToolUse: [
        {
          matcher: '.*',
          hooks: [this.onPostToolUse],
        },
      ],
      PostToolUseFailure: [
        {
          matcher: '.*',
          hooks: [this.onPostToolUseFailure],
        },
      ],
    };
  }

  startPhase(
    metadata: Record<string, unknown> = {},
  ): void {
    const phase: MergedQueryPhase = 'merged-query';
    const promptLength = toOptionalNumber(metadata.promptLength);
    this.activePhase = phase;
    this.billablePhasesStarted.add(phase);
    this.phases.push({
      phase,
      status: 'running',
      startTime: new Date(),
      ...(promptLength !== undefined && { promptLength }),
      metadata: omitUndefined(metadata),
    });
  }

  completePhase(
    metadata: Record<string, unknown> = {},
  ): void {
    const phase: MergedQueryPhase = 'merged-query';
    const record = this.findPhaseRecord(phase);
    if (!record) return;

    const now = new Date();
    record.status = 'completed';
    record.endTime = now;
    record.durationSec = durationSec(record.startTime, now);
    record.metadata = {
      ...(record.metadata ?? {}),
      ...omitUndefined(metadata),
    };

    const resultLength = toOptionalNumber(metadata.resultLength);
    if (resultLength !== undefined) record.resultLength = resultLength;
    const sessionId = toOptionalString(metadata.sessionId);
    if (sessionId) record.sessionId = sessionId;

    if (this.activePhase === phase) this.activePhase = undefined;
  }

  failPhase(
    error: unknown,
    metadata: Record<string, unknown> = {},
  ): void {
    const phase: MergedQueryPhase = 'merged-query';
    let record = this.findPhaseRecord(phase);
    if (!record) {
      record = {
        phase,
        status: 'running',
        startTime: new Date(),
      };
      this.phases.push(record);
    }

    const now = new Date();
    record.status = 'failed';
    record.endTime = now;
    record.durationSec = durationSec(record.startTime, now);
    record.error = normalizeError(error);
    record.metadata = {
      ...(record.metadata ?? {}),
      ...omitUndefined(metadata),
    };

    if (this.activePhase === phase) this.activePhase = undefined;
  }

  observeSdkMessage(message: SDKMessage): void {
    const phase: MergedQueryPhase = 'merged-query';
    try {
      const sessionId = extractSessionId(message);
      if (sessionId) {
        this.phaseSessionIds.set(phase, sessionId);
        const phaseRecord = this.findPhaseRecord(phase);
        if (phaseRecord) phaseRecord.sessionId = sessionId;
      }

      if (isSystemMessage(message)) {
        this.noteModel((message as { model?: string }).model);
      }

      if (isAssistantMessage(message)) {
        this.observeAssistantMessage(phase, message);
      }

      if (isUserMessage(message)) {
        this.observeUserMessage(message);
      }

      if (isResultMessage(message)) {
        this.observeResultMessage(phase, message);
      }
    } catch (error) {
      logger.warn('Failed to observe merged-query SDK message', {
        conversationId: this.context.conversationId,
        phase,
        error: String(error),
      });
    }
  }

  finish(params: {
    taskStatus: MergedQueryTaskStatus;
    stopReason?: string | null;
    codeFiles?: CodeFile[];
    visibleFiles?: CodeFile[];
  }): void {
    this.endTime = new Date();
    this.taskStatus = params.taskStatus;
    this.stopReason = params.stopReason ?? this.stopReason;
    this.codeFiles = params.codeFiles ?? [];
    this.visibleFiles = params.visibleFiles ?? this.codeFiles;

    if (this.activePhase) {
      if (params.taskStatus === 'completed') {
        this.completePhase();
      } else {
        this.failPhase(this.stopReason ?? 'merged-query failed');
      }
    }
  }

  hasCompleteBillingMetrics(): boolean {
    if (this.billablePhasesStarted.size === 0) return false;

    for (const phase of this.billablePhasesStarted) {
      if (!this.phasesWithUsage.has(phase)) return false;
      if (!this.phasesWithCost.has(phase)) return false;
    }

    return true;
  }

  toSerializableReport(): Record<string, unknown> {
    const endTime = this.endTime ?? new Date();
    const toolCalls = this.buildToolCallsRecord();
    const toolCallTotalCount = countToolCalls(toolCalls);
    const model = this.buildModelCost();
    const inputMetadata = this.buildInputMetadata();
    const skillNames = this.buildSkillNames();

    return {
      conversationId: this.context.conversationId,
      sdkSessionId: this.getPrimarySessionId(),
      figmaUrl: this.context.figmaUrl,
      platform: this.context.platform,
      mode: 'merged-query',
      startTime: formatDateTime(this.startTime),
      endTime: formatDateTime(endTime),
      totalDurationSec: durationSec(this.startTime, endTime),
      totalCostUsd: this.totalCostUsd,
      toolCallTotalCount,
      tokenUsage: { ...this.tokenUsage },
      model,
      status: {
        completed: this.taskStatus === 'completed',
        stopReason: this.stopReason ?? undefined,
        hasCodeResult: this.visibleFiles.length > 0,
      },
      conversation: {
        rounds: 1,
        userPrompts: 1,
      },
      toolCalls,
      mergedQuery: {
        input: inputMetadata,
        skillNames,
        metricsPartial: !this.hasCompleteBillingMetrics(),
        billing: {
          usageObserved: this.hasUsage,
          costObserved: this.hasCost,
          billablePhasesStarted: Array.from(this.billablePhasesStarted),
          phasesWithUsage: Array.from(this.phasesWithUsage),
          phasesWithCost: Array.from(this.phasesWithCost),
        },
        phases: this.phases.map((phase) => ({
          phase: phase.phase,
          status: phase.status,
          startTime: formatDateTime(phase.startTime),
          endTime: phase.endTime ? formatDateTime(phase.endTime) : undefined,
          durationSec: phase.durationSec,
          promptLength: phase.promptLength,
          resultLength: phase.resultLength,
          sessionId: phase.sessionId,
          error: phase.error,
          metadata: this.buildPhaseMetadata(phase),
        })),
        sdkSessionIds: Object.fromEntries(this.phaseSessionIds),
        totalTurns: this.totalTurns,
        modelUsageCosts: Object.fromEntries(this.modelUsageCosts),
        permissionDenials: this.permissionDenials,
        generatedFileCount: this.visibleFiles.length,
        artifactFileCount: this.codeFiles.length,
        generatedFiles: this.visibleFiles.map((file) => file.name),
        artifactFiles: this.codeFiles.map((file) => file.name),
      },
    };
  }

  toDbPayload(): null {
    return null;
  }

  private readonly onPreToolUse: HookCallback = async (input: HookInput) => {
    try {
      const toolInput = input as PreToolUseHookInput;
      const call = this.ensureToolCall({
        toolUseId: toolInput.tool_use_id,
        toolName: toolInput.tool_name,
        input: asRecord(toolInput.tool_input),
        phase: this.activePhase,
      });
      const now = Date.now();
      call.startedAtMs = now;
      call.timestamp = this.relativeSec(now);
    } catch (error) {
      logger.warn('Failed to observe PreToolUse hook', {
        conversationId: this.context.conversationId,
        error: String(error),
      });
    }
    return {};
  };

  private readonly onPostToolUse: HookCallback = async (input: HookInput) => {
    try {
      const toolInput = input as PostToolUseHookInput;
      const call = this.ensureToolCall({
        toolUseId: toolInput.tool_use_id,
        toolName: toolInput.tool_name,
        input: asRecord(toolInput.tool_input),
        phase: this.activePhase,
      });
      const now = Date.now();
      call.duration = call.startedAtMs ? now - call.startedAtMs : call.duration;
      call.contentLength = contentLength(toolInput.tool_response);
    } catch (error) {
      logger.warn('Failed to observe PostToolUse hook', {
        conversationId: this.context.conversationId,
        error: String(error),
      });
    }
    return {};
  };

  private readonly onPostToolUseFailure: HookCallback = async (input: HookInput) => {
    try {
      const toolInput = input as PostToolUseFailureHookInput;
      const call = this.ensureToolCall({
        toolUseId: toolInput.tool_use_id,
        toolName: toolInput.tool_name,
        input: asRecord(toolInput.tool_input),
        phase: this.activePhase,
      });
      const now = Date.now();
      call.duration = call.startedAtMs ? now - call.startedAtMs : call.duration;
      call.contentLength = toolInput.error.length;
    } catch (error) {
      logger.warn('Failed to observe PostToolUseFailure hook', {
        conversationId: this.context.conversationId,
        error: String(error),
      });
    }
    return {};
  };

  private observeAssistantMessage(phase: MergedQueryPhase, message: SDKMessage): void {
    const content = (message as { message?: { content?: unknown[]; model?: string } }).message?.content;
    this.noteModel((message as { message?: { model?: string } }).message?.model);
    if (!Array.isArray(content)) return;

    for (const block of content) {
      const item = block as {
        type?: string;
        id?: string;
        name?: string;
        input?: unknown;
      };
      if (item.type !== 'tool_use' || !item.name) continue;
      this.ensureToolCall({
        toolUseId: item.id,
        toolName: item.name,
        input: asRecord(item.input),
        phase,
      });
    }
  }

  private observeUserMessage(message: SDKMessage): void {
    const raw = message as {
      parent_tool_use_id?: string;
      tool_use_result?: unknown;
    };
    const results = Array.isArray(raw.tool_use_result)
      ? raw.tool_use_result
      : raw.tool_use_result !== undefined
        ? [raw.tool_use_result]
        : [];

    for (const result of results) {
      const resultObject = asRecord(result);
      const toolUseId = toOptionalString(resultObject.tool_use_id) ?? raw.parent_tool_use_id;
      if (!toolUseId) continue;
      const call = this.toolCallsById.get(toolUseId);
      if (call) {
        call.contentLength = contentLength(result);
      }
    }
  }

  private observeResultMessage(phase: MergedQueryPhase, message: SDKMessage): void {
    const raw = message as {
      usage?: Record<string, unknown>;
      total_cost_usd?: unknown;
      num_turns?: unknown;
      modelUsage?: Record<string, unknown>;
      permission_denials?: unknown[];
      errors?: string[];
    };

    const phaseRecord = this.findPhaseRecord(phase);
    if (phaseRecord) {
      phaseRecord.sessionId = extractSessionId(message) ?? phaseRecord.sessionId;
    }

    let sawUsage = false;
    if (raw.usage) {
      this.addUsage(raw.usage);
      sawUsage = true;
    } else if (raw.modelUsage) {
      sawUsage = this.addUsageFromModelUsage(raw.modelUsage);
    }
    if (sawUsage) this.phasesWithUsage.add(phase);

    const modelUsageCost = raw.modelUsage
      ? this.addModelUsageCosts(raw.modelUsage)
      : undefined;
    const cost = toOptionalNumber(raw.total_cost_usd);
    let sawCost = false;
    if (cost !== undefined) {
      this.totalCostUsd += cost;
      this.hasCost = true;
      sawCost = true;
    } else if (modelUsageCost !== undefined) {
      this.totalCostUsd += modelUsageCost;
      this.hasCost = true;
      sawCost = true;
    }
    if (sawCost) this.phasesWithCost.add(phase);

    const turns = toOptionalNumber(raw.num_turns);
    if (turns !== undefined) this.totalTurns += turns;

    if (Array.isArray(raw.permission_denials) && raw.permission_denials.length > 0) {
      for (const denial of raw.permission_denials) {
        this.permissionDenials.push({
          phase,
          ...asRecord(denial),
        });
      }
    }

    if (Array.isArray(raw.errors) && raw.errors.length > 0) {
      this.stopReason = raw.errors.join(', ');
    }
  }

  private addUsage(usage: Record<string, unknown>): void {
    this.tokenUsage.cacheReadInputTokens += numberFrom(usage.cache_read_input_tokens);
    this.tokenUsage.cacheCreationTokens += numberFrom(usage.cache_creation_input_tokens);
    this.tokenUsage.inputTokens += numberFrom(usage.input_tokens);
    this.tokenUsage.outputTokens += numberFrom(usage.output_tokens);
    this.recalculateTokenTotals();
    this.hasUsage = true;
  }

  private addUsageFromModelUsage(modelUsage: Record<string, unknown>): boolean {
    let sawModelUsage = false;
    for (const [modelName, value] of Object.entries(modelUsage)) {
      const usage = asRecord(value);
      this.noteModel(modelName);
      this.tokenUsage.cacheReadInputTokens += numberFrom(usage.cacheReadInputTokens);
      this.tokenUsage.cacheCreationTokens += numberFrom(usage.cacheCreationInputTokens);
      this.tokenUsage.inputTokens += numberFrom(usage.inputTokens);
      this.tokenUsage.outputTokens += numberFrom(usage.outputTokens);
      sawModelUsage = true;
    }
    if (!sawModelUsage) return false;
    this.recalculateTokenTotals();
    this.hasUsage = true;
    return true;
  }

  private addModelUsageCosts(modelUsage: Record<string, unknown>): number | undefined {
    let total = 0;
    let sawCost = false;
    for (const [modelName, value] of Object.entries(modelUsage)) {
      this.noteModel(modelName);
      const cost = toOptionalNumber(asRecord(value).costUSD);
      if (cost === undefined) continue;
      this.modelUsageCosts.set(
        modelName,
        (this.modelUsageCosts.get(modelName) ?? 0) + cost,
      );
      total += cost;
      sawCost = true;
    }
    return sawCost ? total : undefined;
  }

  private recalculateTokenTotals(): void {
    this.tokenUsage.totalInputTokens =
      this.tokenUsage.cacheReadInputTokens +
      this.tokenUsage.cacheCreationTokens +
      this.tokenUsage.inputTokens;
    this.tokenUsage.totalTokens =
      this.tokenUsage.totalInputTokens + this.tokenUsage.outputTokens;
  }

  private ensureToolCall(params: {
    toolUseId?: string;
    toolName: string;
    input: Record<string, unknown>;
    phase?: MergedQueryPhase;
  }): MutableToolCall {
    const toolUseId = params.toolUseId;
    if (toolUseId) {
      const existing = this.toolCallsById.get(toolUseId);
      if (existing) {
        existing.toolName = params.toolName || existing.toolName;
        existing.input = Object.keys(params.input).length > 0 ? params.input : existing.input;
        existing.phase = params.phase ?? existing.phase;
        return existing;
      }
    }

    const call: MutableToolCall = {
      toolName: params.toolName || 'unknown',
      toolUseId,
      timestamp: this.relativeSec(),
      duration: 0,
      input: params.input,
      phase: params.phase,
    };
    this.toolCallOrder.push(call);

    if (toolUseId) {
      this.toolCallsById.set(toolUseId, call);
    } else {
      this.anonymousToolCalls.push(call);
    }

    return call;
  }

  private buildInputMetadata(): Record<string, unknown> {
    return {
      hasYapi: false,
      apiListCount: 0,
      yapiSectionLength: 0,
    };
  }

  private buildSkillNames(): string[] {
    const skillNames = new Set<string>();
    for (const call of this.toolCallOrder) {
      if (call.toolName !== 'Skill') continue;
      const skillName = toOptionalString(call.input.skill);
      if (skillName) skillNames.add(skillName);
    }
    return Array.from(skillNames);
  }

  private buildPhaseMetadata(record: PhaseRecord): Record<string, unknown> | undefined {
    const metadata = {
      ...(record.metadata ?? {}),
      ...this.buildPhaseTimingMetadata(record),
    };

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  private buildPhaseTimingMetadata(record: PhaseRecord): Record<string, unknown> {
    if (!record.endTime) return {};

    const phaseStartMs = record.startTime.getTime();
    const phaseEndMs = record.endTime.getTime();
    const phaseDurationMs = Math.max(0, phaseEndMs - phaseStartMs);
    const calls = this.toolCallOrder
      .filter((call) => call.phase === record.phase)
      .sort((a, b) => toolStartMs(this.startTime, a) - toolStartMs(this.startTime, b));

    const toolDurationTotalMs = calls.reduce((sum, call) => sum + Math.max(0, call.duration), 0);
    const timing: Record<string, unknown> = {
      toolCallCount: calls.length,
      toolDurationTotalSec: msToSec(toolDurationTotalMs),
      modelDurationApproxSec: msToSec(Math.max(0, phaseDurationMs - toolDurationTotalMs)),
    };

    if (calls.length > 0) {
      const firstToolStartMs = toolStartMs(this.startTime, calls[0]);
      const toolsDoneMs = Math.max(
        ...calls.map((call) => toolEndMs(this.startTime, call)),
      );
      timing.firstToolAt = formatDateTime(new Date(firstToolStartMs));
      timing.firstToolLatencySec = msToSec(Math.max(0, firstToolStartMs - phaseStartMs));
      timing.toolsDoneAt = formatDateTime(new Date(toolsDoneMs));
      timing.toolsDoneLatencySec = msToSec(Math.max(0, toolsDoneMs - phaseStartMs));
    }

    if (record.phase === 'merged-query') {
      Object.assign(timing, this.buildCodeQueryWriteTiming(record, calls));
    }

    return timing;
  }

  private buildCodeQueryWriteTiming(
    record: PhaseRecord,
    calls: MutableToolCall[],
  ): Record<string, unknown> {
    const phaseStartMs = record.startTime.getTime();
    const phaseEndMs = record.endTime?.getTime() ?? Date.now();
    const writeCalls = calls
      .filter((call) => call.toolName === 'Write' || call.toolName === WRITE_CODE_FILE_FULL_TOOL_ID)
      .sort((a, b) => toolStartMs(this.startTime, a) - toolStartMs(this.startTime, b));
    const writeDurationMs = writeCalls.reduce((sum, call) => sum + Math.max(0, call.duration), 0);

    if (writeCalls.length === 0) {
      return {
        firstWriteAt: null,
        firstWriteLatencySec: null,
        modelPlanningDurationSec: null,
        writeDurationSec: 0,
        finalizationDurationSec: null,
      };
    }

    const firstWriteStartMs = toolStartMs(this.startTime, writeCalls[0]);
    const lastWriteEndMs = Math.max(
      ...writeCalls.map((call) => toolEndMs(this.startTime, call)),
    );
    const preFirstWriteToolDurationMs = calls
      .filter((call) => toolStartMs(this.startTime, call) < firstWriteStartMs)
      .reduce((sum, call) => sum + Math.max(0, call.duration), 0);

    return {
      firstWriteAt: formatDateTime(new Date(firstWriteStartMs)),
      firstWriteLatencySec: msToSec(Math.max(0, firstWriteStartMs - phaseStartMs)),
      modelPlanningDurationSec: msToSec(
        Math.max(0, firstWriteStartMs - phaseStartMs - preFirstWriteToolDurationMs),
      ),
      writeDurationSec: msToSec(writeDurationMs),
      finalizationDurationSec: msToSec(Math.max(0, phaseEndMs - lastWriteEndMs)),
    };
  }

  private buildToolCallsRecord(): Record<string, ToolCallStats> {
    const record: Record<string, ToolCallStats> = {};

    for (const call of this.toolCallOrder) {
      const toolName = call.toolName || 'unknown';
      if (!record[toolName]) {
        record[toolName] = {
          toolName,
          callCount: 0,
          firstCallTime: call.timestamp,
          durations: [],
          calls: [],
        };
      }

      const stats = record[toolName];
      stats.callCount += 1;
      stats.durations.push(call.duration);
      stats.calls.push({
        toolUseId: call.toolUseId,
        timestamp: call.timestamp,
        duration: call.duration,
        input: call.input,
        ...(call.contentLength !== undefined && {
          contentLength: call.contentLength,
        }),
      });
    }

    return record;
  }

  private buildModelCost(): ModelCost {
    const modelName = this.getModelName();
    const pricing = getModelPricing(modelName);
    const cacheHitCost =
      (this.tokenUsage.cacheReadInputTokens / 1_000_000) * pricing.cacheHitPrice;
    const cacheWriteCost =
      (this.tokenUsage.cacheCreationTokens / 1_000_000) * pricing.cacheWritePrice;
    const inputCost =
      (this.tokenUsage.inputTokens / 1_000_000) * pricing.inputPrice;
    const outputCost =
      (this.tokenUsage.outputTokens / 1_000_000) * pricing.outputPrice;

    return {
      name: modelName,
      cacheHitCost,
      cacheWriteCost,
      inputCost,
      outputCost,
      totalCost: this.totalCostUsd,
    };
  }

  private getPrimarySessionId(): string | undefined {
    return this.phaseSessionIds.get('merged-query')
      ?? this.phaseSessionIds.values().next().value;
  }

  private getModelName(): string {
    const modelNames = Array.from(this.modelUsageCosts.keys());
    if (modelNames.length === 1) return modelNames[0];
    if (modelNames.length > 1) return truncate(modelNames.join('+'), 128);
    return this.modelName || 'unknown';
  }

  private noteModel(modelName?: string): void {
    if (!modelName || modelName === '<synthetic>' || modelName === 'unknown') return;
    if (this.modelName === 'unknown' || this.modelName === this.agentConfig.defaultModel) {
      this.modelName = modelName;
    }
  }

  private findPhaseRecord(phase: MergedQueryPhase): PhaseRecord | undefined {
    for (let i = this.phases.length - 1; i >= 0; i--) {
      const record = this.phases[i];
      if (record.phase === phase && record.status === 'running') return record;
    }
    for (let i = this.phases.length - 1; i >= 0; i--) {
      const record = this.phases[i];
      if (record.phase === phase) return record;
    }
    return undefined;
  }

  private relativeSec(atMs = Date.now()): number {
    return (atMs - this.startTime.getTime()) / 1000;
  }
}

function extractSessionId(message: SDKMessage): string | undefined {
  return toOptionalString((message as { session_id?: unknown }).session_id);
}

function numberFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function omitUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) result[key] = item;
  }
  return result;
}

function normalizeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function durationSec(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / 1000;
}

function msToSec(value: number): number {
  return Math.round((value / 1000) * 1000) / 1000;
}

function toolStartMs(taskStartTime: Date, call: MutableToolCall): number {
  return call.startedAtMs ?? taskStartTime.getTime() + call.timestamp * 1000;
}

function toolEndMs(taskStartTime: Date, call: MutableToolCall): number {
  return toolStartMs(taskStartTime, call) + Math.max(0, call.duration);
}

function contentLength(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'string') return value.length;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') return record.text.length;
    if (record.content !== undefined) return contentLength(record.content);
  }
  return JSON.stringify(value).length;
}

function countToolCalls(toolCalls: Record<string, ToolCallStats>): number {
  return Object.values(toolCalls).reduce((sum, stats) => sum + stats.callCount, 0);
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function formatDateTime(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}
