/**
 * 组件数据格式化
 * 
 * 将 ComponentSource（types + examples）格式化为 AI 可读的 Markdown。
 */

import type { ComponentLibrary, ComponentSource } from './types';
import { getLibraryConfig, componentNameToDir } from './resolvers/registryLoader.js';

/** 生成 import 说明（明确给出组件和类型的正确导入路径） */
function buildImportSection(library: ComponentLibrary, componentName: string): string {
  const libConfig = getLibraryConfig(library);
  const pkg = libConfig?.importPrefix ?? library;
  const dirName = componentNameToDir(componentName, library);

  // 构造类型导入子路径（去掉 .d.ts 后缀）
  let typesSubPath = '';
  if (libConfig?.typesPath) {
    const patterns = Array.isArray(libConfig.typesPath) ? libConfig.typesPath : [libConfig.typesPath];
    const firstPattern = patterns[0].replace(/\{component\}/g, dirName).replace(/\.d\.ts$/, '');
    typesSubPath = `${pkg}/${firstPattern}`;
  }

  const lines = [
    `// 组件导入`,
    `import { ${componentName} } from '${pkg}';`,
  ];

  if (typesSubPath) {
    lines.push(`// 类型导入（注意：类型不能从包根路径导入，必须使用子路径）`);
    lines.push(`import type { ${componentName}Props } from '${typesSubPath}';`);
    lines.push(`// 其他类型名称请参考下方类型定义，导入路径相同`);
  }

  return lines.join('\n');
}

/**
 * 格式化组件数据为 AI 可读的 Markdown
 * 
 * 预算分配策略：
 * - 有 examples 时：types 最多占 60%，examples 至少保留 40%
 * - 无 examples 时：types 可占满全部预算
 * 
 * 这确保高阶组件（contextLevel: full-example）的示例代码
 * 不会被巨大的 flattened types 完全挤掉。
 */
export function formatComponentSourceForAI(source: ComponentSource, maxLength: number = 50000): string {
  const parts: string[] = [];
  let len = 0;

  const append = (text: string): boolean => {
    if (len + text.length > maxLength) {
      const remaining = maxLength - len;
      if (remaining > 100) {
        parts.push(text.substring(0, remaining) + '\n... (内容已截断)');
        len = maxLength;
      }
      return false;
    }
    parts.push(text);
    len += text.length;
    return true;
  };

  // 标题
  append(`## 组件: ${source.name} (${source.library})\n`);

  // 0. 内化组件提示（subsumes）
  if (source.subsumes && source.subsumes.length > 0) {
    append(`### ⚠️ 字段内化说明\n本组件通过 \`fields\` 配置内化了以下基础组件，**无需单独查询它们的源码**：${source.subsumes.join(', ')}\n\n使用方式：在 \`fields\` 数组中通过 \`type\` 属性指定字段类型（如 \`type: 'select'\`），通过 \`ctrlProps\` 传递组件属性。\n`);
  }

  // 1. 导入说明
  const importText = buildImportSection(source.library, source.name);
  append(`### 导入方式\n\`\`\`typescript\n${importText}\n\`\`\`\n`);

  // 计算 types 预算：有 examples 时上限为 60%，无 examples 时可占满
  const hasExamples = source.examples && source.examples.length > 0;
  const headerLen = len; // 当前已占用的长度（标题 + 导入）
  const availableBudget = maxLength - headerLen;
  const typesMaxLen = hasExamples
    ? Math.floor(availableBudget * 0.6)  // 有 examples：types 最多 60%
    : Math.floor(availableBudget * 0.95); // 无 examples：types 占满

  // 2. 类型定义
  if (source.typesContent) {
    const types = source.typesContent.length > typesMaxLen
      ? source.typesContent.substring(0, typesMaxLen) + '\n// ... (类型定义较长，已截断)'
      : source.typesContent;

    append(`### 类型定义\n\`\`\`typescript\n${types}\n\`\`\`\n`);
    // 不再 early return，确保 examples 有机会被添加
  }

  // 3. 示例代码
  if (hasExamples) {
    append(`### 示例代码\n`);

    for (let i = 0; i < source.examples!.length; i++) {
      if (len >= maxLength) break;
      const ex = source.examples![i];

      if (i < 3) {
        // 前 3 个完整展示
        const content = ex.content.length > 5000
          ? ex.content.substring(0, 5000) + '\n// ... (示例较长，已截断)'
          : ex.content;
        if (!append(`#### ${ex.name}\n\`\`\`tsx\n${content}\n\`\`\`\n`)) break;
      } else {
        // 其余只列文件名
        append(`- ${ex.name}\n`);
      }
    }
  }

  return parts.join('\n');
}
