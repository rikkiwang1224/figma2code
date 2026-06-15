/**
 * 性能监控相关类型定义
 */

import type { PlatformType } from '../types/platform';

/**
 * Token 使用统计
 * 
 * 基于 Claude SDK 2026 最新规范：
 * total_input_tokens = cache_read_input_tokens + cache_creation_input_tokens + input_tokens
 * total_tokens = total_input_tokens + output_tokens
 */
export interface TokenUsage {
  /** 缓存命中读取的 Token（10% 计费） */
  cacheReadInputTokens: number;
  /** 缓存创建写入的 Token（125% 计费） */
  cacheCreationTokens: number;
  /** 常规输入 Token（100% 计费，cache breakpoint 之后的内容） */
  inputTokens: number;
  /** 输出 Token */
  outputTokens: number;
  
  /** 总输入 Token = cacheReadInputTokens + cacheCreationTokens + inputTokens */
  totalInputTokens: number;
  /** 上下文窗口总量 = totalInputTokens + outputTokens */
  totalTokens: number;
}

/**
 * 模型成本统计
 * 
 * 基于 Claude SDK 2026 计费规则：
 * - Cache Hit (Read): cache_read_input_tokens * 10% 的输入价格
 * - Cache Write (Creation): cache_creation_input_tokens * 125% 的输入价格
 * - Regular Input: input_tokens * 100% 的输入价格
 * - Output: output_tokens * 100% 的输出价格
 */
export interface ModelCost {
  /** 模型名称 */
  name: string;
  /** 缓存命中成本（10% 折扣） */
  cacheHitCost: number;
  /** 缓存写入成本（125% 溢价） */
  cacheWriteCost: number;
  /** 常规输入成本（100% 标准价格） */
  inputCost: number;
  /** 输出成本 */
  outputCost: number;
  /** 总成本 */
  totalCost: number;
}

/**
 * 工具调用详情
 */
export interface ToolCallDetail {
  /** 工具调用 ID */
  toolUseId?: string;
  /** 调用时间（相对于任务开始，秒） */
  timestamp: number;
  /** 耗时（毫秒） */
  duration: number;
  /** 调用参数 */
  input: any;
  /** 结果内容长度（字符数，tool_result 的实际长度） */
  contentLength?: number;
  /** Skill 文件大小（字符数，仅 Skill 工具，可选） */
  skillFileSize?: number;
}

/**
 * 工具调用统计
 */
export interface ToolCallStats {
  /** 工具名称 */
  toolName: string;
  /** 调用次数 */
  callCount: number;
  /** 首次调用时间（相对于任务开始，秒） */
  firstCallTime: number;
  /** 每次调用的耗时（毫秒） */
  durations: number[];
  /** 每次调用的详情 */
  calls: ToolCallDetail[];
}

/**
 * 任务状态
 */
export interface TaskStatus {
  /** 是否完成 */
  completed: boolean;
  /** 停止原因 */
  stopReason?: string;
  /** 是否检测到代码生成结果 */
  hasCodeResult: boolean;
}

/**
 * 对话统计
 */
export interface ConversationStats {
  /** 对话轮数 */
  rounds: number;
  /** 用户提示数 */
  userPrompts: number;
}

/**
 * Prompt 组成统计
 */
export interface PromptComposition {
  /** System Prompt 基础长度（字符数，不含 YAPI/Cursor Rules/User Prompt） */
  systemPromptBaseLength: number;
  /** Cursor Rules 章节长度（字符数） */
  cursorRulesSectionLength?: number;
  /** YAPI 章节长度（字符数） */
  yapiSectionLength?: number;
  /** User Prompt 长度（字符数） */
  userPromptLength: number;
  /** 完整 Prompt 总长度（字符数） */
  totalPromptLength: number;
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  /** 业务层会话 ID（conversationId） */
  conversationId: string;
  /** SDK 会话 ID（sdkSessionId，可选，用于会话恢复） */
  sdkSessionId?: string;
  /** 执行模式 */
  mode: 'legacy';
  /** Figma URL */
  figmaUrl?: string;
  /** 平台类型 */
  platform: PlatformType;
  /** 任务开始时间 */
  startTime: Date;
  /** 任务结束时间 */
  endTime?: Date;
  /** Token 使用统计 */
  tokenUsage: TokenUsage;
  /** 模型成本统计 */
  model: ModelCost;
  /** 工具调用统计（工具名称 -> 统计信息） */
  toolCalls: Map<string, ToolCallStats>;
  /** 任务状态 */
  status: TaskStatus;
  /** 对话统计 */
  conversation: ConversationStats;
  /** Prompt 组成统计（可选） */
  promptComposition?: PromptComposition;
}
