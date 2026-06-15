import type {
  HookConfig,
  McpToolConfig,
  PlatformConfig,
  PlatformType,
} from '../types/platform.js';

/** Runtime adapter: wires component/icon libraries into merged-query MCP options. */
export interface RuntimeAdapter {
  readonly platform: PlatformType;
  getConfig(): PlatformConfig;
  getMcpTools?(): McpToolConfig[];
  getHooks?(): HookConfig[];
}
