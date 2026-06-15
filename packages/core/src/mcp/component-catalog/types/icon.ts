/**
 * 图标元数据类型定义
 */

/**
 * 图标元数据
 */
export interface IconMetadata {
  /** 图标组件名称（如 'IconAddOutline'） */
  name: string;
  /** 平台类型 */
  platform: 'pc' | 'h5';
  /** 图标尺寸（仅移动端，如 '20', '24'） */
  size?: string;
  /** 图标样式 */
  style: 'Outline' | 'Filled' | 'Colored';
  /** 图标分类 */
  category: 'action' | 'arrow' | 'status' | 'nav' | 'file' | 'business' | 'other';
  /** 导入路径 */
  importPath: string;
  /** 标签（用于搜索） */
  tags?: string[];
  /** 图标描述（可选） */
  description?: string;
}

/**
 * 图标库元数据文件结构
 */
export interface IconLibraryMetadata {
  /** 图标库名称 */
  library: 'ssc-ui-icons';
  /** 元数据版本号 */
  version: string;
  /** 生成时间 */
  generatedAt: string;
  /** 生成器名称和版本 */
  generator: string;
  /** 图标数据 */
  icons: {
    /** PC 端图标 */
    pc: IconMetadata[];
    /** H5 端图标 */
    h5: IconMetadata[];
  };
}
