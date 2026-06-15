# Figma2Code

将 Figma 设计稿转换为可运行的 React 代码。基于 Claude Agent SDK，通过多步 Agent 工作流和 MCP 工具链实现组件库感知的 design-to-code。

## 仓库

GitHub 仓库名统一使用小写：**`figma2code`**（本地目录同为 `figma2code/`，与 `agent-server` 平级）。

与 [`agent-server`](../agent-server) 的关系：

- **figma2code**（本仓库）：开源 CLI + 核心引擎，默认 `merged-query` 模式，Demo 使用 Ant Design
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

## 环境变量

| 变量 | 说明 | 默认 |
|------|------|------|
| `FIGMA_API_KEY` | Figma REST API Key | 必填 |
| `ANTHROPIC_API_KEY` | Claude API Key | 必填 |
| `FIGMA2CODE_AGENT_MODE` | `merged-query` \| `legacy` | `merged-query` |
| `FIGMA2CODE_MODEL` | 模型名称 | `claude-sonnet-4-5` |
| `FIGMA2CODE_ENABLE_STREAMING` | 流式输出 | `true` |

## 开发状态

当前为 **Phase 0 脚手架**。`packages/core` 的 Agent 引擎将从 `agent-server/src/agent` 逐步迁移，CLI 已可解析参数并加载配置。

## License

MIT
