# Figma2Code

将 Figma 设计稿转换为可运行的 React 代码。基于 Claude Agent SDK，通过多步 Agent 工作流和 MCP 工具链实现组件库感知的 design-to-code。

## 仓库

GitHub 仓库名统一使用小写：**`figma2code`**（本地目录同为 `figma2code/`，与 `agent-server` 平级）。

与 [`agent-server`](../agent-server) 的关系：

- **figma2code**（本仓库）：开源 CLI + 核心引擎，仅 **merged-query** 模式，Demo 使用 Ant Design
- **agent-server**：内部 Koa 服务、MySQL 统计、SSC 鉴权、YAPI 集成、SSC 组件库 adapter

## 目录结构

```text
figma2code/                    # 与 agent-server 平级
├── packages/
│   ├── core/                  # Agent 引擎（从 agent-server/src/agent 迁移）
│   ├── component-adapter/     # 组件库适配器接口
│   └── cli/                   # 命令行入口
└── adapters/
    └── ant-design/            # 开源 Demo 组件库
```

## 快速开始

```bash
cd figma2code
pnpm install
cp .env.example .env
# 编辑 .env，填入 FIGMA_API_KEY 和 ANTHROPIC_API_KEY

pnpm build
pnpm exec figma2code generate \
  --url "https://www.figma.com/design/xxx?node-id=1-2" \
  --adapter ant-design \
  --out ./output
```

## 提示词（Prompts）

开源版只保留 **merged-query** 一条链路，提示词位于：

```text
packages/core/src/prompts/
├── merged-query/
│   ├── mergedCodeGeneratorPrompt.ts   # 主工作流 prompt（Stage 1-4）
│   └── platforms/
│       └── ant-design/                # Ant Design 组件选择 / 源码查询规则
├── shared/
│   ├── codeStyleOverride.ts           # 代码风格覆盖
│   └── cursorRulesSection.ts          # Cursor Rules 注入
```

Skills 源码位于 `packages/core/src/skills/`，构建时复制到 `dist/.claude/skills/`（Agent SDK 要求）：

```text
packages/core/src/skills/
├── common-template/       # 目录、命名、样式规范
└── page-patterns/         # 页面模式参考骨架
```

对应 `agent-server` 中的 `src/agent/merged-query/prompts/` 与 `merged-query/platforms/pc/`，已改为 Ant Design 适配并去掉 YAPI / legacy。

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `FIGMA_API_KEY` | Figma REST API Key | 必填 |
| `ANTHROPIC_API_KEY` | Claude API Key | 必填 |
| `FIGMA2CODE_MODEL` | 模型名称 | `claude-sonnet-4-5` |
| `FIGMA2CODE_ENABLE_STREAMING` | 流式输出 | `true` |

## 架构说明

`packages/core/src/` 按职责分层：

```text
packages/core/src/
├── prompts/                 # 提示词工程（merged-query 主 prompt、ant-design 规则）
├── runtime/                 # 编排 + Claude Agent SDK 调用
│   ├── generate.ts          # 生码入口
│   ├── engine/              # MergedQueryAgentService
│   ├── merged-query/        # 编排、phase、finalization
│   ├── adapters/            # Runtime adapter（组件库 MCP 接线，如 ant-design）
│   ├── helpers/ monitoring/ types/
├── mcp/                     # MCP 工具（figma / catalog / spec / design-analysis / code-output）
├── skills/                  # Agent Skills 源码 → 构建复制到 dist/.claude/skills/
├── config/                  # 环境变量、路径、adapterRegistry
├── lib/                     # logger
├── index.ts                 # 对外 export generateCode
└── preview.ts               # prompt preview
```

| 目录 | 职责 |
|------|------|
| `src/prompts/` | 提示词工程 |
| `src/runtime/` | SDK 调用、编排 |
| `src/mcp/` | MCP 工具与组件 metadata |
| `src/skills/` | Agent Skills（规范、页面模式） |
| `src/config/` | 环境变量、输出路径、adapter 注册 |
| `adapters/ant-design/` | 组件库 adapter（metadata，供文档/扩展） |

Phase 1 曾从 `agent-server/src/agent` 批量迁入，**现已精简**为 merged-query 最小运行时（约 90 个 TS 文件 / ~600KB，不含 examples）。已删除 legacy `AgentService`、`platforms/pc`、`session/`、YAPI、SSC metadata、`tools/figma/logs` 等内部依赖。

预览完整 prompt（不调 LLM）：

```bash
pnpm exec figma2code prompt preview --url "https://www.figma.com/design/xxx?node-id=1-2"
```

## 开发状态

**Phase 1 已完成**：merged-query 引擎、MCP 工具链、Skills、Ant Design 组件目录已接入，`figma2code generate` 可调用 Claude Agent SDK 生码。

```bash
cd figma2code
cp .env.example .env   # 填入 FIGMA_API_KEY、ANTHROPIC_API_KEY
pnpm install && pnpm build
pnpm exec figma2code generate \
  --url "https://www.figma.com/design/xxx?node-id=1-2" \
  --out ./output
```

产物写入 `output/{conversationId}/`，性能报告写入 `reports/`。

## License

MIT
