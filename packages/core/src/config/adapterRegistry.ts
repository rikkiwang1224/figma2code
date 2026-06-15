import type { PlatformType } from '../runtime/types/platform.js';
import type { RuntimeAdapter } from '../runtime/adapters/types.js';
import { PlatformError } from '../runtime/errors/index.js';
import { createLogger } from '../lib/logger.js';

const logger = createLogger('Figma2Code.AdapterRegistry');

export class AdapterRegistry {
  private static instance: AdapterRegistry;
  private adapters = new Map<PlatformType, RuntimeAdapter>();

  private constructor() {}

  static getInstance(): AdapterRegistry {
    if (!AdapterRegistry.instance) {
      AdapterRegistry.instance = new AdapterRegistry();
    }
    return AdapterRegistry.instance;
  }

  register(adapter: RuntimeAdapter): void {
    const platform = adapter.platform;

    if (this.adapters.has(platform)) {
      logger.warn(`Adapter for platform ${platform} already registered, overwriting`);
    }

    this.adapters.set(platform, adapter);
    logger.info(`Registered runtime adapter: ${platform}`);
  }

  get(platform: PlatformType): RuntimeAdapter {
    const adapter = this.adapters.get(platform);

    if (!adapter) {
      const available = Array.from(this.adapters.keys()).join(', ');
      throw new PlatformError(
        `Runtime adapter not registered. Available: ${available || 'none'}.`,
        platform,
      );
    }

    return adapter;
  }
}

export const adapterRegistry = AdapterRegistry.getInstance();
