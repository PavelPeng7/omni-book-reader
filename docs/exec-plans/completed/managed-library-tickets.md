# 受管书库任务索引

状态：任务发布完成；用户随后授权连续实施，六票运行时实现及本地自动化验证已完成，原生验收记录为 TD-2026-005。
日期：2026-10-18

来源：[父规格 Issue #9](https://github.com/PavelPeng7/omni-book-reader/issues/9)。用户要求 to-tickets 一步完成，因此按既定范围直接完成拆分、发布及依赖验证，不另设拆分确认轮次。父 Issue 的标题、正文、状态、标签和评论保持不变；子任务正文通过 Parent 引用父规格，未操作父 Issue 的原生子任务列表。

## 可执行任务

| Issue | 交付行为 | 直接阻塞项 | 本地正文 |
| --- | --- | --- | --- |
| [#10](https://github.com/PavelPeng7/omni-book-reader/issues/10) | 导入 EPUB 并恢复每书阅读状态 | 无，可立即开始 | [正文](managed-library-tickets/01-import-and-resume.md) |
| [#11](https://github.com/PavelPeng7/omni-book-reader/issues/11) | 重复导入复用与身份冲突保护 | #10 | [正文](managed-library-tickets/02-dedup-and-identity-conflicts.md) |
| [#12](https://github.com/PavelPeng7/omni-book-reader/issues/12) | 封面与 Markdown 导出随书收纳 | #10 | [正文](managed-library-tickets/03-local-covers-and-exports.md) |
| [#13](https://github.com/PavelPeng7/omni-book-reader/issues/13) | 确认范围后整书回收 | #10 | [正文](managed-library-tickets/04-trash-whole-book.md) |
| [#14](https://github.com/PavelPeng7/omni-book-reader/issues/14) | 改名移动与跨 Vault 恢复阅读资料 | #11、#12 | [正文](managed-library-tickets/05-portable-books-and-links.md) |
| [#15](https://github.com/PavelPeng7/omni-book-reader/issues/15) | 设置中安全搬迁整个书库 | #13、#14 | [正文](managed-library-tickets/06-relocate-library.md) |

全部任务均有独立验收清单和 `ready-for-agent` 标签；GitHub 原生 blocked-by 关系与正文一致。依赖图无环，未重复列出传递依赖。#15 等待 #13 是为了验证整书回收与整库搬迁的运行态协调，等待 #14 是为了复用已验证的身份重定位及资源便携能力。

## 执行边界

- 发布时初始可执行任务为 #10；依赖顺序为 #10 → #11/#12/#13 → #14 → #15。本地现已按这些边界完成六票代码与自动化验证，见总执行计划。
- 不单设纯存储层或大范围机械重命名票；必要的小范围持久化适配并入首个可演示阅读闭环，以保持每票可验证。
- 以书库服务加模拟 Vault 的公开操作作为主要测试边界，复用现有持久化和导出回归；每票要求记录 quick/full 与相关界面检查结果。
- 发布任务本身未执行运行时改造；用户随后再次要求“一步完成”，已授权连续实施六票。未执行真实用户书籍的移动或回收，也未自动关闭父规格。
- 实施遵循[书库设计](../../design-docs/systems/managed-library-storage.md)、[产品规格](../../product-specs/features/managed-library-storage.md)及[总执行计划](file-organization.md)。

## 发布验证

- 6 个 Issue 均已发布，并回读确认标题、正文、开放状态和 `ready-for-agent` 标签。
- 7 条 GitHub 原生阻塞关系已最终回读确认，与上表及各任务正文逐项一致；父 Issue 内容保持不变，`git diff --check` 通过。
- 发布阶段只变更任务文档；后续实现阶段已增加 23 个模拟 Vault 集成测试，quick/full 均已通过（121 项通过、1 项跳过），生产构建与发布资源本地验证通过。原生桌面/移动端实测尚未执行。
