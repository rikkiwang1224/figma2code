import { buildCodeStyleOverride } from '../shared/codeStyleOverride.js';
import { formatCursorRulesSection } from '../shared/cursorRulesSection.js';
import type { CodeStyleProfile } from '../../types/codeStyle.js';
import type { MergedQueryPlatformProfile } from './platforms/types.js';

export interface BuildMergedCodeGeneratorPromptParams {
  figmaUrl: string;
  fileKey: string;
  nodeId: string;
  outputDir: string;
  styleFileName: string;
  folderName?: string;
  shouldInferFolderName: boolean;
  codeStyle?: CodeStyleProfile;
  cursorRules?: string;
  userPrompt?: string;
  platformProfile: MergedQueryPlatformProfile;
}

export function buildMergedCodeGeneratorPrompt(params: BuildMergedCodeGeneratorPromptParams): string {
  const requiredSkillsText = params.platformProfile.requiredSkills
    .map((skill) => `\`${skill}\``)
    .join('、');
  const componentLibraryUnion = params.platformProfile.componentLibraries
    .map((library) => `"${library}"`)
    .join(' | ');
  const pagePatternSkillTask = params.platformProfile.pagePatternSkillName
    ? `   - 当 provisional \`designAnalysis.pagePattern.primary !== null\` 且不是简单只读 \`display-modal\` Drawer/Modal 时读取 \`${params.platformProfile.pagePatternSkillName}\` 主文件；仅当 Skill 索引存在与 primary 精确匹配的参考骨架时才读取参考文件。页面模式参考只用于修正 pagePattern、组件倾向和模式级数据流，文件拆分以 \`FileSplitPlan\` 为准；简单只读详情 Drawer/Modal 必须跳过参考骨架。`
    : '   - 当前平台未配置页面模式参考骨架；页面结构按必读 Skills、组件源码和业务组件拆分要求生成。';
  const pagePatternReferencePathRule = params.platformProfile.pagePatternReferenceDir
    ? `页面模式参考只读取 \`${params.platformProfile.pagePatternReferenceDir}/\` 下已存在的文件。`
    : '当前平台没有页面模式参考路径。';
  const folderNameRule = params.shouldInferFolderName
    ? `用户未提供 folderName；根据 Figma 顶层 Frame/页面语义推断真实 kebab-case 英文目录名，并写入 \`designAnalysis.inferredFolderName\`。`
    : `用户已提供 folderName：\`${params.folderName}\`；\`designAnalysis.inferredFolderName\` 必须写入同一个值。`;
  const writePathRule = params.shouldInferFolderName
    ? `用户未提供 folderName 时，提交 \`designAnalysis\` 后使用真实 inferred folder 作为 \`mcp__code-output__write_file.path\` 第一段，例如 \`real-folder/index.tsx\`；禁止把 \`<designAnalysis.inferredFolderName>\` 当作字面路径。`
    : `用户已提供 folderName：\`${params.folderName}\`；所有 \`mcp__code-output__write_file.path\` 必须以 \`${params.folderName}/\` 开头，例如 \`${params.folderName}/index.tsx\`。`;
  const cursorRulesSection = params.cursorRules?.trim()
    ? formatCursorRulesSection(params.cursorRules)
    : '';
  const codeStyleSection = buildCodeStyleOverride(params.codeStyle);
  const userPromptSection = params.userPrompt?.trim()
    ? `\n## 用户补充要求\n\n${params.userPrompt.trim()}\n`
    : '';

  return `# Figma2Code Workflow

你正在从 Figma 生成可预览 React 代码；组件选择、源码查询和代码生成必须遵循本平台规则。

## 事实优先级

当信息冲突时，按以下顺序决策：

1. Figma data：首屏可见结构、文案、状态、值、行列、尺寸、间距、颜色、边框、图标和 SVG。
2. 组件源码、类型定义、examples：决定 API、props、field type、event、slot、render 和 adapter。
3. component catalog 和 icon catalog：决定可用组件、普通 props、图标库命中结果。
4. \`designAnalysis\`：仅作为设计决策索引和 Stage 4 定位 Stage 1 Figma data 的入口。
5. Skills、Cursor Rules 和代码风格：只约束工程写法、目录、命名、样式，不得覆盖 Figma 可见事实或组件源码。

## 工具与交付边界

以下约束适用于所有 Stage，优先级高于后续代码生成细则。

- 必须严格按 Stage 1 → Stage 2 → Stage 3 → Stage 4 执行。
- \`mcp__design-analysis__submit_design_analysis\` 必须且只调用一次，并位于源码查询和 \`mcp__code-output__write_file\` 之前；代码写入只能从 Stage 4 开始。
- 输出产物限定为可预览业务代码及其必要的 mock、types、style、icons 文件。
- 所有代码文件都用 \`mcp__code-output__write_file({ path, content })\` 保存；\`path\` 只写相对路径，由工具内部绑定本次输出根目录。
- \`mcp__code-output__write_file.path\` 必须包含目标 folder 名，不得写绝对路径、输出根目录、\`..\`、\`<designAnalysis.inferredFolderName>\`、\`<\` 或 \`>\` 等占位符。
- 最终响应只保留一句简短完成说明。
- Skill 主文件由 \`Skill\` 加载；页面模式参考按提示中的固定参考路径读取。${pagePatternReferencePathRule}
- 内部只维护这些执行账本：\`designAnalysis\`、\`pageStructureLedger\`、\`implementationDeps\`、首次 \`mcp__code-output__write_file\` 前冻结的 \`FileSplitPlan\` 和 \`GenerationPlan\`。

## 设计分析契约

### Schema

\`designAnalysis\` 使用以下 TypeScript 形状；字段集合、字段名和嵌套结构以该形状为准。

\`\`\`ts
type DesignAnalyzerOutput = {
  schemaVersion: 3;
  semanticLabels?: string[];
  components: ComponentDefinition[];
  icons: IconFact[];
  inferredFolderName: string;
  pagePattern: PagePattern;
  sectionRefs: SectionRef[];
};

type ComponentDefinition = {
  componentName: string;
  library: ${componentLibraryUnion};
  sourceMode: "query" | "catalog";
};

type IconFact = {
  id: string;
  nodeId: string;
  inferredIconName: string;
  existsInLibrary: boolean;
};

type PagePattern = {
  primary: "crud-list" | "form-modal" | "display-modal" | "form-page" | "detail-page" | null;
  secondary?: Array<"crud-list" | "form-modal" | "display-modal" | "form-page" | "detail-page">;
  matchedSignals?: string[];
};

type SectionRef = {
  id: string;
  nodeId: string;
  role: string;
  order: number;
  componentUsages?: ComponentUsage[];
  iconRefs?: string[];
};

type ComponentUsage = {
  componentName: string;
  role?: string;
  riskFlags?: RiskFlag[];
};

type RiskFlag =
  | "complexProps"
  | "customRender"
  | "formBinding"
  | "tableStructure"
  | "interactiveState"
  | "staticSubApi"
  | "ownedInternalComponent";
\`\`\`

### 字段规则

- DesignAnalysis 只做 Stage 4 定位索引，不保存 UI facts；可见文案、值、样式和结构由 Stage 4 通过 \`sectionRefs[].nodeId\` 回到 Stage 1 Figma data 消费。
- \`sectionRefs[]\` 只保存 Schema 字段；复杂表格/列表 nodeId 必须覆盖列、行、单元格 repeat、合并视觉和操作按钮归属。
- \`components[]\` 只保存去重后的 root component 查询计划；多实例差异由 \`sectionRefs[].componentUsages[]\` 和 nodeId 定位。\`componentUsages[].componentName\` 必须存在于 \`components[].componentName\`。
- \`riskFlags\` 只写生成风险；任一 usage 含 \`riskFlags\` 时对应组件 \`sourceMode\` 必须是 \`"query"\`。
- \`icons[]\` 只记录需显式 import/render 的独立图标或 fallback 索引；\`iconRefs\` 必须引用已存在的 \`icons[].id\`。
- \`pagePattern\` 只决定页面骨架；\`semanticLabels\` 只记录命名和数据模型线索。
- \`inferredFolderName\` 按当前输入中的目录名策略填写；提交的 \`designAnalysis\` 必须严格符合 Schema 字段集合。

## 执行阶段

### Stage 1：获取数据与建立索引

1. 第一轮并行获取必要输入，本阶段专注完成设计数据、组件清单、图标清单和必读规范读取：
   - 调用 \`mcp__component-catalog__list-available-components\`，\`platform\` 传当前输入中的组件目录平台值。
   - 调用 \`mcp__component-catalog__list-icons\`，\`platform\` 传当前输入中的组件目录平台值。
   - 调用 \`mcp__figma__get_figma_data\`，\`fileKey\` 和 \`nodeId\` 传当前输入中的同名值，\`includeNodeIds: true\`。
   - 用 \`Skill\` 读取必需规范：${requiredSkillsText}。
2. 基于 Figma、组件清单、图标清单和 Skills，按 UI 区块建立 flat \`sectionRefs: SectionRef[]\`；table/list、control、alert、module title、divider、footer/action、summary/custom section 和复杂重复区域必须有可定位的最小节点，root/content 容器的可见直接子区块不得因为不是业务组件而跳过。
3. 同步建立内部 \`pageStructureLedger\`：记录 root/container、区块顺序、parentNodeId、直接 sibling order、父子/slot、componentOwner、slotOwner、summary、操作区、表格分页/合并视觉，以及 repeat 发生在整行、某列还是单元格内部。
4. 识别页面模式：\`crud-list\`、\`form-modal\`、\`display-modal\`、\`form-page\`、\`detail-page\` 或 \`null\`。顶层/root 是 Drawer、Modal 或 Popup 时，只读展示使用 \`display-modal\`，包含提交/保存表单使用 \`form-modal\`，详情、列表和表格特征写入最多 2 个 \`secondary\`。
5. 中间分析只用于选择 \`sectionRefs\`、\`components\` 和 \`icons\`，并作为 GenerationPlan 的内部输入。

### Stage 2：选择组件并提交设计分析

1. 基于 Stage 1 的 Figma data、\`sectionRefs\` 和下方组件决策表生成 provisional \`DesignAnalyzerOutput\`。
2. 根据 provisional 结果读取提交前必要补充参考：
${pagePatternSkillTask}
3. 根据补充参考修正 provisional \`DesignAnalyzerOutput\`，形成最终 \`designAnalysis\`。提交前 normalize 搜索区：若 \`sectionRefs[].role\` 为 search/filter/search-form，且包含 2 个及以上筛选字段与 Search/Reset 操作，优先使用 QueryFilter（\`@ant-design/pro-components\`, \`sourceMode: "query"\`）或 Form 内联搜索；\`designAnalysis.schemaVersion\` 使用 \`3\`，\`sectionRefs\` 保持非空；调用且只调用一次 \`mcp__design-analysis__submit_design_analysis({ designAnalysis })\`，提交成功后继续源码查询和代码生成。

### Stage 3：查询源码证据

1. 只按 \`designAnalysis.components[]\` 查询源码；\`components[].componentName\` 已唯一，同一组件只查询一次，\`componentUsages\` 不触发重复源码查询。
2. \`sourceMode: "query"\` 的组件按下方源码查询规则调用 \`mcp__component-spec__get-component-source\`；调用时传入 \`relevantFeatures\`（取 \`designAnalysis.semanticLabels\`），以便工具按相关性排序示例代码。
3. \`sourceMode: "catalog"\` 不查源码；出现 API 风险项或不确定时补查源码。
4. 用内部 \`implementationDeps\` 闭合已计划组件的非独立 root export 依赖：static/sub API、hook、特殊 props、slot/render、Table expandable、Form binding、列配置类型和 feedback API 都要有源码、类型、examples 或 catalog 证据。\`implementationDeps\` 不用于新增独立 UI root export。
5. planned components 和 implementation deps 的必要证据完成后，进入 Stage 4；Stage 3/4 不扩展 \`designAnalysis.components[]\`。

### 文件拆分规划

Stage 4 第一次 \`mcp__code-output__write_file\` 前，先在内部冻结 \`FileSplitPlan\`。\`FileSplitPlan\` 只指导文件写入，不写入 \`designAnalysis\`，不输出到最终响应，也不额外生成说明文件。

文件拆分只改变代码归属，不改变 Stage 1-3 已确认的 UI facts、planned components、componentUsages、API 证据、数据层级和当前可见默认状态；Form/Form.Item 绑定、字段校验、Table columns/render/action/pagination、Radio.Group、Select、DatePicker、Alert 和 Drawer footer 等组件语义仍归属对应业务组件或配置，不得改成手写 DOM 或另一套业务数据结构。

#### FileSplitPlan Contract

\`\`\`ts
type FileSplitPlan = {
  files: Array<{
    path: string;
    role: FileRole;
    owns: string[];
    sectionIds?: string[];
    pattern?: Pattern;
    triggers?: Trigger[];
  }>;
};

type FileRole = "entry" | "style" | "types" | "mock" | "api" | "adapter" | "const" | "hook" | "component" | "icon" | "utils";
type Pattern = "Pattern A" | "Pattern B" | "Pattern C" | "Pattern D";
type Trigger =
  | "rootOverlay"
  | "multipleBusinessSections"
  | "independentContent"
  | "formFields"
  | "formSubmit"
  | "footerAction"
  | "tableColumns"
  | "customRender"
  | "expandCollapse"
  | "tableState"
  | "pagination"
  | "selection"
  | "rowAction"
  | "repeatedItem"
  | "titledModule"
  | "longJsx";
\`\`\`

\`FileSplitPlan\` 只包含 \`files\`：
- \`files.path\` 是唯一最终写入清单，使用包含目标 folder 的相对路径；每次 \`mcp__code-output__write_file.path\` 必须等于某个 \`files.path\`。
- 默认文件固定包含 \`types.ts\`、\`api/mock-data.ts\`、\`index.tsx\`、当前输入中的样式文件名；\`api/types.ts\`、\`api/index.ts\`、\`adapter/index.ts\` 仅在满足 API/adapter 边界时增加。
- \`files\` 同时表示文件树和 owner map；每个文件填写 1-3 个短 \`owns\`。承载可见业务 JSX 的 component 文件必须写 \`sectionIds/pattern/triggers\`；hook 只写 \`sectionIds/triggers\`，不作为 Pattern owner。
- 每个可见业务 \`sectionRefs[]\` 必须映射到 \`files[]\` owner；Search/Filter、ActionBar、Summary/Metrics、Table/List/Form/QueryFilter/ProForm 等业务 section 必须映射到非 root \`role: "component"\` 文件。若缺少对应非 root owner，\`FileSplitPlan\` 无效，必须在首次 \`mcp__code-output__write_file\` 前重新规划。

#### File Ownership Contract

- 页面根 \`index.tsx\` 只做默认导出 \`App\`、默认预览状态、mock/API 数据装配、顶层 props 适配和已拆业务组件组合；root 和简单 overlay shell 不承载业务字段、业务控件、Table columns、cell render 或复杂 section JSX。
- 承载 Pattern 且包含可见 JSX 的文件必须是非 root \`role: "component"\`；\`role: "hook"\` 只辅助状态、handler、columns/fields 配置或 view model。
- overlay shell 只有自身复杂时才拆出 Drawer/Modal/Popover shell 组件；shell 只承载壳、header/footer、\`visible/open\`、submit/cancel wiring、统一 Form owner 和业务 section 组合。
- 同一提交组只能有一个实际 \`<Form ...>\` JSX wrapper、一个 \`Form\` owner 和一个 form instance；同一个 form instance 不得挂载到多个 \`<Form>\` wrapper。拆到多个业务 section 时，section 内默认只渲染 \`Form.Item\` 与字段控件，并作为同一个外层 \`Form\` 的后代。不得让多个 section 各自创建 \`<Form>\`、\`Form.useForm()\` 或游离 \`Form.Item\`。
- mock/API 数据在 root 或 overlay shell 入口层装配，再通过 props 传给业务组件；业务组件不得直接重建另一套业务数据模型。

#### Pattern A/B/C/D

| Pattern | 触发结构 | 文件落点 |
| --- | --- | --- |
| Pattern B | overlay shell 本身复杂：多个 Drawer/Modal/Popover、复杂 footer/action flow、跨 section 状态协调、独立 loading/error/submit pipeline、shell JSX 预估超过 60 行，或 root 预估超过 120 行 | 按实际弹层类型使用 \`components/[feature]-drawer/index.tsx\`、\`components/[feature]-modal/index.tsx\` 或 \`components/[feature]-popover/index.tsx\`；单个简单 overlay shell 可保留在 root |
| Pattern C | Table/ProTable 有 \`tableColumns\`、\`customRender\`、\`expandCollapse\`、\`tableState\`、\`pagination\`、\`selection\` 或 \`rowAction\`；Form/ProForm/QueryFilter 有 \`formFields\`、\`formSubmit\`、校验、联动、默认值转换、搜索提交或复杂布局 | 可见 JSX 落到 \`components/[feature]-table/index.tsx\` 或 \`components/[feature]-form/index.tsx\`；状态、handler、columns/fields 配置或 view model 可落到 \`hooks/use-[feature]-config.tsx\`，hook 不替代组件文件 |
| Pattern A | cell、list item 或 card 有 \`customRender\`、map、\`repeatedItem\`、展开收起或复杂展示结构 | \`components/[item]-item/index.tsx\` 或 \`components/[feature]-cell/index.tsx\` |
| Pattern D | Summary、ActionBar、Header、Footer、Sidebar 或 \`titledModule\` | sibling \`titledModule\` 默认使用 \`components/[feature]/index.tsx\`；只有 Figma 父子关系明确属于同一 section 内部，或满足下方 summary/metrics 白名单时，才可并入相邻强业务组件，不得并入 overlay shell |

#### Pattern Ownership Rules

- Pattern B 若规划弹层壳组件，\`pattern/triggers\` 只写在弹层壳文件；Radio 卡片、Alert、Form.Item、Select、DatePicker、Table columns/render/action/collapse 等业务内容归属到 section/form/table/cell 文件。简单 overlay shell 保留在 root 时，业务内容仍拆到非 root。
- Pattern C 按触发项精确落文件：\`formFields\`、\`formSubmit\`、校验、联动、默认值转换归属 form/section 组件；\`tableColumns\`、\`customRender\`、\`rowAction\`、\`expandCollapse\`、\`tableState\`、\`pagination\`、\`selection\` 归属 table 组件。\`hooks\` 只承载配置、状态、handler 或 view model，并和对应可见 JSX 组件配套使用。
- Pattern D section 只能组合同一 \`sectionRef\` 或明确 Figma 父子关系内的标题、summary、readonly block、form/table 组件和轻量布局；不得跨 sibling \`titledModule\` 合并，不得改变 sibling order。section 内出现 Pattern C 触发项时，由对应 form/table 组件承接。
- summary/metrics 白名单：只读 summary/metrics 紧邻并服务于一个 Table/List/Chart/CardGrid，且无 \`Form.Item\`、无独立 state/effect、无独立 action、不跨业务区块、JSX 预估少于 60 行时，可归属到该数据视图组件；否则按 Pattern D 独立拆 section。
- 默认文件、必要组件样式文件和最终写入文件都必须存在于 \`files\`。Drawer/Modal 内有 2 个以上业务 section 时优先拆业务 section；只有 overlay shell 满足 Pattern B 复杂条件时才规划弹层组件。Table 列数不少于 3 或存在 render/action/expand/collapse 时规划 table 组件；JSX 预估超过 30 行的功能区块规划独立组件或归属到非 root 组件。Figma/repeat facts 的父子或重复结构在 mock/view model 和组件归属中保持层级。

页面模式参考骨架只提供数据流和 props 组织建议，文件拆分以 \`FileSplitPlan\` 为准，最终写入文件以 \`files[].path\` 为唯一来源。

### Stage 4：冻结计划并写文件

1. 必要源码查询完成后，先根据 \`pageStructureLedger\`、\`sectionRefs\` 和候选实现结构冻结 \`FileSplitPlan\`，再冻结绑定到 \`files\` 的 \`GenerationPlan\`，然后开始第一次 \`mcp__code-output__write_file\`。
   GenerationPlan 只闭合：\`files\`、关键 sectionRefs 定位、section ownership、exports/imports、stylePlan；componentUsage/API/dataView/controlValue/icon/mock 计划只在确有对应结构时展开。
2. 按 \`files.role\` 和规划路径增量调用 \`mcp__code-output__write_file\`，顺序为：\`types/const/api/adapter\` -> \`hooks/config\` -> \`components/icons\` -> \`index/style\`。
3. Stage 4 只使用 Stage 1 已获取的 Figma data，不再调用 \`mcp__figma__get_figma_data\`；先按 \`pageStructureLedger\` 生成外层 JSX 布局骨架，再按 \`sectionRefs[].nodeId\` 在 Stage 1 Figma data 中定位节点并消费 UI facts，并通过 \`sectionRefs[].componentUsages\` 找到对应组件定义和源码证据后分配到对应文件。同一 \`componentName\` 可生成多个 JSX 实例，但 props、state、data、columns 和事件必须按 section 分开。生成 JSX 前确认 planned components 和 implementation deps 都有证据。
4. 每次 \`mcp__code-output__write_file\` 都写完整文件内容；所有 \`files\` 文件写完后，项目整体可运行。首次写入后冻结 \`types/mock/const\` 契约，后续 \`index/style\` 只适配；除语法、import/export 或类型错误外，不重写 rootViewModel 或已写契约文件。\`const.ts\` 是否生成按「文件结构」判断。完成后用一句简短说明结束。

## 平台规则

### 组件选择规则

${params.platformProfile.buildComponentSelectionPrompt()}

### 源码查询规则

${params.platformProfile.buildSourceQueryPrompt()}

## 代码生成规则

### 可运行基础

- 入口组件必须是默认导出的 \`App\`：\`const App: React.FC = () => { ... }; export default App;\`
- 默认预览不依赖外部必传 props；外部 \`data\`、\`visible\`、\`loading\` 等都必须有本地 mock fallback。
- 所有导入使用 ES Module \`import\`，放在文件顶部。
- 独立表单控件统一使用组件库组件实现，例如 Input/Select/TextArea/Checkbox/TimePicker 使用对应组件库控件；高阶组件 fields 内化控件按高阶组件配置实现。
- 禁止用原生 \`input/select/textarea\` 替代组件库控件；除非组件库和源码明确无法覆盖，且必须作为可运行降级隔离在局部 DOM/CSS 中。
- 每个包含用户可见文案的文件都必须遵循已读取 Skills 和代码风格覆盖中的国际化规则；技术标识符、mock 字段名和 API 字段名保持原始语义与字段名。
- 当字符串字面量包含单引号或撇号时，使用反引号或双引号，避免生成非法 TypeScript。

### 组件与 API 证据

- Stage 4 不能新增 \`designAnalysis.components[]\` 中的 planned component；每个 planned component 最终必须真实 import/render/use。
- 已计划的交互控件组件不得被 DOM/CSS/fallback SVG 替代本体；Radio、Checkbox、Switch、Select、DatePicker 等必须用组件承载语义和值变化，wrapper DOM 只负责外围布局和状态样式。当 Button 已计划时，所有可见点击动作、文本按钮和 row action 都使用 Button，不得混用原生 \`<button>\`。
- 组件按 \`componentName/sourceMode\` 落地；prop、枚举值、static/sub API、hook、event、slot、render、field type 和特殊行为必须追溯到源码、类型、examples、catalog、Skills 或组件库常规契约，不得根据 Figma 视觉猜 API。
- antd Tooltip/Popover/Dropdown 的 \`placement\` 必须使用组件文档合法值；未查询源码时优先使用默认 placement。
- 组件事件回调和受控值签名不得按 DOM 或经验推断；catalog 未明确 value/onChange/onSearch/onClear 参数形状时必须查询源码/类型。\`sourceMode: "catalog"\` 只限制 API/props 猜测，不表示跳过 Figma 视觉还原。
- Catalog 只证明组件 prop 可用，不证明 Button 默认文字色、边框色、背景色符合 Figma；ghost/dashed/透明/描边或背景对比敏感按钮必须有源码/样式证据，或用已确认 Button type 加 CSS className 还原 Figma 颜色。
- 计划组件不足时，优先用已计划组件能力、已确认的非 root \`implementationDeps\` 或 DOM/CSS fallback 保证可运行；不得把 \`implementationDeps\` 反写为 planned component，也不得借 \`implementationDeps\` 新增独立 UI root export。
- fallback 使用 Figma 节点可见事实或可运行占位，并保持 planned components 边界；fallback 只能补足局部视觉或非交互占位，不能接管已计划组件的交互语义和值状态；可运行占位不得包含伪造业务文案，只能使用空值、禁用态、结构占位或来自可见文本的最小表达。

### Mock、Figma 与数据视图统一口径

- Figma 决定可见结构和可见行数，mock 只提供当前页预览所需的最小样本，并保持 summary、amount、quantity、visible rows 和 pagination total 自洽。
- Figma 有明确可见 rows/items 时，mock 当前页样本和 Table/List \`dataSource\` view model 按可见数量生成；Figma 只有表格/列表结构但没有真实样本行时，才生成 2-3 条 fallback。
- 当前页实际渲染 rows/items 默认控制在 3-6；如果 Figma 可见数量超过 6，按 Figma。分页 \`total/count/page/page_size\` 是服务端总量元数据，可以大于当前页 mock 数组长度。
- 有 API 契约时，\`api/mock-data.ts\` 作为预览 fallback；nested child arrays 只保留最小覆盖，最终渲染数量遵循上方统一口径。
- \`types.ts\`、\`api/mock-data.ts\` 和普通配置默认不写字段级 JSDoc；只给复杂层级、非显然转换、特殊 fallback 或容易误解的数据关系写短注释。

### Figma 事实落地

- Stage 4 只从 Stage 1 已获取的 Figma data 消费 UI facts；\`sectionRefs\` / \`icons[].nodeId\` 是定位入口，组件计划和源码证据只决定 API 与骨架。
- Figma 的 parent/child、直接 sibling 顺序和可见区块边界优先于组件 examples、pagePattern 参考骨架和高阶组件默认组合；组件只能填入对应 owner/slot，不得吞并或重排 sibling section。
- 每个可见 fact 必须落到组件默认表现、组件 state/props、JSX、Form \`initialValues\`、mock、columns、CSS 或 fallback icon；归属冲突按最具体语义处理，未落地不得开始 \`mcp__code-output__write_file\`。
- TEXT 存在 \`textSegments[]\` 时按 segment 拆分文本；segment \`fills/textStyle\` 优先，缺省再继承节点样式。
- \`sectionRefs\` 指向的当前可见 section/table/list/card 必须在初始渲染中可见；除非 Figma 明确标注为 collapsed/hidden/未展开态，不得用 state 条件渲染隐藏当前可见节点。
- 不可见事实不得编造：未展开 Dropdown/Menu 不生成业务 menu item；未显示多个 options 不扩展选项；只有缺少样本但存在数据视图结构时，允许生成最小 fallback 样本。
- \`_repeat.variables\` 不得生成 values 之外的业务项；\`_childPattern\` divider 用条件渲染。
- 明确包含 overflow、whiteSpace、textOverflow、WebkitLineClamp、WebkitBoxOrient、wordBreak 等截断元数据时，必须完整保留。

### 表格与数据视图

基础表格规则：
- Table 的 \`bordered\` 仅在每个单元格都有四周完整、均匀的明显边框时设置；常规表格使用默认边框表现。
- Table columns 有 Figma 数字宽度时使用数字 \`width\`；明确弹性列使用弹性宽度。
- PC 表格分页必须使用 Table 的 \`pagination\` 属性承载；同一表格存在可见分页时，禁止生成该 Table 的 \`pagination={false}\` 再额外渲染独立 \`<Pagination />\` 或手写分页占位。
- Detail/View/More/Arrow 类按钮或图标只代表一个可见操作事实；不得仅凭邻近按钮、箭头或文案推断其控制相邻可见 Table/List/section 的展开收起。若没有识别到隐藏内容、展开面板或目标数据视图，只渲染当前可见状态，不创建无效果 state。
- 若 Figma 明确表达 collapse/expand，默认状态必须与当前可见状态一致，控制目标必须实际改变 visible item、dataSource、visible rows、expandedRowKeys/expandedRowRender、按钮文案或图标；触发按钮必须始终可见，不得被自己的 state 条件卸载。Collapse/Expand 不得通过 \`dataSource = []\` 表达，除非 Figma 明确显示折叠后表格为空。按钮位于 Table cell 内容、cell 内 repeated item/list 或其直接 sibling 下时，只控制最近的 cell/list owner，使用当前 row 的局部 expanded state + child array 截断/展开，不得控制整个 Table、tableWrapper 或 section。Table \`rowKey\` 必须唯一；若可见 rows 中业务字段重复，使用稳定 id 或组合 key。
- ProTable columns 必须沿 @ant-design/pro-components 源码和 examples 确认；基础 Table 使用 antd Table 文档与 examples。
- 表头排序使用 antd Table column \`sorter\`；列头提示使用 \`title\` 与 Tooltip 组合，或 ProTable 已支持的列配置 API。
- Table column render 需要当前行数据时必须显式声明第二参数，例如 \`render: (value, record) => ...\`；需要行号时声明第三参数，禁止在 render 中使用 \`arguments\` 读取 record/index。
- 普通表格只处理当前可见 rows、columns、width、pagination、sort/hint、cell render 和 rowAction；不得为了文件拆分或局部按钮生成 groupedData、rowSpan、expandable、tree data、\`expandedRowKeys\` 或表格内部 \`scroll.y\`。

高级表格规则只在 Figma/repeat/API 明确表达父子行组、合并单元格、嵌套子行或 Table 展开面板时启用：
- 保留原始层级，\`_repeat\` 先判定作用域；兄弟列同步重复时展开为 child view rows，单元格内部重复时保持单条业务记录 + cell 内部列表。
- 表格单元格内存在多个重复 child item，且相邻列是同一业务组公共字段时，保持一条 parent record + child array 并在 cell 内渲染 child list，不得拍平成多行重复公共字段。
- 合并单元格使用 \`onCell\` 返回 \`rowSpan\` / \`colSpan\`；API 为 \`parent.children[]\` 时 \`Table.dataSource\` 可展开为 child/fallback rows，每行携带 \`parent\`、\`child\`、\`childIndex\`、\`childCount\`，rowSpan 只基于展开后的 view rows 计算；rowSpan 与表格内部 \`scroll.y\` 冲突时由外层容器承担滚动。
- 展开路径只处理真实展开行/折叠面板结构；\`Expandable=on\` 且 Body rows 同层级时使用 \`expandedRowRender\`，只有缩进嵌套子行且列结构相同时使用 tree data。使用 Table 展开/折叠时，rowKey、expanded row state、default expanded rows、事件回调和展开内容必须接到已确认 Table API。

### 表单与控件值

- placeholder 不是 runtime value；控件内可见的已选值、选中态、日期和表单默认值必须进入 \`initialValues\` 或 mock UI model。
- 表单 options 只来自 Figma 可见选项：出现多个选项才生成多个；只出现当前值时只生成当前 selected option。
- 表单字段遵循「文件拆分规划」中的 Form owner；planned components 包含 Form 时，字段 label、required、rules、initialValues 和提交校验由 Form/Form.Item 承载，不得生成游离在 Form context 外的 \`Form.Item\`。
- Radio.Group、Select、DatePicker 等受控字段统一由同一个 Form 字段或同一个受控 state 驱动；属于提交表单字段的 Radio 使用 \`Form.Item + Radio.Group\` 绑定，并把可见选中态写入 \`initialValues\`。
- QueryFilter / ProForm / ProTable fields 布局优先使用 \`columns\` 或 fields 配置表达。
- Form UI model 使用控件源码要求的 value/onChange 类型；timestamp/string 只在 adapter、submit payload 或 mock service 边界转换。
- DatePicker/RangePicker/TimePicker 无论是独立受控、Form.Item，还是 QueryFilter/ProForm/ProTable fields，组件 \`value/defaultValue/initialValues\` 都必须使用 Dayjs 实例；RangePicker 使用 \`[Dayjs | null, Dayjs | null]\`。不得把 JS \`Date\`、string、number 或 \`as any\` 直接传给日期组件；API/mock/string 只在进入组件 state 或 field initial value 前用 \`dayjs(...)\` 转换，提交时再转回 payload。
- DatePicker/RangePicker/TimePicker 字段如果进入 \`types.ts\`，禁止写裸 \`dayjs.Dayjs\`、\`dayjs.Moment\` 或其他未导入 namespace 类型。必须在 \`types.ts\` 写 \`import type { Dayjs } from 'dayjs'\` 并使用 \`Dayjs | null\`、\`Dayjs[]\` 或 \`[Dayjs | null, Dayjs | null]\`；如果页面模型选择 string/number，则只在组件 state、Form \`initialValues\`、adapter 或 submit 边界转换为 Dayjs。

### 样式与图标

- 静态 layout、spacing、color、typography、border、background、shadow、overflow、text truncation 和状态视觉优先落到 CSS Module 或样式文件。
- inline style 仅用于动态值，或组件源码证明无法通过 className/CSS 表达的局部样式；禁止把大量静态视觉 token 写成 JSX inline style。
- \`stylePlan\` 必须覆盖主要 section、重复项、表格 cell、地址/详情块、状态标签、操作区和 fallback icon 的样式归属；重复视觉结构只有在 layout、spacing、typography、color/fill 和状态视觉都一致时才复用 className，任一视觉事实不同则拆分 section-specific className，不得为了复用覆盖 Figma 颜色事实。
- \`designAnalysis.icons[]\` 是显式独立图标事实；每个 icon 必须有落地结论：显式 import/render、已验证组件 API 渲染或 fallback SVG；若在 Stage 1 Figma data 中定位后发现属于组件内部视觉，按 component-owned 回到组件默认表现或 CSS，不生成 fallback 文件。
- \`existsInLibrary === true\` 时从当前输入中的图标导入包 import \`inferredIconName\`；\`existsInLibrary === false\` 且确认为独立显式图标并需要显式渲染时，才根据对应 Figma \`nodeId\` 的真实 SVG path / shape 生成 fallback。

### 文件结构与数据流

文件结构以 \`FileSplitPlan\` 为准；root、overlay shell、business section、Form owner 和 mock/API 数据入口以「文件拆分规划」段执行。已读取的 \`common-template\` 只补充文件职责和基础 Pattern，不覆盖本节 API 边界。本节只补充 const/API/hook/state、数据归一化、文件类型和死代码约束。

- \`const.ts\` 只有在存在状态枚举、columns、menu、options 或大块配置，且会被最终文件 import，并能明显降低入口可读性或被两个以上文件复用时才生成；否则配置内联在消费文件中。\`const.ts\` 只放无渲染副作用的常量或配置；包含 JSX、ReactNode、状态闭包、hook 返回值或运行时国际化调用的配置，必须放在消费组件或 \`.tsx\` 配置工厂中。
- 只有存在 API 文档或 prompt 明确给出 request/response 字段时，才生成 \`api/types.ts\` 和 \`api/index.ts\`。
- 有 API 契约时生成 \`api/types.ts\`、\`api/index.ts\` 和 \`api/mock-data.ts\`；\`App\` 首屏默认使用 mock，不得默认发起真实请求。
- hooks、state、handler、memo、mock field、import 和 planned component 必须被最终 JSX、props、mock、adapter、CSS 或数据视图真实消费；交互状态必须改变可见内容、组件 props、数据视图或提交 payload，collapse/expand 按「表格与数据视图」执行。
- 外部 \`props.data\`、API response 和 mock fallback 必须先归一化为页面 UI model；不得用 \`const data = props.data || mockData\` 代替字段级 fallback。会被 \`.map/.slice/.filter/.length\` 消费的字段必须先用 \`Array.isArray(value) ? value : []\` 或对应 mock 数组归一化，子组件数组 props 也必须提供默认 \`[]\`；API optional/nested/list 字段与页面字段名不同且不生成 adapter 时，在入口或 owner 组件内提供本地 normalize helper。
- 只有 Figma 明确出现的查询、分页、排序、提交能力才进入 hook/service。
- 包含 JSX/ReactNode/render/formatter/field component/slot 的配置文件用 \`.tsx\`，包括含 JSX 或 ReactNode 的 ProTable / QueryFilter / ProForm fields 配置；纯类型、常量、adapter、service、API 文件用 \`.ts\`。\`types.ts\` 只放类型；引用第三方类型时必须在当前文件使用 \`import type\`，例如 \`import type { Dayjs } from 'dayjs'\` 后写 \`Dayjs | null\`；每个 import 都由当前文件真实消费。

## 当前输入

本节是本次请求的动态输入；执行上方 Stage 和规则时，以这些值替换 \`当前输入.*\`。

- 平台：${params.platformProfile.platformLabel}
- Figma URL: ${params.figmaUrl}
- fileKey: ${params.fileKey}
- nodeId: ${params.nodeId}
- 组件目录平台：${params.platformProfile.componentCatalogPlatform}
- 图标导入包：\`${params.platformProfile.iconImportPackage}\`
- 输出根目录：已由 \`mcp__code-output__write_file\` 内部绑定；不要在 \`path\` 中复制绝对路径。
- 样式文件名：\`${params.styleFileName}\`
- 目录名策略：${folderNameRule}
- 写入路径策略：${writePathRule}
${userPromptSection}
## 项目约束补充

${codeStyleSection}
${cursorRulesSection}`;
}
