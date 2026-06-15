/**
 * 代码风格配置
 *
 * 允许不同业务线根据自身代码仓库的约定，定制生成代码的风格。
 * 前端（IDE 插件）可根据项目的 package.json / .eslintrc 等推断后传入。
 */

/** 样式文件后缀 */
export type StyleExtension = 'less' | 'scss' | 'css';

/** 样式文件命名模式：是否使用 CSS Modules */
export type StyleNamingPattern = 'module' | 'plain';

/** CSS class 命名风格 */
export type CssNamingConvention = 'camelCase' | 'kebab-case';

/**
 * 国际化（i18n）配置
 */
export interface I18nConfig {
  /** 是否启用国际化包装（默认 true） */
  enabled?: boolean;
  /** 国际化函数名（默认 't'） */
  functionName?: string;
  /** import 来源路径（默认 'react-i18next'） */
  importPath?: string;
  /** 完整 import 语句（优先级高于 functionName + importPath 的组合） */
  importStatement?: string;
}

/**
 * 代码风格配置
 *
 * 所有字段均可选，未传的字段使用平台默认值。
 */
export interface CodeStyleProfile {
  /** 样式文件后缀: 'less' | 'scss' | 'css'（默认 'less'） */
  styleExtension?: StyleExtension;

  /** 样式命名模式: 'module'(CSS Modules) | 'plain'（默认 'module'） */
  styleNaming?: StyleNamingPattern;

  /** CSS class 命名风格: 'camelCase' | 'kebab-case'（默认 'camelCase'） */
  cssNaming?: CssNamingConvention;

  /** 国际化配置 */
  i18n?: I18nConfig;

  /** 用户项目中的示例代码片段，供 LLM 学习风格（可选） */
  referenceCode?: string;
}

/**
 * 解析后的完整样式文件名，如 'index.module.less'、'styles.scss'
 */
export function resolveStyleFileName(profile?: CodeStyleProfile): string {
  const ext = profile?.styleExtension ?? 'less';
  const naming = profile?.styleNaming ?? 'module';
  return naming === 'module' ? `index.module.${ext}` : `index.${ext}`;
}

/**
 * 解析样式方案描述文本（用于 prompt）
 */
export function resolveStyleDescription(profile?: CodeStyleProfile): string {
  const ext = profile?.styleExtension ?? 'less';
  const naming = profile?.styleNaming ?? 'module';

  const extLabel: Record<StyleExtension, string> = {
    less: 'Less',
    scss: 'SCSS/Sass',
    css: 'CSS',
  };

  return naming === 'module'
    ? `${ext.toUpperCase()} Module + ${extLabel[ext]}`
    : `${extLabel[ext]}`;
}

/**
 * 解析 import 语句
 */
export function resolveI18nImportStatement(profile?: CodeStyleProfile): string {
  const i18n = profile?.i18n;
  if (i18n?.enabled === false) return '';
  if (i18n?.importStatement) return i18n.importStatement;

  const fn = i18n?.functionName ?? 't';
  const path = i18n?.importPath ?? 'react-i18next';
  return `import { ${fn} } from '${path}';`;
}

/**
 * 解析国际化函数名
 */
export function resolveI18nFunctionName(profile?: CodeStyleProfile): string {
  if (profile?.i18n?.enabled === false) return '';
  return profile?.i18n?.functionName ?? 't';
}
