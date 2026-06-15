/**
 * MCP 工具相关类型定义
 */

import type { McpServerConfig, McpSdkServerConfig } from '@anthropic-ai/claude-agent-sdk';

/**
 * MCP 工具类型
 */
export type McpToolType = 
  | 'figma' 
  | 'component-catalog' 
  | 'component-spec' 
  | 'design-analysis'
  | 'icon-list';

/**
 * MCP 工具配置
 */
export interface ToolConfig {
  /** 工具名称 */
  name: string;
  
  /** 工具类型 */
  type: McpToolType;
  
  /** MCP 服务器配置 */
  server: McpServerConfig | McpSdkServerConfig;
  
  /** 允许的工具列表（可选） */
  allowedTools?: string[];
}

/**
 * Figma MCP 工具配置
 */
export interface FigmaToolConfig extends ToolConfig {
  type: 'figma';
  /** Figma API Key */
  apiKey?: string;
  /** Figma MCP 端口 */
  port?: number;
}

/**
 * 组件库 MCP 工具配置
 */
export interface ComponentLibraryToolConfig extends ToolConfig {
  type: 'component-catalog' | 'component-spec';
  /** 组件库名称 */
  library: string;
  /** 平台类型 */
  platform: string;
}

/**
 * 图标库 MCP 工具配置
 */
export interface IconLibraryToolConfig extends ToolConfig {
  type: 'icon-list';
  /** 图标库名称 */
  library: string;
  /** 平台类型 */
  platform: string;
}
