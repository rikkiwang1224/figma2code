/**
 * SDK 消息 → AgentMessage 转换器
 *
 * 职责单一：只负责消息格式转换，不涉及日志、监控等副作用。
 * 使用类型守卫替代 `as any`，提升类型安全。
 */

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { AgentMessage } from '../types/message';
import {
  isAssistantMessage,
  isStreamEvent,
  isSystemMessage,
  isResultMessage,
  isUserMessage,
} from '../types/sdk';
import type {
  AssistantMessage,
  SystemInitMessage,
  ResultMessage,
  StreamEventMessage,
  UserToolResultMessage,
  ContentBlock,
  ToolUseResult,
} from '../types/sdk';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('Figma2Code.MessageConverter');

/**
 * SDK 消息 → AgentMessage 转换器
 */
export class MessageConverter {
  /** 工具调用 ID → 工具名 映射 */
  private toolCallIdMap = new Map<string, string>();
  /** 按时间顺序排列的工具调用队列（用于匹配无 parent_tool_use_id 的结果） */
  private toolCallQueue: Array<{ id: string; name: string }> = [];

  /**
   * 将 SDK 消息转换为业务消息
   * @returns AgentMessage 或 null（null 表示该消息应被过滤）
   */
  convert(message: SDKMessage): AgentMessage | null {
    if (isSystemMessage(message)) {
      return this.convertSystemMessage(message);
    }
    if (isResultMessage(message)) {
      return this.convertResultMessage(message);
    }
    if (isAssistantMessage(message)) {
      return this.convertAssistantMessage(message);
    }
    if (isStreamEvent(message)) {
      return this.convertStreamEvent(message);
    }
    if (isUserMessage(message)) {
      return this.convertUserMessage(message);
    }
    return null;
  }

  /** 获取工具名（供性能监控等外部使用） */
  getToolName(toolUseId: string): string | undefined {
    return this.toolCallIdMap.get(toolUseId);
  }

  // ─── 各类型消息的转换 ──────────────────────────────

  private convertSystemMessage(msg: SystemInitMessage & SDKMessage): AgentMessage {
    return {
      type: 'system',
      subtype: msg.subtype === 'init' ? 'init' : 'result',
      session_id: msg.session_id,
    };
  }

  private convertResultMessage(msg: ResultMessage & SDKMessage): AgentMessage {
    return {
      type: 'system',
      subtype: 'result',
      session_id: msg.session_id,
      result: msg.subtype === 'success' ? (msg as any).result : undefined,
      error: msg.subtype !== 'success' ? (msg as any).errors?.join(', ') : undefined,
    };
  }

  private convertAssistantMessage(msg: AssistantMessage & SDKMessage): AgentMessage | null {
    const content = msg.message?.content;
    if (!Array.isArray(content)) return null;

    const toolUses = content.filter((item): item is ContentBlock & { type: 'tool_use' } =>
      item.type === 'tool_use'
    );
    const textBlocks = content.filter((item): item is ContentBlock & { type: 'text' } =>
      item.type === 'text'
    );

    // 优先处理工具调用
    if (toolUses.length > 0) {
      const toolUse = toolUses[0];
      if (toolUse.id && toolUse.name) {
        this.toolCallIdMap.set(toolUse.id, toolUse.name);
        this.toolCallQueue.push({ id: toolUse.id, name: toolUse.name });

        logger.debug('Tool use extracted', {
          toolName: toolUse.name,
          toolUseId: toolUse.id,
        });

        return {
          type: 'tool_use',
          name: toolUse.name,
          input: toolUse.input || {},
          tool_use_id: toolUse.id,
        };
      }
    }

    // 文本内容
    const textBlock = textBlocks.find((item) => item.text);
    if (textBlock?.text) {
      return {
        type: 'text',
        content: textBlock.text,
        subtype: 'complete',
      };
    }

    return null;
  }

  private convertStreamEvent(msg: StreamEventMessage & SDKMessage): AgentMessage | null {
    const event = msg.event;
    if (event?.type === 'content_block_delta' && event.delta?.text) {
      return {
        type: 'text',
        content: event.delta.text,
        subtype: 'partial',
      };
    }
    return null;
  }

  private convertUserMessage(msg: UserToolResultMessage & SDKMessage): AgentMessage | null {
    // tool_use_result 可能是数组或单个对象
    const rawResults = msg.tool_use_result;
    const toolUseResults: ToolUseResult[] = rawResults
      ? (Array.isArray(rawResults) ? rawResults : [rawResults])
      : [];

    if (toolUseResults.length === 0) return null;

    const result = toolUseResults[0];

    // 提取文本内容
    const { content, isError } = this.extractToolResultContent(result);

    // 匹配工具调用 ID
    const { toolUseId, toolName } = this.resolveToolCallId(msg.parent_tool_use_id, result);

    if (toolUseId && content) {
      logger.info('Tool execution completed', {
        tool_use_id: toolUseId,
        tool_name: toolName,
        isError,
        contentLength: content.length,
      });

      return {
        type: 'tool_result',
        tool_use_id: toolUseId,
        content,
        isError,
      };
    }

    if (content) {
      logger.warn('Unable to match tool call ID, skipping', {
        parent_tool_use_id: msg.parent_tool_use_id,
        queueLength: this.toolCallQueue.length,
      });
    }

    return null;
  }

  // ─── 辅助方法 ──────────────────────────────────────

  private extractToolResultContent(result: ToolUseResult): { content: string; isError: boolean } {
    let content = '';
    let isError = false;

    if (result && typeof result === 'object') {
      if (result.type === 'text' && result.text != null) {
        content = String(result.text);
      } else if (result.text != null) {
        content = String(result.text);
      } else if (result.content != null) {
        content = typeof result.content === 'string'
          ? result.content
          : JSON.stringify(result.content);
      } else {
        content = JSON.stringify(result);
      }

      isError = !!(result.isError || result.is_error);
    } else if (typeof result === 'string') {
      content = result;
    } else {
      content = JSON.stringify(result);
    }

    return { content, isError };
  }

  private resolveToolCallId(
    parentToolUseId: string | undefined,
    result: ToolUseResult,
  ): { toolUseId: string; toolName: string } {
    let toolUseId = parentToolUseId || '';
    let toolName = '';

    // 优先使用 result 中的 tool_use_id
    if (result?.tool_use_id) {
      toolUseId = String(result.tool_use_id);
    }

    if (toolUseId) {
      toolName = this.toolCallIdMap.get(toolUseId) || 'unknown';
    } else if (this.toolCallQueue.length > 0) {
      const lastToolCall = this.toolCallQueue.shift();
      if (lastToolCall) {
        toolUseId = lastToolCall.id;
        toolName = lastToolCall.name;
      }
    }

    return { toolUseId, toolName };
  }
}
