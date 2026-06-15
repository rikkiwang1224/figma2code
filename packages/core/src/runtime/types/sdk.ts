/**
 * SDK 消息子类型和类型守卫
 *
 * Claude Agent SDK 的 SDKMessage 是一个宽泛的联合类型。
 * 由于 SDK 不从主入口导出各子类型，这里定义轻量级接口和类型守卫，
 * 用于在 MessageConverter 中替代 `as any` 断言。
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

// ─── 助手消息 ───────────────────────────────────────────

/** 助手消息内容块 */
export interface ContentBlock {
  type: 'text' | 'tool_use';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/** SDK 助手消息（type: 'assistant'） */
export interface AssistantMessage {
  type: 'assistant';
  message?: {
    content?: ContentBlock[];
    usage?: { input_tokens: number; output_tokens: number };
  };
  parent_tool_use_id: string | null;
  session_id: string;
}

// ─── 系统消息 ───────────────────────────────────────────

/** SDK 系统消息（type: 'system'） */
export interface SystemInitMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
  model?: string;
  tools?: string[];
}

// ─── 结果消息 ───────────────────────────────────────────

/** SDK 成功结果 */
export interface ResultSuccessMessage {
  type: 'result';
  subtype: 'success';
  result: string;
  session_id: string;
  usage?: { input_tokens: number; output_tokens: number };
}

/** SDK 错误结果 */
export interface ResultErrorMessage {
  type: 'result';
  subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
  errors: string[];
  session_id: string;
}

export type ResultMessage = ResultSuccessMessage | ResultErrorMessage;

// ─── 流式事件 ───────────────────────────────────────────

/** SDK 流式事件（type: 'stream_event'） */
export interface StreamEventMessage {
  type: 'stream_event';
  event?: {
    type: string;
    delta?: { text?: string; usage?: Record<string, number> };
    usage?: Record<string, number>;
  };
  session_id: string;
}

// ─── 用户消息（工具结果） ──────────────────────────────

/** 工具调用结果 */
export interface ToolUseResult {
  type?: string;
  text?: string;
  content?: unknown;
  tool_use_id?: string;
  isError?: boolean;
  is_error?: boolean;
}

/** SDK 用户消息（type: 'user'，通常是工具执行结果） */
export interface UserToolResultMessage {
  type: 'user';
  parent_tool_use_id?: string;
  tool_use_result?: ToolUseResult | ToolUseResult[];
  session_id: string;
}

// ─── 类型守卫 ───────────────────────────────────────────

export function isAssistantMessage(msg: SDKMessage): msg is AssistantMessage & SDKMessage {
  return msg.type === 'assistant';
}

export function isStreamEvent(msg: SDKMessage): msg is StreamEventMessage & SDKMessage {
  return msg.type === 'stream_event';
}

export function isSystemMessage(msg: SDKMessage): msg is SystemInitMessage & SDKMessage {
  return msg.type === 'system';
}

export function isResultMessage(msg: SDKMessage): msg is ResultMessage & SDKMessage {
  return msg.type === 'result';
}

export function isUserMessage(msg: SDKMessage): msg is UserToolResultMessage & SDKMessage {
  return msg.type === 'user';
}
