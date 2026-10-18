# Omni Reader Context

This glossary defines the project's terms for reading interactions and book organization.

## Book organization

**书库（Library）**:
插件集中管理的书籍及其阅读相关资料的集合。
_Avoid_: 插件安装目录

**书籍文件夹（Book folder）**:
一本书及其批注、进度、封面和导出资料的独立管理单元，便于整体移动、备份和删除。
_Avoid_: 批注导出文件夹（仅指其中的导出部分时除外）

**受管书籍（Managed book）**:
已导入书库并拥有独立书籍文件夹的书籍，是书架展示和整书管理的对象。
_Avoid_: Vault 内任意 EPUB

**书籍身份（Book identity）**:
一本受管书籍持续不变的身份，书名或存放位置变化后仍视为同一本书。
_Avoid_: 书籍路径、书名

**重复导入（Duplicate import）**:
导入与已有受管书籍内容完全相同的 EPUB；沿用已有书籍及其阅读资料，重复来源保留原位。
_Avoid_: 同名书籍

## Selection and navigation

**Text selection handle**:
A browser-provided control used to extend or contract a native text selection on touch devices.
_Avoid_: Cursor, reading cursor

**Mobile selection gesture**:
The complete touch interval from selecting or grabbing a text selection handle until touch end or cancellation, including moments when the browser temporarily reports a collapsed range.
_Avoid_: Text drag, page-turn gesture

**Selection navigation lock**:
The interaction state in which a native, pending, or settling text selection owns reader input and prevents paginated navigation.
_Avoid_: Selection mode, page lock
