/**
 * 工具管理器
 * 统一管理所有 MCP 工具，提供工具的注册和获取机制
 */

import type { McpServerConfig, McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type { AgentConfig } from '../config/index.js';
import type { McpToolType } from './types';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('Figma2Code.ToolManager');

/**
 * 工具管理器类
 * 单例模式，统一管理所有 MCP 工具
 */
export class ToolManager {
  private static instance: ToolManager;
  private tools = new Map<McpToolType, McpServerConfig | McpSdkServerConfigWithInstance>();
  private agentConfig: AgentConfig | null = null;

  private constructor() {
    // 私有构造函数，确保单例
  }

  /**
   * 获取工具管理器实例（单例）
   */
  static getInstance(): ToolManager {
    if (!ToolManager.instance) {
      ToolManager.instance = new ToolManager();
    }
    return ToolManager.instance;
  }

  /**
   * 初始化工具管理器
   * @param agentConfig - Agent 配置
   */
  initialize(agentConfig: AgentConfig): void {
    this.agentConfig = agentConfig;
    logger.info('Tool manager initialized');
  }

  /**
   * 注册工具
   * @param type - 工具类型
   * @param server - MCP 服务器配置
   */
  register(type: McpToolType, server: McpServerConfig | McpSdkServerConfigWithInstance): void {
    if (this.tools.has(type)) {
      logger.warn('Tool already exists, will be overridden', { toolType: type });
    }
    
    this.tools.set(type, server);
    logger.info('Tool registered', { toolType: type });
  }

  /**
   * 获取工具
   * @param type - 工具类型
   * @returns MCP 服务器配置
   */
  get(type: McpToolType): McpServerConfig | McpSdkServerConfigWithInstance | null {
    return this.tools.get(type) || null;
  }

  /**
   * 获取所有已注册的工具
   * @returns 工具配置映射
   */
  getAll(): Record<string, McpServerConfig | McpSdkServerConfigWithInstance> {
    const result: Record<string, McpServerConfig | McpSdkServerConfigWithInstance> = {};
    
    for (const [type, server] of Array.from(this.tools.entries())) {
      // 使用工具类型作为 key，但需要转换为实际的服务器名称
      const serverName = this.getServerName(type);
      result[serverName] = server;
    }
    
    return result;
  }

  /**
   * 获取服务器名称
   * @param type - 工具类型
   * @returns 服务器名称
   */
  private getServerName(type: McpToolType): string {
    const nameMap: Record<McpToolType, string> = {
      'figma': 'figma',
      'component-catalog': 'component-catalog',
      'component-spec': 'component-spec',
      'design-analysis': 'design-analysis',
      'icon-list': 'icon-list',
    };
    
    return nameMap[type] || type;
  }

  /**
   * 检查工具是否已注册
   * @param type - 工具类型
   * @returns 是否已注册
   */
  has(type: McpToolType): boolean {
    return this.tools.has(type);
  }

  /**
   * 获取工具统计信息
   */
  getStats(): {
    total: number;
    tools: McpToolType[];
  } {
    return {
      total: this.tools.size,
      tools: Array.from(this.tools.keys()),
    };
  }
}

/**
 * 导出单例实例（便捷访问）
 */
export const toolManager = ToolManager.getInstance();
