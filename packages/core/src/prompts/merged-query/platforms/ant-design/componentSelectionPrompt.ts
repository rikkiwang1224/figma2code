/**
 * Ant Design merged-query component selection prompt.
 */
export function buildAntDesignComponentSelectionPrompt(): string {
  return `### 组件选择任务

**职责**：根据页面结构分析，为 Ant Design 页面选择合适的组件。若前序未给出页面结构，先根据设计推断再决策。

**Ant Design 基础组件（antd）**：
- **Layout** / **Space** / **Flex** / **Row** / **Col**：页面布局与间距
- **Form** / **Form.Item**：表单与字段绑定
- **Table**：数据表格与分页（\`pagination\` 属性）
- **Modal** / **Drawer**：弹层与抽屉
- **Tabs** / **Tabs.TabPane**：标签页切换
- **Button** / **Input** / **Select** / **DatePicker** / **RangePicker** / **Radio** / **Checkbox** / **Switch** / **Upload** 等基础控件

**Ant Design Pro 高阶组件（@ant-design/pro-components）**（复杂列表/表单页优先）：
- **ProTable**：搜索 + 表格 + 工具栏 + 分页一体
- **ProForm** / **BetaSchemaForm**：配置化表单
- **QueryFilter** / **LightFilter**：独立搜索筛选区

**组件入账与 sourceMode 规则**：
- \`components[]\` 只记录 Stage 4 会作为独立 root export 直接 import/render/use 的组件，按 \`componentName\` 去重。
- 组件实例、用途和风险写入 \`sectionRefs[].componentUsages[]\`。
- ProTable、QueryFilter、ProForm 的内化字段控件不作为独立 planned component，除非出现在高阶 owner scope 外且需要显式 import。
- \`antd\` 简单展示类组件（Button、Tag、Divider、Typography）在无复杂 props 时可用 \`sourceMode: "catalog"\`。
- Form、Table、Modal、Drawer、Select、DatePicker、RangePicker、Upload 及 Pro 组件默认 \`sourceMode: "query"\`。
- 出现 custom render、form binding、pagination、expandable、受控值或 API 不确定时，必须使用 \`sourceMode: "query"\`。

**决策表**：

| 页面结构 | 使用 | 避免 |
|---------|------|------|
| 搜索 + 表格 + 分页（同一连续区域） | ProTable | 手写 Form + Table + Pagination 拆分 |
| 独立搜索筛选区 + 下方表格 | QueryFilter + Table | 无必要的 ProTable |
| 配置化多字段表单 | ProForm / BetaSchemaForm | 大量手写 Form.Item |
| 简单弹窗表单 | Modal + Form | 过度使用 Drawer |
| 侧边详情/编辑 | Drawer + Form | 误用 Modal |
| 标准数据列表 | Table（\`pagination\`） | 单独 Pagination 组件 |

**容器判断**：
- 顶层为侧边滑出面板 → **Drawer**
- 居中弹窗/对话框 → **Modal**
- 页面模式（crud-list、form-modal、display-modal 等）只影响倾向，不自动产生组件清单。`;
}
