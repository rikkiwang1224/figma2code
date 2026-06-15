# 组件库元数据管理

## 📋 概述

组件库元数据管理已从硬编码的 TypeScript 文件重构为基于 JSON 文件的元数据架构，支持自动生成和动态加载。

## 🏗️ 架构

```
component-catalog/
├── metadata/                    # 元数据存储目录
│   ├── .schema.json            # JSON Schema 定义
│   ├── react-pro-components.json
│   ├── ssc-ui-react.json
│   ├── ssc-mobile-ui-react.json
│   └── ssc-ui-icons.json       # 图标库元数据
├── loader/                      # 元数据加载器
│   ├── index.ts
│   └── metadataLoader.ts
├── generators/                  # 元数据生成器
│   ├── index.ts
│   ├── manualGenerator.ts      # 组件库手动生成器
│   └── iconGenerator.ts         # 图标库生成器
├── types/                       # 类型定义
│   ├── icon.ts                 # 图标元数据类型
│   └── index.ts
└── ...
```

## 🔧 使用方式

### 生成元数据

#### 生成组件库元数据

```bash
# 从现有硬编码数据生成元数据（过渡期）
cd playground-sandpack
pnpm tsx agent/tools/component-catalog/generators/index.ts
```

#### 生成图标库元数据

```bash
# 从 SVG 文件扫描生成图标库元数据
cd playground-sandpack
pnpm tsx agent/tools/component-catalog/generators/iconGenerator.ts
```

**说明**：
- 图标库元数据从 SVG 文件名自动提取
- 支持 PC 端和 H5 端图标
- 自动分类和标签提取
- 生成文件：`metadata/ssc-ui-icons.json`

### 加载元数据

```typescript
import { MetadataLoader } from './loader';

const loader = new MetadataLoader();
const components = await loader.load('react-pro-components');
```

## 🔄 组件库更新流程

**重要**：当组件库有更新时（新增组件、修改组件描述、更新 Props 等），需要重新生成元数据文件。

### 更新步骤

1. **更新组件库源码或硬编码数据**
   - 如果使用硬编码数据（过渡期），修改对应的 `.ts` 文件：
     - `react-pro-components.ts`
     - `ssc-ui-react.ts`
     - `ssc-mobile-ui-react.ts`

2. **重新生成元数据文件**
   ```bash
   cd playground-sandpack
   pnpm tsx agent/tools/component-catalog/generators/index.ts
   ```

3. **清除缓存（如果服务正在运行）**
   - 方式 1：重启 Agent 服务（推荐）
   - 方式 2：在代码中调用 `metadataLoader.clearCache()`

4. **验证更新**
   - 调用 `list-available-components` MCP 工具
   - 确认返回的组件列表包含最新更新

### 注意事项

- ⚠️ **缓存机制**：`MetadataLoader` 使用内存缓存，更新 JSON 文件后需要清除缓存才能看到最新数据
- ⚠️ **文件修改时间**：元数据文件包含 `generatedAt` 字段，可用于判断是否需要更新
- ✅ **版本控制**：建议将元数据文件纳入版本控制，便于追踪变更

## 📝 主要变更

1. **元数据格式**：从硬编码 TypeScript 改为 JSON 文件
2. **加载方式**：从同步改为异步加载
3. **生成工具**：支持从现有数据自动生成元数据
4. **向后兼容**：保持现有 API 接口不变（部分函数改为异步）

## 🔄 迁移状态

- ✅ 元数据目录和 Schema 已创建
- ✅ MetadataLoader 已实现
- ✅ ManualGenerator 已实现
- ✅ 初始元数据文件已生成
- ✅ index.ts 已重构
- ✅ sdkMcpServer.ts 已重构
- ✅ summaryFormatter.ts 已更新为异步
- ✅ systemPrompt.ts 已更新为异步
- ✅ PlatformProvider 接口已支持异步

## 📌 注意事项

1. **异步接口**：部分函数已改为异步，调用时需要使用 `await`
2. **元数据文件**：元数据文件需要定期更新，可通过生成脚本重新生成
3. **向后兼容**：保留了同步接口（返回空数据），但建议使用异步接口

## 📝 关于硬编码文件

以下三个 TypeScript 文件（`react-pro-components.ts`、`ssc-ui-react.ts`、`ssc-mobile-ui-react.ts`）**仅在生成元数据时使用**：

- ✅ **运行时不需要**：Agent 运行时从 JSON 文件加载，不再依赖这些文件
- ✅ **生成时需要**：`ManualGenerator` 使用这些文件作为数据源生成 JSON
- 🔄 **过渡期保留**：在实现自动生成（从源码扫描）之前，这些文件作为数据源保留
- 🎯 **未来计划**：实现自动生成后，这些文件可以删除或移动到 `generators/` 目录下

**当前状态**：
- 运行时：使用 `metadata/*.json` 文件
- 生成时：使用 `*.ts` 文件作为数据源
- 更新流程：修改 `*.ts` 文件 → 运行生成脚本 → 更新 `*.json` 文件

## 🚀 后续计划

1. 实现 TypeScript 源码解析生成器（自动模式）
2. 支持增量更新
3. 添加元数据验证和测试
