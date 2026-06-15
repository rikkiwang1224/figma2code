# PC 端页面模式代码骨架 (pc-page-patterns)

按页面类型（crud-list、form-modal 等）提供惯用代码组织方式，仅适用于 PC 端。

## 文件

| 文件 | 说明 |
|------|------|
| `SKILL.md` | 模式索引表 + 使用说明（模型入口） |
| `reference/crud-list.md` | crud-list 模式骨架（ProTable 列表页） |
| `reference/form-modal.md` | form-modal 模式骨架（表单弹窗）— 待补充 |
| `README.md` | 本说明 |

## 设计原则

- `SKILL.md` 保持精简（路由），模型按需 `Read` 对应的 reference 文件
- 每种模式一个 reference 文件，避免全量加载
- 骨架从团队样板间（`ssc-hostapp-template/src/pages/ssc-ui-demo/`）提炼，去除业务细节

## 如何新增模式

1. 在 `reference/` 下新建 `[pattern-name].md`
2. 在 `SKILL.md` 模式索引表中添加一行
3. 更新本 README

## 参考样板间来源

| 模式 | 样板间 |
|------|--------|
| crud-list | `ssc-ui-demo/table-basic` |
| form-modal | `ssc-ui-demo/advanced-form-modal` |
