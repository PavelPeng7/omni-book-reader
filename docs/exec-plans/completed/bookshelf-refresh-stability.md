# 文库闪烁诊断与修复

Status: Completed
Date: 2026-10-18

用户报告迁移后的“我的文库”异常闪烁。以实际书架视图的 DOM 保持性为反馈边界，先重现重复刷新及 Vault/工作区事件导致书卡、封面和搜索焦点被替换的现象，再区分事件触发与封面动画的作用。修复后验证正常书籍/状态变化仍可更新，运行 quick/full 并重新构建。

不修改用户书库文件或迁移结果。

## 诊断证据

- 以实际 `OmniBookReaderBookshelfView` 配合模拟宿主与 DOM，修复前两项回归均失败：无变化的多次 refresh 删除已加载图片节点；普通笔记 create/rename 与 active-leaf-change 替换相同书卡。
- 最小复现不启动封面提取、不加载 CSS，也没有真实磁盘写入，说明封面写入反馈和 CSS 动画不是触发节点替换的必要条件。
- 根因：每个事件直接调用 render，并无条件 content.empty；主插件的延迟书库发现也会再次 refresh。已加载封面随整页删除，新的图片节点重新加载和淡入，搜索也丢失焦点。

## 修复与边界

- 重建前对比可见模型；无变化保留 DOM，真实变化仍重绘。
- 签名包含进度、计数、状态、路径、源文件/自定义封面版本、相对阅读时间及文库设置；搜索词由已有局部列表渲染处理。
- 重建时释放旧 IntersectionObserver 目标；关闭和显式封面失效清空签名。
- 定向命令：`node --max-old-space-size=384 node_modules/vitest/vitest.mjs run tests/bookshelf-refresh.test.ts --maxWorkers=1 --minWorkers=1`，7 项通过，覆盖重复刷新、普通 Vault/焦点事件、进度与书签、显示/筛选与书籍增删、搜索、自定义封面原路径替换、关闭后重开。
- 不调整动画，不改动存储数据。原生桌面/移动端视觉验收仍未执行，沿用 TD-2026-005。

## 验证

- `npm run verify:quick` 与 `npm run verify:full` 均通过：128 项测试通过，1 项既有 EPUB fixture 跳过；lint、TypeScript、生产构建与发布资源验证通过。
- 已生成当前安装目录的 `main.js`；Obsidian 重载插件后使用新逻辑。未自动重启正在使用的 Obsidian。
