/**
 * 代码风格覆盖 prompt 段落
 *
 * 当用户通过 API 传入 CodeStyleProfile 时，
 * 生成一段追加到 system prompt 的覆盖指令，
 * 强制 LLM 按业务线项目的实际约定输出代码。
 */

import type { CodeStyleProfile } from '../../types/codeStyle.js';
import {
  resolveStyleFileName,
  resolveStyleDescription,
  resolveI18nImportStatement,
  resolveI18nFunctionName,
} from '../../types/codeStyle.js';

/**
 * 根据 CodeStyleProfile 生成 prompt 覆盖段落。
 * 未传 profile 或全部使用默认值时返回空字符串（不影响原有行为）。
 */
export function buildCodeStyleOverride(profile?: CodeStyleProfile): string {
  if (!profile) return '';

  const sections: string[] = [];

  // ── 样式文件规范覆盖 ──
  if (profile.styleExtension || profile.styleNaming) {
    const fileName = resolveStyleFileName(profile);
    const desc = resolveStyleDescription(profile);
    const ext = profile.styleExtension ?? 'less';
    const syntaxHint = ext === 'scss' ? 'SCSS/Sass' : ext === 'css' ? 'CSS' : 'Less';

    sections.push(`### 样式文件规范（项目覆盖）

> ⚠️ 以下规范**覆盖**上方及 Skill 中关于样式文件的默认约定。

- 样式方案：**${desc}**
- 样式文件名：**\`${fileName}\`**
- 语法：使用 **${syntaxHint}**
- import 示例：
  \`\`\`tsx
  import styles from './${fileName}';
  \`\`\``);
  }

  // ── CSS 类名命名风格 ──
  if (profile.cssNaming && profile.cssNaming !== 'camelCase') {
    sections.push(`### CSS 类名命名风格（项目覆盖）

- 使用 **${profile.cssNaming}** 命名 CSS 类名
- 示例：\`styles['page-container']\` 而非 \`styles.pageContainer\``);
  }

  // ── 国际化覆盖 ──
  if (profile.i18n) {
    const { i18n } = profile;

    if (i18n.enabled === false) {
      sections.push(`### 国际化（项目覆盖）

> ⚠️ 该项目**不使用国际化**，禁止使用 $gt() 或任何 i18n 包装函数。
> 所有用户可见文本直接使用中文/英文字符串字面量。`);
    } else {
      const fnName = resolveI18nFunctionName(profile);
      const importStmt = resolveI18nImportStatement(profile);

      if (fnName !== '$gt' || (i18n.importPath && i18n.importPath !== '@ssc-fe-common/context') || i18n.importStatement) {
        sections.push(`### 国际化（项目覆盖）

> ⚠️ 以下规范**覆盖** Skill \`pc-architecture-2.0\` 中关于国际化导入路径的默认约定。
> 国际化的使用规则（哪些文本需要包装、哪些不需要）仍遵循 Skill 中的判断标准。

- 国际化函数名：**\`${fnName}\`**
- import 语句：
  \`\`\`tsx
  ${importStmt}
  \`\`\`
- 每个使用 \`${fnName}\` 的文件都需要独立导入`);
      }
    }
  }

  // ── 参考代码（让 LLM 学习项目风格） ──
  if (profile.referenceCode) {
    sections.push(`### 项目参考代码（风格学习）

以下是该项目现有的代码片段，请学习其代码风格（命名、import 顺序、组件写法、样式用法等），生成的代码应与之保持一致：

\`\`\`tsx
${profile.referenceCode}
\`\`\``);
  }

  if (sections.length === 0) return '';

  return `
## 🎨 项目代码风格定制（优先级最高）

以下是该业务线项目的代码风格约定，**当与默认规范或 Skill 内容冲突时，以此为准**。

${sections.join('\n\n')}
`;
}
