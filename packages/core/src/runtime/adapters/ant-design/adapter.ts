import type { RuntimeAdapter } from '../types.js';
import type { PlatformConfig, PlatformType } from '../../types/platform.js';

export class AntDesignAdapter implements RuntimeAdapter {
  readonly platform: PlatformType = 'pc';

  getConfig(): PlatformConfig {
    return {
      platform: 'pc',
      componentLibraries: ['ant-design-pro-components', 'antd'],
      iconLibraries: ['ant-design-icons'],
      defaultComponentLibrary: 'ant-design-pro-components',
      defaultIconLibrary: 'ant-design-icons',
    };
  }
}
