/**
 * Cursor Rules 章节格式化
 * 
 * 职责：
 * 1. 将项目 Cursor Rules 转换为 Agent 可理解的 Markdown 章节
 * 2. 说明优先级：项目规范 > 默认规范
 * 3. 处理与 YAPI 的协同关系
 */

/**
 * 格式化 Cursor Rules 章节
 * 
 * @param cursorRules - 项目 Cursor Rules 内容
 * @returns Markdown 格式的 Cursor Rules 章节
 */
export function formatCursorRulesSection(cursorRules: string): string {
  if (!cursorRules?.trim()) {
    return '';
  }

  let section = '---\n\n## 📋 项目 Cursor Rules\n\n';
  section += `> **规则来源**: 项目定义的代码规范\n`;
  section += `> **优先级**: 项目规范，优先于默认规范\n\n`;
  section += `以下是项目定义的代码规范，**请在生成所有代码时严格遵守**：\n\n`;
  section += `\`\`\`markdown\n${cursorRules}\n\`\`\`\n\n`;
  section += `**规则说明**：\n`;
  section += `- 这些规则是项目特定的代码规范\n`;
  section += `- 如果规则与默认规范冲突，以本规则为准\n`;
  section += `- **与 YAPI 的协同**（如果 Prompt 中有 YAPI 章节）：\n`;
  section += `  - API 层（api/ 目录）的**字段名**必须与 YAPI 完全一致（不受本规则影响）\n`;
  section += `  - API 层的接口名、函数名、文件组织遵循本规则\n`;
  section += `  - UI 层（components/、hooks/、index.tsx）的所有命名遵循本规则\n`;
  section += `- 用户明确要求时除外\n\n`;
  
  section += `**示例**：\n`;
  section += `\`\`\`typescript\n`;
  section += `// YAPI 定义：user_id (蛇形) | Cursor Rules：使用 camelCase\n\n`;
  section += `// ✅ 正确：API 层保持 YAPI 原样\n`;
  section += `export interface IUserRequest {\n`;
  section += `  user_id: string;  // 与后端完全一致\n`;
  section += `}\n\n`;
  section += `// ✅ 正确：UI 层遵循项目规范\n`;
  section += `const [userId, setUserId] = useState('');  // 驼峰\n`;
  section += `api.getUser({ user_id: userId });  // 使用 YAPI 字段名\n`;
  section += `\`\`\`\n\n---\n`;

  return section;
}
