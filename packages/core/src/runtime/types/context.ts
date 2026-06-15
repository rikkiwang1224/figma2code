/**
 * 上下文相关类型定义
 */

import type { PlatformType } from './platform';
import type { CodeFile } from './platform';
import type { CodeStyleProfile } from '../../types/codeStyle.js';

export type BenchmarkComplexity = 'simple' | 'medium' | 'complex';

/**
 * 代码生成上下文
 */
export interface CodeGenerationContext {
  /** 平台类型 */
  platform: PlatformType;
  
  /** 会话 ID */
  conversationId: string;  // 业务层会话 ID
  
  /** 请求追踪 ID */
  requestId?: string;
  
  /** 当前文件列表 */
  currentFiles?: CodeFile[];
  
  /** Figma URL */
  figmaUrl?: string;

  /** 用户输入文本（与 figmaUrl 二选一） */
  text?: string;

  /** 关联的 Jira 单 ID（可选，写性能统计时落库） */
  jiraId?: string;

  /** 环境标识（可选，仅 test | live，写性能统计时落库；不传则按 CONFIG.envKey 推导） */
  env?: 'test' | 'live';

  /** 用户指定的目录名，或为空（由 LLM 推断） */
  folder_name?: string;

  /** 代码风格配置（来自业务线项目的约定） */
  codeStyle?: CodeStyleProfile;

  /** 组件库 adapter（默认 ant-design） */
  adapterId?: string;

  /** 项目 Cursor Rules 内容（可选） */
  cursorRules?: string;

  /** Benchmark run ID */
  benchmarkRunId?: string;

  /** Benchmark case ID */
  benchmarkCaseId?: string;

  /** Benchmark case 复杂度 */
  complexity?: BenchmarkComplexity;

  /** Benchmark 第几次尝试 */
  attemptNo?: number;

  /** Prompt/规则版本 */
  promptVersion?: string;

  /** 其他上下文信息 */
  [key: string]: any;
}
