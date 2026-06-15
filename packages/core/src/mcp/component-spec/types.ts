/**
 * 组件源码工具类型定义
 */

export type ComponentLibrary = 'antd' | 'ant-design-pro-components';

/** 通用文件描述 */
export interface ClassifiedFile {
  path: string;
  name: string;
  content: string;
}

/**
 * 组件数据（resolver 输出）
 * 
 * 只包含两种数据：
 * - typesContent: 从 npm 包获取的 .d.ts 类型定义
 * - examples: 从 component-data 获取的示例代码
 */
export interface ComponentSource {
  name: string;
  library: ComponentLibrary;
  typesContent?: string;
  examples?: ClassifiedFile[];
  /** 本组件通过 fields 配置内化的基础组件列表 */
  subsumes?: string[];
}
