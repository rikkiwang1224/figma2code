# crud-list（增删改查列表页）

适用场景：搜索区 + 表格 + 操作列（View/Edit/Delete）+ 操作按钮（Create）+ 可选批量操作。
核心组件：**ProTable**（react-pro-components）。

> 目录分层、types 派生、adapter 转换、Options 函数化等通用规范见 `common-template`，本文件只讲 **ProTable 特有的代码组织方式**。

---

## 核心理念：单 Hook + 配置剥离

### 架构总览

```
index.tsx                     hooks/use-table-props.tsx
┌───────────────────┐        ┌───────────────────────────────┐
│ const { props }   │───────▶│ state（form, pagination 等）  │
│   = useTableProps │        │ fetchList 数据获取             │
│ return <ProTable  │        │ handlers 操作处理             │
│   {...props} />   │        │ 组装 proTableProps 并返回      │
└───────────────────┘        └──────┬──────────┬─────────────┘
                                    │          │
                      hooks/use-search-fields.tsx hooks/use-table-columns.tsx
                      ┌──────────────────────┐    ┌──────────────────────┐
                      │ getSearchFields()    │    │ getTableColumns()    │
                      │ 纯函数，返回          │    │ 纯函数，返回          │
                      │ fields 配置数组       │    │ columns 配置数组      │
                      └──────────────────────┘    └──────────────────────┘
```

### 拆分原则

- **use-table-props**（hook）：管状态、管副作用、组装 proTableProps
- **use-search-fields / use-table-columns**（纯函数）：纯配置，通过参数接收动态依赖（options、sorterModel 等）

**为什么这样拆**：fields 和 columns 是纯配置映射，不依赖 React hooks，抽成纯函数后 use-table-props 只剩状态管理 + proTableProps 组装，职责清晰。ProTable 的 `searchForm`、`table`、`fetchData` 之间有强耦合（fetchList 需要 form 实例 + pagination 状态），所以状态管理不能再拆。

### use-table-props 中的调用方式

```tsx
const fields = useMemo(() => getSearchFields(tripTypeOptions), [tripTypeOptions]);
const columns = useMemo(() => getTableColumns({ tripTypeOptions, sorterModel }), [tripTypeOptions, sorterModel]);
```

---

## ProTableProps 组装结构

```tsx
const proTableProps = {
  // 1. 筛选表单
  searchForm: {
    formProps: { form },        // 传入 form 实例
    fields,                     // 来自 getSearchFields()
    footerProps: { showReset: true },
    columns: 3,                 // 每行元素个数
  },

  // 2. 操作按钮区（搜索区与表格之间）
  operation: ( <>{/* Create、Export 等按钮 */}</> ),

  // 3. 批量操作栏（有批量操作时启用，配合 table.rowSelection）
  massTool: {
    label: null,
    sticky: true,
    text: ProTable.formatText('%d Item(s) Selected', selectedRowKeys.length),
    button: ( <>{/* 批量操作按钮 */}</> ),
  },

  // 4. 表格主体
  table: {
    dataSource,
    columns,                    // 来自 getTableColumns()
    rowKey: 'id',
    pagination,
    scroll: { x: '100%' },
    actionColumn: {             // 操作列
      fixed: 'right',
      actions: (record) => [
        { children: 'View', onClick: () => handleView(record) },
        { children: 'Edit', onClick: () => handleEdit(record) },
      ],
    },
    rowSelection: { selectedRowKeys, onChange: setSelectedRowKeys },
  },

  // 5. 数据获取（声明式）
  fetchData: {
    fetcher: async (info) => { await fetchList(info.pagination); },
    fetchOnMount: true,         // 挂载时自动获取
    fetchOnFormChange: false,   // 字段变化不触发（避免频繁请求）
    fetchOnFormReset: true,     // 重置时触发
    fetchOnFormSubmit: true,    // 搜索时触发
    fetchOnTableChange: true,   // 分页/排序变化时触发
  },
};
```

### fetchData 串联逻辑

```
用户点击 Search
  → fetchData.fetchOnFormSubmit 触发 fetcher
    → fetcher 调用 fetchList({ current, pageSize })
      → fetchList 内部：adapter 转换表单值 + 组合分页参数 → 调用 API
        → 更新 dataSource + pagination
```

---

## 速查表

### fields 字段类型映射

| 设计稿视觉 | type 值 | 要点 |
|-----------|---------|------|
| 普通输入框 | `'input'` | |
| 数字输入 | `'inputNumber'` | `ctrlProps.showControls: false` 隐藏加减按钮 |
| 下拉单选 | `'select'` | 默认单选，无需设 `mode` |
| 下拉多选 | `'select'` | `ctrlProps: { mode: 'multiple', maxTagCount: 'responsive' }` |
| 日期选择 | `'datepicker'` | |
| 日期范围 | `'rangepicker'` | `ctrlProps.showTime: true` 带时间 |
| 级联选择 | `'cascader'` | |

### columns 列配置

| 需求 | 配置 |
|------|------|
| 超长文本省略 | `lineClamp: 1, ellipsis: true` |
| 固定列 | `fixed: 'left'` 或 `fixed: 'right'` |
| 列头提示 | `hint: 'Tooltip内容'` |
| 排序 | `sorter: { key, value, multiple, directions }` |
| 枚举值映射显示 | `fieldConfig: { type: 'select', ctrlProps: { options } }` |
| 自定义渲染 | `render: (val, row) => <Component />`，render 只做数据透传 |

### 列渲染组件抽取时机

| 场景 | 做法 |
|------|------|
| 简单文本/数字 | 直接用 `dataIndex` |
| 无状态的简单 JSX | 可以 inline render |
| 枚举值 → 彩色 Tag | 抽展示组件，接收 `val` + `options` |
| 图片 + 文本组合 / 多行结构 | 抽展示组件 |
| 需要展开/收起、弹窗、hover、复制、异步等局部状态 | 必须抽 PascalCase Cell 组件，render 只写 `<Cell record={row} />` |
| 需要 `useState` / `useMemo` / `useEffect` / `useCallback` / `useRef` | Hook 只能写在 Cell 组件或自定义 Hook 顶层，禁止写在 column render 回调里 |

---

## ❌ 常见错误

| 错误 | 正确做法 |
|------|---------|
| 把 fields/columns 定义内联在 use-table-props 里 | 抽到 `use-search-fields.tsx` / `use-table-columns.tsx` 纯函数 |
| 在 index.tsx 写 state/fetch 逻辑 | 全部放 `hooks/use-table-props.tsx` |
| ProFilter + Table 分离写法 | 搜索和表格中间无自定义区域时，用 ProTable 一体化 |
| 独立 Pagination 组件 | 用 `table.pagination` 属性 |
| fetchOnFormChange: true | 设为 false，避免每改一个字段就发请求 |
