# Figma 设计数据降噪预处理方案

本文档说明 figma2code 如何将 Figma REST API 返回的原始 JSON，转换为适合 LLM 生码的规范化设计数据（Normalized Design）。

**核心目标**：在保留还原设计所需语义的前提下，尽可能压缩上下文体积、消除结构冗余、统一表达方式。

**代码入口**：`packages/core/src/mcp/figma/index.ts` → MCP 工具 `get_figma_data`

---

## 1. 背景与问题

Figma REST API 返回的数据面向编辑器渲染，包含大量对生码无意义或重复的信息：

| 问题类型 | 典型表现 |
|----------|----------|
| 结构冗余 | 设计师常用的包裹 Frame、深层 Vector 树、列表/表格重复行 |
| 样式冗余 | 相同 fill / layout / textStyle 在每个节点上重复出现 |
| 语义噪声 | 不可见节点、默认值、自动生成的节点名、BOOLEAN 属性为 false |
| 表达差异 | Figma 原生字段（layoutMode、strokeAlign 等）与 CSS 语义不一致 |
| 体积极大 | 图标 SVG 字符串、重复列表项、内部 node id |

若直接将原始 JSON 交给 LLM，会导致上下文膨胀、注意力分散，并降低生码质量。

---

## 2. 整体架构

```
Figma REST API 原始响应
        │
        ▼
┌───────────────────────────────────────┐
│  normalizeRawFigmaObject              │  design-extractor.ts
│  · 过滤不可见节点                      │
│  · 组件名语义化                        │
│  · 单遍树遍历 + Extractors             │
│  · afterChildren 结构压缩              │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  SVG 内容拉取                          │  Figma Export API
│  · 为 IMAGE-SVG 节点填充 svgContent    │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  detectAndFoldRepetition              │  transformers/repetition.ts
│  · 检测并折叠连续重复兄弟结构           │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  deduplicateSvgContent                │  index.ts
│  · 相同 SVG 字符串引用化到 globalVars  │
└───────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────┐
│  stripFieldsForLLM                    │  index.ts
│  · 删除 id、通用 name 等 LLM 无用字段   │
└───────────────────────────────────────┘
        │
        ▼
  JSON 返回给 LLM（nodes + globalVars + metadata）
```

**输出结构**：

```typescript
{
  metadata: { name: string },           // 文件/页面名
  nodes: NormalizedNode[],              // 规范化节点树
  globalVars: {
    styles: Record<string, StyleTypes>  // 去重后的样式表
  }
}
```

---

## 3. 阶段一：API 响应解析

**文件**：`packages/core/src/mcp/figma/extractors/design-extractor.ts`

`normalizeRawFigmaObject` 接收 `GetFileResponse` 或 `GetFileNodesResponse`，调用 `parseAPIResponse` 完成：

1. **聚合组件信息**：合并 `components`、`componentSets`、`styles`（extraStyles）
2. **提取待遍历节点**：
   - 单节点请求：取 `data.nodes[*].document`
   - 全文件请求：取 `data.document.children`
3. **过滤不可见节点**：`visible === false` 的节点不进入后续流程

### 组件名语义化

对 INSTANCE 节点，优先使用 **Component Set 名称**（如 `"Tabs"`），而非变体名（如 `"Style=Default, 顶头=True"`）：

```typescript
const name =
  comp.componentSetId && componentSets[comp.componentSetId]
    ? componentSets[comp.componentSetId].name
    : comp.name;
```

这样 LLM 能直接识别设计系统组件，而不是 Figma 内部的 variant 字符串。

---

## 4. 阶段二：单遍树遍历与 Extractors

**文件**：
- `packages/core/src/mcp/figma/extractors/node-walker.ts` — 遍历引擎
- `packages/core/src/mcp/figma/extractors/built-in.ts` — 内置 Extractor 实现

### 4.1 遍历模型

`extractFromDesign` 对每个可见节点：

1. 创建 `NormalizedNode` 基础字段（`id`、`name`、`type`）
2. 依次调用所有 Extractor（单遍，不重复扫树）
3. 递归处理子节点
4. 调用 `afterChildren` 回调做结构后处理
5. 将最终 children 挂到父节点

