# 组件库速查（Ant Design）

1. **基础组件** → `antd`（Button、Form、Table、Modal、Drawer…）
2. **列表页一体** → `@ant-design/pro-components` 的 `ProTable`
3. **独立搜索区** → `QueryFilter` + `Table`
4. **配置化表单** → `ProForm` / `BetaSchemaForm`

示例：

- ✅ `{ componentName: "Button", library: "antd" }`
- ✅ `{ componentName: "ProTable", library: "ant-design-pro-components" }`
- ❌ 把 ProTable 拆成多个 antd 基础组件拼凑（除非设计明确不是一体表格）

图标统一使用 `@ant-design/icons`，命名如 `SearchOutlined`。
