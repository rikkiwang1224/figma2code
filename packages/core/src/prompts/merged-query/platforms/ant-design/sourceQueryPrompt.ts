/**
 * Ant Design merged-query component source query prompt.
 */
export function buildAntDesignSourceQueryPrompt(): string {
  return `### 查询工具与参数

**工具**：
- \`mcp__component-spec__get-component-source\` — 获取组件类型定义和示例

**组件库映射**：
- 基础组件: \`"antd"\`
- Pro 组件: \`"@ant-design/pro-components"\`

**调用方式**：
- 基础组件: \`{ componentName: "Button", library: "antd" }\`
- Pro 组件: \`{ componentName: "ProTable", library: "@ant-design/pro-components", includeExamples: true }\`

**查询要求**：
- ProTable / ProForm / QueryFilter 必须传 \`includeExamples: true\`
- 重点关注 columns、fields、valueType、formItemProps、request、pagination 等 API
- 图标从 \`@ant-design/icons\` 按命名导入，例如 \`SearchOutlined\``;
}