**类型转换**：`VECTOR` → `IMAGE-SVG`（统一图标/矢量节点的类型标识）

### 4.2 四个内置 Extractor

| Extractor | 职责 | 降噪手段 |
|-----------|------|----------|
| `layoutExtractor` | 布局（flex、padding、gap、sizing 等） | 样式引用化；省略 CSS 默认值 |
| `textExtractor` | 文本内容、textStyle、textSegments | 样式引用化；命名 Style 优先 |
| `visualsExtractor` | fills、strokes、effects、opacity、borderRadius | 过滤不可见 paint；opacity≠1 才输出 |
| `componentExtractor` | INSTANCE 的 componentName、componentProperties | 过滤 BOOLEAN=false 属性 |

### 4.3 样式引用化（核心降噪机制）

`findOrCreateVar` 将样式值存入 `globalVars.styles`，节点上只保留引用 key：

```
节点 A: { fills: "fill_0" }
节点 B: { fills: "fill_0" }    ← 相同 fill，共享引用
globalVars.styles.fill_0 = ["#FFFFFF"]
```

**去重逻辑**：通过 `JSON.stringify` 比较值是否相同，相同则复用已有 key。

**命名 Style 优先**：若节点绑定了 Figma Style（如 `"Primary/Body"`），直接用 Style 名称作为 key，便于与设计系统对齐。

**默认值省略**（layout.ts / style.ts / effects.ts）：

| Figma 值 | 处理方式 |
|----------|----------|
| `opacity === 1` | 不输出 |
| `primaryAxisAlignItems === "MIN"` | 不输出（CSS flex-start 默认） |
| `strokeAlign === "INSIDE"` | 不输出（CSS box-sizing 默认） |
| 不可见 fill / stroke / effect | `isVisible()` 过滤 |

### 4.4 表达转换

原始 Figma 字段被转换为 CSS 友好结构：

- **布局**：`layoutMode: "HORIZONTAL"` → `{ display: "flex", flexDirection: "row" }`
- **颜色**：SOLID fill → `#RRGGBB` 或 `rgba(...)`（opacity=1 时用 hex）
- **渐变**：Figma gradient handles → `linear-gradient(...)` 等 CSS 语法
- **效果**：DROP_SHADOW / INNER_SHADOW → `box-shadow`；LAYER_BLUR → `filter`
- **图片 fill**：附带 `placeholderUrl`（基于 bounding box 尺寸生成占位图 URL）

---

## 5. 阶段三：afterChildren 结构压缩

**文件**：`packages/core/src/mcp/figma/extractors/built-in.ts`

在子节点处理完成后、`afterChildren` 管道按顺序执行三个回调（`composeAfterChildren` 组合）：

```
collapseSvgContainers → flattenTransparentFrames → annotateSiblingOverlap
```

### 5.1 collapseSvgContainers — SVG 容器折叠

**条件**：FRAME / GROUP / INSTANCE / BOOLEAN_OPERATION 的所有子节点类型均属于 SVG 可导出类型：

```
IMAGE-SVG, BOOLEAN_OPERATION, STAR, LINE, ELLIPSE, REGULAR_POLYGON, RECTANGLE
```

**效果**：
- 父节点 `type` 改为 `IMAGE-SVG`
- 子节点全部丢弃（后续通过 Export API 拉取合并 SVG）

**收益**：将「Frame 包裹 20 个 Vector」压缩为单个 `IMAGE-SVG` 节点。

### 5.2 flattenTransparentFrames — 透明容器扁平化

**可扁平化条件**（全部满足）：

1. 类型为 FRAME 或 GROUP（INSTANCE 有语义，不扁平化）
2. 视觉透明：无 fills / borderColor / borderRadius / effects / 非 1 的 opacity
3. 无间距贡献：无 padding、gap、scroll overflow
4. 布局方向与父级兼容：
   - 单个子节点：总是扁平化
   - 同方向（row-row 或 column-column）：扁平化
   - 交叉方向且 ≥2 个子节点：保留（布局边界有语义）
5. 父级必须是 auto-layout（`display: flex`）

**效果**：透明包裹层的 children 被提升到父级，减少无意义嵌套。

### 5.3 annotateSiblingOverlap — 兄弟重叠标注

