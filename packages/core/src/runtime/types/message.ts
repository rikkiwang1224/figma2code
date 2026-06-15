/**
 * 消息相关类型定义
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { CodeFile } from './code';

/**
 * Agent 消息类型
 * 这是从 SDKMessage 转换后的简化格式，用于前端显示和业务处理
 */
export type AgentMessage =
  | TextMessage
  | ToolUseMessage
  | ToolResultMessage
  | SystemMessage
  | ErrorMessage;

/**
 * 文本消息
 */
export interface TextMessage {
  type: 'text';
  content: string;
  subtype?: 'partial' | 'complete';
  sessionId?: string;
}

/**
 * 工具使用消息
 */
export interface ToolUseMessage {
  type: 'tool_use';
  name: string;
  input: Record<string, unknown>;
  tool_use_id: string;
  sessionId?: string;
}

/**
 * 工具结果消息
 */
export interface ToolResultMessage {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  isError?: boolean;
  sessionId?: string;
}

/**
 * 系统消息
 */
export interface SystemMessage {
  type: 'system';
  subtype: 'init' | 'result' | 'folder_name' | 'error';
  session_id?: string;
  result?: any;
  error?: string;
  files?: CodeFile[];
  folder_name?: string;
  sessionId?: string;
}

/**
 * 错误消息
 */
export interface ErrorMessage {
  type: 'error';
  error: string;
  sessionId?: string;
}

/**
 * 消息上下文
 */
export interface MessageContext {
  /** 会话 ID */
  sessionId?: string;
  
  /** 平台类型 */
  platform?: string;
  
  /** 其他上下文信息 */
  [key: string]: any;
}

/**
 * 消息处理器接口
 */
export interface MessageHandler {
  /** 处理消息 */
  handle(
    message: AgentMessage,
    context: MessageContext
  ): Promise<AgentMessage> | AgentMessage;
}

// CodeFile 从 ./code 引入并重新导出（保持向后兼容）
export type { CodeFile } from './code';

/**
 * SDK 消息类型（重新导出）
 */
export type { SDKMessage };
