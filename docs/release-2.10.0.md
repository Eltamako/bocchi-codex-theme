# 2.10.0 · 新版 Codex Desktop 适配 / Updated Codex Desktop support

## 中文

这次把六款孤独摇滚壁纸带到新版 Codex，保留原来的配色、人物位置、渐变和使用方式。更新后仍可从桌面的 **Bocchi Codex Theme** 打开，点右上角 **STARRY** 切换壁纸。

- 适配 **Codex 26.1103.31037／Windows 安装包 26.1103.3517.0，Windows x64**；加载器保持 **1.3.1**。
- 保留首次启动等待、托盘退出后接续启动、重复点击复用、多窗口、选择记忆、自动深色和暂停恢复。
- 重新核对 Chat／Work、图片预览、输入框底栏、首页贴纸和表格；旧问题已整理为更新回归清单。
- 共享核心保持小范围修改，Mac 运行时仍独立开发；感谢 **greppro** 在平台边界和 Mac 适配上的贡献。

**下载与升级：** 下载 **Bocchi-Codex-Theme-2.10.0-windows-x64.zip**，完整解压到新的长期保留目录，运行 **01-安装.cmd / Install.cmd**，再用桌面入口启动。运行环境已包含在包内，`source.zip` 供开发阅读使用。

升级前请保存草稿、等工作完成，再从系统托盘选择 **Exit**。保留旧目录；暂停用 **03-暂停主题.cmd / Pause.cmd**，恢复用 **04-恢复主题.cmd / Resume.cmd**。回退主题需同时选择与客户端匹配的旧版：Codex **26.1029.61003／26.1029.7803.0** 请用 **2.9.0**。

**检查情况：** 50 项页面模拟、PowerShell 5.1/7 各 10 组检查及候选解压包 61 项回归通过；本机桌面首次启动成功，用户已确认。完整双窗口周期、手机端到端和真实浏览器下载链路未在这次新客户端上重测，Mac 未做原生验收。两张实机展示图继续沿用已授权的历史图片。

代码使用 MIT 许可；图片素材不属于 MIT 授权范围，来源及权利说明见仓库 **ASSETS.md**。

## English

All six Bocchi the Rock! wallpapers now support the updated Codex Desktop, with the same colors, framing, gradients and controls. Launch **Bocchi Codex Theme** from your desktop and use **STARRY** to pick a wallpaper.

- Supports **Codex 26.1103.31037 / Windows package 26.1103.3517.0, Windows x64**. Loader version remains **1.3.1**.
- Keeps first-page readiness handling, recovery after tray Exit, repeated-click reuse, multiple windows, saved selections, temporary dark appearance, and pause/resume.
- Rechecks Chat and Work, image previews, the composer footer, home mascots and tables. A regression checklist records issues from earlier updates.
- Shared-core changes stay small for future Mac collaboration. Mac runtime work remains separate. Thanks to **greppro** for platform-boundary and Mac adaptation contributions.

**Download and upgrade:** Download **Bocchi-Codex-Theme-2.10.0-windows-x64.zip**, extract it fully into a new folder you will keep, run **Install.cmd**, then launch the desktop shortcut. The runtime is included. The separate `source.zip` is for development.

Save drafts and let active work finish before choosing **Exit** in the system tray. Keep the old installation folder. Use **Pause.cmd** to return to the original appearance and **Resume.cmd** to restore the theme. A rollback must match your client: use **2.9.0** with Codex **26.1029.61003 / 26.1029.7803.0**.

**Validation:** 50 simulated-page checks, 10 suites each under PowerShell 5.1 and 7, and 61 regressions from the unpacked candidate passed. Native desktop startup succeeded and was confirmed by the user. A complete two-window lifecycle, mobile end-to-end behavior and a real browser download chain were not rerun on this new client; no native Mac acceptance was performed. The two authorized historical showcase screenshots are unchanged.

Code is MIT-licensed. Artwork is licensed separately; see **ASSETS.md** for sources and rights.
