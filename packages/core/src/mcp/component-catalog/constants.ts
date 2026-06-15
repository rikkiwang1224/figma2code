/**
 * 组件摘要常量定义
 */

import type { PlatformType, ComponentLibrary } from '../../runtime/types/platform.js';

/** 平台对应的组件库映射 */
export const PLATFORM_LIBRARIES: Record<PlatformType, ComponentLibrary[]> = {
  pc: ['ant-design-pro-components', 'antd'],
  h5: [],
  rn: [],
};
