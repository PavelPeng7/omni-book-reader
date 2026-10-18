# 文件结构改造

Status: Completed locally — implementation and automated verification; native acceptance tracked separately
Date: 2026-10-18

## 范围与结果

按用户确认的规格连续完成 #10–#15：Vault 可见的可配置书库默认 My Reader，每书独立文件夹，显式移动导入、固定书籍身份、内容去重、每书阅读状态、封面与导出收纳、整书回收、相对资源与跨 Vault 恢复、整库安全搬迁。不兼容旧数据，不自动恢复、迁移或清理旧文件。

- #10：受管存储接入插件、书架与阅读器；全局设置与每书状态分离，旧 data.json 保留不用。
- #11：按当前 EPUB 字节做内容去重，重复来源留原位；重复 bookId、外部状态修改及损坏文件阻止覆盖。
- #12：自定义封面复制入书籍目录，提取封面、批注、章节附件及保存的单图均归书管理，Markdown 保留受管块外手写内容。
- #13：整书回收确认包含夹内手写文件，执行前关闭对应阅读器并刷新状态，失败保留关联，旧快照不重建目录。
- #14：保持运行时状态对象引用，改名/移动后重定位身份与相对资源，新 CFI 链接使用 bookId；跨 Vault 可恢复资料。
- #15：在设置中整体搬迁，新/空目标可用，非空/重叠目标拒绝；统一队列协调操作，失败回滚，pendingRoot 启动记录恢复未完成的位置提交。

既有 ReaderDataStore 路径接口作为运行时门面，ManagedLibrary 拥有固定身份与落盘布局，避免重写阅读交互或无关目录。对外部修改不自动合并或静默替换基线；后台发现保留新产生的内存修改。

## 来源与文档

- [产品规格](../../product-specs/features/managed-library-storage.md)与[存储设计](../../design-docs/systems/managed-library-storage.md)。
- [访谈记录](../../design-docs/file-organization-discovery.md)及[任务索引](managed-library-tickets.md)。
- 用户在规格与任务发布后再次要求“一步完成”，已授权连续实施，无逐票批准步骤。
- 保留工作区既有修改；未移动或回收真实用户书籍，故障操作均在模拟 Vault 中完成。未提交、推送、发版或关闭父 Issue；远端任务保留原有状态，不能将本地自动化验证视为全部真机验收完成。

## 验证

- 最终 `npm run verify:full` 通过：lint、TypeScript、121 项测试通过，1 项既有 EPUB fixture 测试跳过；其中新书库集成测试 23 项。
- 实施中 `npm run verify:quick` 通过；最终 full 内再次完整执行 quick。
- 生产 main.js 已重新构建，1.0.6 发布资源本地验证通过；未发布新版本。
- 测试覆盖导入/重载、去重、源文件失败恢复、身份冲突、外部/损坏数据、封面副本、Markdown 手写内容、内嵌图片、移动/跨 Vault 恢复、回收与失败、整库搬迁/回滚/启动恢复、队列交错、刷新期间内存修改及手动删除不重建。
- `git diff --check` 通过；本轮文档归档后再核对链接与状态。

## 已知限制

本环境没有可驱动的原生 Obsidian 桌面/移动会话。窄屏视觉、键盘/焦点、减少动态效果、真实 FileManager 链接更新与平台回收机制仍须真机验收，见 TD-2026-005。没有把模拟文件系统测试写成真机通过。
