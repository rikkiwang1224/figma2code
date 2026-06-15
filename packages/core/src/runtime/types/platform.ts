/**
 * 平台相关类型定义
 */

import type { CodeFile } from './code.js';

export type { CodeFile } from './code.js';

/**
 * 平台类型
 */
export type PlatformType = 'pc' | 'h5' | 'rn';

/**
 * 组件库类型
 */
export type ComponentLibrary = 'antd' | 'ant-design-pro-components';

export type IconLibrary = 'ant-design-icons';

/**
 * 平台配置
 */
export interface PlatformConfig {
  platform: PlatformType;
  componentLibraries: ComponentLibrary[];
  iconLibraries: IconLibrary[];
  defaultComponentLibrary: ComponentLibrary;
  defaultIconLibrary: IconLibrary;
  hooks?: HookConfig[];
  mcpTools?: McpToolConfig[];
}

/**
 * Hook 配置
 */
export interface HookConfig {
  event: HookEvent;
  callback: HookCallback;
  matcher?: HookCallbackMatcher;
}

/**
 * MCP 工具配置
 */
export interface McpToolConfig {
  name: string;
  server: McpServerConfig;
  allowedTools?: string[];
}

import type {
  HookEvent,
  HookCallback,
  HookCallbackMatcher,
  McpServerConfig,
} from '@anthropic-ai/claude-agent-sdk';

export type {
  HookEvent,
  HookCallback,
  HookCallbackMatcher,
  McpServerConfig,
};

