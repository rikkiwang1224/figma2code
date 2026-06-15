# 组件规格工具 (component-spec)

## 概述

`component-spec` 工具用于按需获取组件库的类型定义和使用示例（完整规格），为 AI Agent 提供组件 API 信息。

## 架构

```
数据来源:
┌──────────────────────────────────────────────────────────────┐
│  npm 包 (node_modules)         → 类型定义 (.d.ts)            │
│  component-data/examples/      → 示例代码 (高阶组件)          │
│  component-data/registry.json  → 组件注册表 + contextLevel    │
└──────────────────────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────────────────────┐
│  Resolvers                                                    │
│  ├── npmResolver.ts        ← 从 npm 包读取 .d.ts             │
│  ├── examplesResolver.ts   ← 从 component-data 读取示例       │
│  ├── registryLoader.ts     ← 加载 registry.json 配置         │
│  └── index.ts              ← 统一入口，按 contextLevel 分发   │
└──────────────────────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────────────────────┐
│  formatComponentSourceForAI (utils.ts)                        │
│  → 格式化为 AI 可读的 Markdown                                │
└──────────────────────────────────────────────────────────────┘
```

## 分级上下文策略 (contextLevel)

不同复杂度的组件，返回不同层级的上下文：

| contextLevel | 返回内容 | 适用组件 |
|---|---|---|
| `types-only` | 仅 `.d.ts` 类型定义 | Button, Input, Modal 等基础组件 |
| `types-with-brief-example` | 类型定义 + 最多 2 个示例 | Select, DatePicker, Cascader 等中阶组件 |
| `full-example` | 类型定义 + 全部示例 | ProTable, ProForm, EditableTable2 等高阶组件 |

配置位于 `component-data/registry.json`，每个库有默认级别，可对单个组件覆盖。

## 数据来源

### 类型定义 (npm 包)

从 `node_modules` 中的 `.d.ts` 文件读取，跟随 npm 版本自动更新：

| 组件库 | 路径模式 |
|---|---|
| react-pro-components | `typings/components/{component}/types.d.ts` |
| ssc-ui-react | `typings/components/{component}/types.d.ts` |
| ssc-mobile-ui-react | `dist/esm/components/{component}/types.d.ts` |

### 示例代码 (component-data)

存放在 `component-data/examples/{library}/{component}/` 下，仅高阶组件需要。

新增示例只需：
1. 在 `component-data/examples/{library}/{component}/` 下添加 `.tsx` 文件
2. 如果是新组件，在 `registry.json` 中设置 `contextLevel`

## MCP 工具调用

```typescript
// 基础组件 — 返回类型定义
await tool('get-component-source', {
  componentName: 'Button',
  library: 'ssc-ui-react',
});

// 高阶组件 — 返回类型定义 + 完整示例
await tool('get-component-source', {
  componentName: 'ProTable',
  library: 'react-pro-components',
  includeExamples: true,
});
```

### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| componentName | string | (必填) | 组件名称（PascalCase） |
| library | enum | (必填) | 组件库名称 |
| includeExamples | boolean | false | 是否包含示例（高阶组件会根据 contextLevel 自动包含） |
| includeProps | boolean | true | 是否包含类型定义 |
| maxLength | number | 20000 | 最大返回字符数 |

## 接入新组件库

1. 在 `package.json` devDependencies 添加 npm 包
2. 在 `component-data/registry.json` 的 `libraries` 中添加配置
3. 为高阶组件在 `component-data/examples/` 中添加示例
4. 无需修改任何代码文件

## 目录结构

```
component-spec/
├── index.ts              # 导出 MCP 服务器
├── sdkMcpServer.ts       # MCP 工具定义
├── types.ts              # 类型定义
├── utils.ts              # 格式化函数
├── resolvers/            # 数据获取层
│   ├── types.ts          # Resolver 类型
│   ├── registryLoader.ts # Registry 加载
│   ├── npmResolver.ts    # npm 包类型获取
│   ├── examplesResolver.ts # 示例获取
│   └── index.ts          # 统一入口
└── README.md

component-data/           # 组件数据（与 component-spec 平级）
├── registry.json         # 组件注册表
├── registry.schema.json  # JSON Schema
└── examples/             # 示例代码
    ├── react-pro-components/
    ├── ssc-ui-react/
    └── ssc-mobile-ui-react/
```