当父 Frame 的 `itemSpacing < 0`（子元素视觉重叠）时，给第 2 个及之后的子节点添加 `_overlapPreviousPx`。

**目的**：帮助 LLM 识别需要负 margin 的布局模式（如移动端 header 延伸到底部卡片后面），属于语义增强而非体积压缩。

---

## 6. 阶段四：SVG 内容拉取

**文件**：`packages/core/src/mcp/figma/index.ts`

遍历完成后，收集所有 `IMAGE-SVG` 节点（排除含 raster IMAGE fill 的容器），通过 Figma Export API 批量拉取 SVG markup，写入节点的 `svgContent` 字段。

**时序要求**：必须在 `detectAndFoldRepetition` **之前**执行，以便重复折叠时能捕获 `svgContent` 差异到 `_repeat.variables`。

---

## 7. 阶段五：重复结构折叠

**文件**：`packages/core/src/mcp/figma/transformers/repetition.ts`

`detectAndFoldRepetition` 自底向上遍历，对每个父节点的兄弟节点做结构指纹匹配。

### 7.1 结构指纹（Structural Fingerprint）

指纹包含（结构身份）：
- `type`、`layout` ref、`componentName`、`textStyle` ref
- fills / strokes / effects / opacity 的**存在性**（bool，非具体值）
- 子树的递归指纹
- 已有的 `_repeat.count` 和 `_repeat.variables`（防止错误二次折叠）

指纹**不包含**（实例内容）：
- `text` 具体值、`name`、`id`
- 具体的 fills / strokes / effects 引用值
- `componentProperties` 的值

### 7.2 折叠规则

1. 兄弟节点按指纹分组
2. 只处理**连续**相同指纹的 run（长度 ≥ 2）
3. 保留 run 中第一个节点作为 exemplar
4. 标注 `_repeat: { count: N, variables?: [...] }`
5. 删除 run 中其余节点
6. **纯 TEXT 兄弟不折叠**（文本节点本身就是内容载体）

### 7.3 变量提取（Variable Extraction）

对折叠的多个实例，diff 以下属性，写入 `_repeat.variables`：

```
name, text, svgContent, layout, fills, borderColor, effects,
textStyle, borderRadius, border*, strokeDashes, strokeAlign, opacity
```

以及递归 diff 子节点（`children[i].*` 路径）。

**示例**：10 行相同结构的表格行 → 1 个 exemplar + `_repeat.count: 10` + 各列 text 差异。

---

## 8. 阶段六：SVG 内容去重

**文件**：`packages/core/src/mcp/figma/index.ts` → `deduplicateSvgContent`

相同 SVG 字符串只存一份到 `globalVars.styles`：

```
节点 A: { svgContent: "svg_0" }
节点 B: { svgContent: "svg_0" }    ← 相同 SVG
globalVars.styles.svg_0 = "<svg>...</svg>"
```

---

## 9. 阶段七：LLM 输出清理

**文件**：`packages/core/src/mcp/figma/index.ts` → `stripFieldsForLLM`

| 字段 | 处理 |
|------|------|
| `id` | 删除（Figma 内部 ID，对生码无语义） |
| `nodeId` | 仅当 `includeNodeIds=true` 时保留（merged-query 模式用于组件 evidence） |
| `name` | 删除自动生成的通用名（匹配 `Frame 427320692`、`Group 12` 等模式） |

---

## 10. 缓存策略

规范化后的完整 MCP 返回结果按以下 key 缓存（进程级，会话结束自动清理）：

```
normalized:{fileKey}:{nodeId|full}:{depth}:nodeIds={0|1}
```

缓存范围：`normalizeRawFigmaObject` + SVG 拉取 + 重复折叠 + SVG 去重 + stripFieldsForLLM 的完整 pipeline 输出。

---

## 11. 调试与日志

每次 `get_figma_data` 调用会在 `logs/` 目录写入两份 JSON：

| 文件 | 内容 |
|------|------|
| `{timestamp}_{fileKey}_{nodeId}_raw-node-tree.json` | Figma API 原始响应 |
| `{timestamp}_{fileKey}_{nodeId}_normalized-node-tree.json` | 降噪后的规范化数据 |

可用 `pnpm run coverage:figma` 对 logs 下的 raw JSON 汇总标注覆盖率。

