/**
 * 组件 Metadata 类型定义
 */

/** 详细的 Prop 信息，主要是视觉相关属性 **/
export interface DetailedProp {
  /** 属性名称 */
  name: string;
  /** 属性描述 */
  description: string;
  /** 属性类型 */
  type: string;
  /** 默认值 */
  default?: string;
  /** 是否必填 */
  required?: boolean;
}

export interface ComponentSummary {
  /** 组件名称 */
  name: string;
  /** 1-2 句功能描述 */
  description: string;
  /** 核心 Props（3-5 个最重要的，用于快速筛选） */
  keyProps: string[];
  /** 所有跟设计稿视觉相关的 Props 信息 */
  detailedProps?: DetailedProp[];
}
