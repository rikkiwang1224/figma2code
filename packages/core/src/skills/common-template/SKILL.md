---
name: common-template
description: 统一样板间 目录、分层、命名、代码/样式/图标规范及严禁行为
---

# 统一样板间规范

## 设计原则

- **微模块化**：按业务功能归类，以「功能模块」为一级分类、「文件职能」为次级分类；领域内路由、数据模型、视图、组件、API 内聚。
- **就近原则**：相关资源就近放置，通用程度逐级上升。
- **扁平化**：减少无关层级；同类型文件超过 3 个可建文件夹归类。

---

## 目录与分层规范

每个微模块负责本领域内的事务：路由、数据模型、视图、组件、API 等内聚在一起。

### 📂 目录结构总览

| 目录/文件 | 职责 | 说明 |
| --- | --- | --- |
| **api/** | 接口请求 + mock 数据 | `mock-data.ts` 存放 mock 数据。只有存在**明确 API 契约**时才增加 `index.ts` 和 `types.ts`（**I 开头**）。**mock 数据统一放此目录**。 |
| **types.ts** | 页面数据模型 | 页面用类型（搜索表单、表格列、列表项）。默认定义独立页面模型；只有存在 API 类型时，才从 API 类型派生页面模型。 |
| **adapter/** | 页面数据 ↔ 接口数据转换 | `index.ts` 中 `getSearchParams(formValue)`、`toPageModel(apiRes)` 等。 |
| **const.ts** | 常量、枚举、Options | 枚举、下拉选项（用国际化函数做文案），按需创建。 |
| **hooks/** | 复用逻辑、状态、副作用 | `use-[feature]-config.tsx`、`use-[feature]-action.tsx` 等。 |
| **components/** | 业务组件 | `[Name]/index.tsx` + 样式文件（文件名以系统提示词配置为准），可按需含自身 hooks/types/const。 |
| **index.tsx** | 页面入口 | UI 展示 + 发起请求（或使用 mock），只使用 `types.ts` 与 `api` 暴露的类型/数据。 |
| **icons/** | 自定义 SVG 图标 | 图标库中不存在、从 Figma SVG 还原的图标；每图标一个文件（kebab-case），导出 React 组件。 |
| **utils/** | 工具函数 | 按需创建。 |

### api 层

- 存放后端接口请求和 mock 数据。无明确 API 契约时，只创建 `api/mock-data.ts`。
- **api/types.ts**：仅在存在 API 契约时创建，类型以 **I 开头**。
- **api/index.ts**：仅在存在 API 契约时创建，并 `export * from './types'`。
- **api/mock-data.ts**：**所有页面的 mock 数据必须放在此文件**，导出 mock 数组（如 `export const mockLogList: LogRecord[] = [...]`），类型使用页面 `types.ts` 中的列表项类型；页面从 `./api/mock-data` 引入，**禁止在 index.tsx 或组件内写大段 mock 数组**。
- 即使页面没有后端接口，只要有 mock 数据就需要创建 `api/` 目录；此时只创建 `api/mock-data.ts`。

### types.ts（页面数据模型）

- 定义**页面**使用的数据模型（搜索表单、表格列、列表项等）。
- 默认直接定义页面模型，不依赖 API 层类型。
- 只有存在 `api/types.ts` 时，才在 `types.ts` 中从 API 类型派生页面用类型（扩展、Omit、Pick 等），保持接口模型与页面模型边界清晰。
- 示例：列表项展示类型 `ColumnInfo = IListResponse['list'][0]`；筛选表单 `SearchModel extends Omit<IListRequest, 'pageno'|'count'|'create_start_time'|'create_end_time'> { create_time: number[] }`。

### adapter 层

- **页面数据 → 接口数据**、**接口数据 → 页面数据**的转换。
- 例如：`getSearchParams(formValue: SearchModel): IListRequest`（`create_time: number[]` → `create_start_time`、`create_end_time`）。
- 有表单/表格且字段需要与接口字段转换时创建 `adapter/index.ts`。

### const.ts

- 页面所需下拉选项枚举、状态、常量。选项文案用国际化函数做国际化。
- 有枚举或多选项时创建 `const.ts`。

### hooks

- 复用逻辑、抽象状态、副作用。复杂业务（表格 CRUD、表单校验、联动）拆到 hooks。
- 可按功能拆分：`useSearchFormConfig` 、`useTableData`、`useTableActions`、`useTableColumns` 等，并可组合。

### components

- 业务组件（UI 组件一般为公用）。每个组件可有自己的 `index.tsx` + 样式文件，复杂时可含 hooks/types/const，与页面分层一致。

### index.tsx（页面入口）

- UI 展示 + 发起公共接口请求（或使用 `api/mock-data`）。只使用 `types.ts` 中的类型和 `api` 暴露的数据/类型，不直接依赖 API 内部结构。

#### 数据加载规范

**原则**：有 API 契约时可在 async 函数中切换真实 API / Mock；无契约时只使用 `api/mock-data.ts`。

**有真实 API 契约的 ProTable 场景**：

```typescript
const fetchData = React.useCallback(async (searchParams = {}, current = 1, pageSize = 20) => {
  setLoading(true);
  try {
    const res = await fetchVendorStock({ ...searchParams, page_no: String(current), count: String(pageSize) });
    // const res = mockVendorStockList;  // 开发时可切换到 Mock
    
    setDataSource(transformData(res.vendor_stock_list));
    setPagination({ current, pageSize, total: res.total });
  } finally {
    setLoading(false);
  }
}, [transformData]);
```

**有真实 API 契约的详情页/Modal**：

```typescript
React.useEffect(() => {
  const loadData = async () => {
    const res = await fetchDetail({ id });
    // const res = mockDetail;  // 开发时可切换
    setData(res);
  };
  loadData();
}, [id]);
```

**要点**：
- 有真实 API 契约时 import：`import { fetchXxx } from './api'; import { mockXxx } from './api/mock-data';`
- 无 API 契约时只 import：`import { mockXxx } from './api/mock-data';`
- 有真实 API 契约时使用相同变量名（`res`）便于切换

---

## 拆分模式（Split Heuristics）

| 模式          | 特征                  | 决策                                                         | 优先级  |
| ------------- | --------------------- | ------------------------------------------------------------ | ------- |
| **Pattern B** | Modal/Drawer/Popover  | `components/[feature]-drawer`、`components/[feature]-modal` 或 `components/[feature]-popover` | 🔴 最高 |
| **Pattern C** | Table/ProTable/Form/ProForm | `components/[feature]-table`、`components/[feature]-form` + 按需 `hooks/use-[feature]-config.tsx` | 🟠 高   |
| **Pattern A** | 多个相似子节点        | `components/[item]-item`                                     | 🟡 中   |
| **Pattern D** | Header/Footer/Sidebar | `components/[feature]`                                       | 🟢 低   |

**输出要求**：功能一致 + 可运行 + 类型完整 + 路径正确；有 mock 必有 `api/mock-data.ts`；有表单 ↔ 接口转换时提供 `adapter/index.ts`；有枚举/选项时提供 `const.ts`。

---

## 命名规范

| 类型                | 规范                 | 示例                                                               |
| ------------------- | -------------------- | ------------------------------------------------------------------ |
| **文件/目录**       | kebab-case           | `mock-data.ts`、`use-table-config.tsx`                             |
| **组件目录**        | kebab-case           | `page-header`、`config-modal`                                      |
| **api 接口类型**    | 以 **I 开头**        | `IListRequest`、`IListResponse`                                    |
| **自定义图标文件** | kebab-case，导出 PascalCase 组件 | `arrow-right.tsx` → `ArrowRightIcon` |
| **CSS Module 类名** | 组件前缀，避免通用名 | `.pageContainer`、`.searchFormInput`，禁止 `.container`、`.button` |

---

## 样式规范

> 具体的样式文件名（如 `index.module.less`）和语法（Less/SCSS/CSS）以系统提示词中「项目代码风格定制」章节为准。以下规则适用于所有样式方案。

1. **所有静态样式提取到样式文件**：不使用 inline style（除非是动态样式）
2. **文件命名**：使用项目配置的样式文件名（默认 `index.module.less`）
3. **Class 命名**：业务样式 class 使用 **camelCase**（CSS Modules），避免与 `antd` 默认 class 冲突
   - 组件名 `SearchForm` → 前缀 `searchForm`（`.searchFormContainer`、`.searchFormInput`）
   - 主入口 → 前缀 `page`（`.pageContainer`、`.pageHeader`）
4. **禁止通用名称**：`.container`、`.input`、`.button`、`.form`、`.select`、`.table` 等

```tsx
// components/SearchForm/index.tsx
import styles from './<项目样式文件>';
<div className={styles.searchFormContainer}>...</div>
```

**动态样式允许 inline**：`style={{ width: \`\${w}px\`, color: isActive ? '#1890ff' : '#333' }}`

---
