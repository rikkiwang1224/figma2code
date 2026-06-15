/**
 * 代码文件类型定义（唯一定义）
 */

/** 代码文件类型 */
export type CodeFileType = 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'less' | 'scss' | 'json';

/** 代码文件 */
export interface CodeFile {
  /** 文件名（含扩展名） */
  name: string;

  /** 文件类型 */
  type: CodeFileType;

  /** 文件内容 */
  content: string;
}