---

## 12. 关键数据结构

### NormalizedNode（精简）

```typescript
interface NormalizedNode {
  id: string;                    // 遍历阶段使用，最终 strip 掉
  name: string;                  // 通用名会被 strip
  type: string;                  // FRAME | TEXT | INSTANCE | IMAGE-SVG | ...

  // 文本
  text?: string;
  textStyle?: string;            // → globalVars.styles 引用
  textSegments?: NormalizedTextSegment[];

  // 外观（均为 globalVars 引用）
  fills?: string;
  borderColor?: string;
  effects?: string;
  opacity?: number;              // 仅 ≠ 1 时存在
  borderRadius?: string;

  // 布局
  layout?: string;               // → globalVars.styles 引用

  // 组件
  componentName?: string;
  componentProperties?: ComponentProperties[];

  // SVG
  svgContent?: string;           // 原始 markup 或引用 key

  // 结构
  children?: NormalizedNode[];

  // 后处理标注
  _repeat?: { count: number; variables?: RepeatVariable[] };
  _overlapPreviousPx?: number;
}
```

### GlobalVars

```typescript
interface GlobalVars {
  styles: Record<string, StyleTypes>;
  // StyleTypes = NormalizedTextStyle | NormalizedFill[] | NormalizedLayout
  //            | NormalizedStroke | NormalizedEffects | string (SVG)
}
```

---

## 13. 设计原则总结

| 原则 | 实现 |
|------|------|
| **引用优于内联** | 样式、SVG 字符串统一进 globalVars，节点只持 key |
| **结构优于细节** | 重复兄弟折叠保留结构骨架 + 变量 diff |
| **语义优于原始** | Figma 字段 → CSS 语义；Component Set 名 → 组件名 |
| **省略默认值** | opacity=1、flex-start、INSIDE stroke 等不输出 |
| **删除无意义信息** | 不可见节点、BOOLEAN=false、generic name、internal id |
| **保序折叠** | 只折叠连续重复，非相邻重复保留原位 |

---

## 14. 相关源码索引

| 模块 | 路径 | 职责 |
|------|------|------|
| MCP 入口 | `packages/core/src/mcp/figma/index.ts` | 工具定义、pipeline 编排、缓存 |
| 设计提取 | `packages/core/src/mcp/figma/extractors/design-extractor.ts` | API 响应解析、组件名映射 |
| 树遍历 | `packages/core/src/mcp/figma/extractors/node-walker.ts` | DFS + Extractor 调度 |
| 内置 Extractor | `packages/core/src/mcp/figma/extractors/built-in.ts` | 四大 Extractor + afterChildren |
| 布局转换 | `packages/core/src/mcp/figma/transformers/layout.ts` | Figma layout → CSS flex |
| 样式转换 | `packages/core/src/mcp/figma/transformers/style.ts` | fill/stroke/gradient → CSS |
| 效果转换 | `packages/core/src/mcp/figma/transformers/effects.ts` | shadow/blur → CSS |
| 文本转换 | `packages/core/src/mcp/figma/transformers/text.ts` | 文本提取与 sanitize |
| 重复折叠 | `packages/core/src/mcp/figma/transformers/repetition.ts` | 结构指纹 + 变量提取 |
| 类型定义 | `packages/core/src/mcp/figma/extractors/types.ts` | NormalizedNode / GlobalVars 等 |
| Figma API | `packages/core/src/mcp/figma/services/figma.ts` | 原始数据拉取、SVG export |

---

## 15. 扩展点

如需新增降噪策略，常见接入方式：

1. **新增 Extractor**：在 `built-in.ts` 实现 `ExtractorFn`，加入 `allExtractors` 数组
2. **新增 afterChildren 回调**：实现 `(node, result, children) => NormalizedNode[]`，加入 `composeAfterChildren(...)` 管道
3. **新增后处理 pass**：在 `index.ts` 的 SVG 拉取与 `stripFieldsForLLM` 之间插入
4. **调整 strip 规则**：修改 `stripFieldsForLLM` 或 `GENERIC_NAME_RE` 正则

新增策略应遵循：**不破坏已有语义、可逆 diff 优于硬删、优先引用化而非丢弃**。
