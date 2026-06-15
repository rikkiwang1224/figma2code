/** Agent 错误基类 */
export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

/** 平台配置错误（未注册的平台、配置验证失败） */
export class PlatformError extends AgentError {
  constructor(message: string, public readonly platform: string, cause?: unknown) {
    super(`[${platform}] ${message}`, 'PLATFORM_ERROR', cause);
    this.name = 'PlatformError';
  }
}
