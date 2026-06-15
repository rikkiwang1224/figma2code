---
name: pc-page-patterns
description: PC 端页面模式代码骨架 — 按页面类型（crud-list、form-modal 等）提供惯用代码组织方式

---

# PC 端页面模式代码骨架

> **适用范围**：PC 端（react-pro-components + ssc-ui-react
>
> **与其他 Skill 的关系**：
> - `common-template`：通用目录结构、命名、样式规范 → 仍以它为准
> - `component-spec`（Step 3 查询）：组件 API 类型 → 仍以它为准
> - 本 Skill 补充：**「这类页面应该怎么组织代码」**的模式级惯用法

---

## 模式索引

根据第 1 步识别的页面模式，用 `Read` 工具加载**精确匹配**的参考骨架文件：

| 页面模式 | Read 路径 | 核心组件 | 适用场景 |
|---------|---------|---------|---------|
| **crud-list** | `.claude/skills/page-patterns/reference/crud-list.md` | ProTable/Table | 搜索区 + 表格 + 操作列 + 操作按钮 |

<!-- 后续模式待补充 -->
<!-- | **form-page** | `.claude/skills/pc-page-patterns/reference/form-page.md` | ProForm / ProForm.CardForm | 独立表单页（新建/编辑） | -->
<!-- | **detail-page** | `.claude/skills/pc-page-patterns/reference/detail-page.md` | Descriptions / PageHeader | 只读详情展示页 | -->
<!-- | **step-form** | `.claude/skills/pc-page-patterns/reference/step-form.md` | ProForm.StepForm | 分步表单流程 | -->

**⚠️ 操作规则**：

1. 只允许读取与 `pagePattern.primary` 精确匹配的参考骨架。
2. 如果上表没有对应模式，跳过参考骨架读取，继续按 `common-template` 和组件源码生成。
3. 禁止 fallback 到其他模式的参考文件，例如 `form-modal` / `display-modal` 不得读取 `crud-list.md`。
4. 按参考骨架组织代码，具体组件 API 以 Step 3 查询结果为准。

**如果未识别到特定模式，无需读取参考文件，直接按 `common-template` 规范生成即可。**
