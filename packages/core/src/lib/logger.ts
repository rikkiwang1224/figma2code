export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: unknown, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

function format(message: string, data?: Record<string, unknown>): string {
  if (!data || Object.keys(data).length === 0) return message;
  return `${message} ${JSON.stringify(data)}`;
}

export function createLogger(category: string): Logger {
  return {
    info(message, data) {
      console.log(`[${category}] ${format(message, data)}`);
    },
    warn(message, data) {
      console.warn(`[${category}] ${format(message, data)}`);
    },
    error(message, error, data) {
      const payload = {
        ...data,
        error: error instanceof Error ? error.message : error,
      };
      console.error(`[${category}] ${format(message, payload)}`);
    },
    debug(message, data) {
      if (process.env.FIGMA2CODE_DEBUG === '1' || process.env.FIGMA2CODE_DEBUG === 'true') {
        console.debug(`[${category}] ${format(message, data)}`);
      }
    },
  };
}
