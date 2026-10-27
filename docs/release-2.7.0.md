# Bocchi Codex Theme 2.7.0 · 多窗口与新版适配 / Multiple windows and updated compatibility

## 简体中文

熟悉的六款壁纸继续陪你聊天和工作，这次也能跟着任务一起进入新窗口了。2.7.0 适配新版 Codex，并补齐桌面入口和安装检查，让日常使用更省心。

### 这次更新

- 从本地任务选择“在新窗口中打开”，新窗口也会加载壁纸；各窗口独立恢复，暂停和恢复作用于全部主题窗口。
- 新窗口沿用最近一次成功保存的壁纸，已打开窗口保留各自当前选择，避免互相打断。
- 适配动态 Chat 页面，保留图片查看器、输入框防漏、圆角和侧栏切换修复。六款壁纸的配色、人物位置和两张实机展示图不变。
- 修复英文代码页下桌面入口中文路径损坏的问题；保留自动深色外观、Unicode 快捷方式和重复启动保护。
- 安装时先核验发行清单，只对校验通过的 14 个必要脚本解除下载来源阻止。桌面入口继续使用 RemoteSigned，不修改系统执行策略。

### 适配与下载选择

**Windows x64 · Codex 应用 26.1021.31345／安装包 26.1021.3705.0。主题 2.7.0，加载器 1.3.0。** 其他客户端构建请选用匹配主题，不要改版本号绕过检查。

- 日常使用：`Bocchi-Codex-Theme-2.7.0-windows-x64.zip`，已包含运行环境。
- 查看源码：`Bocchi-Codex-Theme-2.7.0-source.zip`，不含 Node 运行文件。
- 校验文件：`SHA256SUMS.txt`，请与同次发行的压缩包对应使用。

### 升级与回退

保留旧目录，将新包完整解压到另一个文件夹，运行 **Install.cmd／01-安装.cmd**。保存草稿，等正在处理的工作结束并正常退出普通 Codex，再从桌面的 **Bocchi Codex Theme** 进入。通常无需管理员权限，也无需另装 Node.js。

可以只迁移 `.local/wallpaper-selection.json`；不要复制整个 `.local`、登录目录或旧运行状态。暂时隐藏壁纸用 **Pause.cmd**，回到普通客户端用 **Restore.cmd**。回退前请确认旧主题仍与客户端版本匹配。[升级与恢复说明](恢复与回退.md)

### 验证与感谢

本地 Windows 回归 52 项、PowerShell 5.1／7 各 10 组检查，以及最终包核验和隔离安装检查通过。用户试用反馈和历史双窗口实机记录按文件哈希关联保留；它们不等于最终文案包的所有场景都重新实测。下载来源标记采用模拟检查，最终包冷启动、真实浏览器下载链路和完整英文 Windows 尚未重新验收。[完整验证范围](验证记录.md)

感谢 greppro 为实验性 Mac 启动器、身份验证、归档 Chat 和打包边界付出的时间！相关打包工作也帮助这次 Windows 发布准备更完整。Mac 继续独立测试，PR #2 仍为 Draft、未合并；本 Windows 包不声明 Mac 支持。

程序代码采用 MIT，图片、角色和衍生视觉素材有独立的权利限制。见 [LICENSE](../LICENSE)、[素材说明](../ASSETS.md) 和[第三方与贡献说明](../THIRD_PARTY_NOTICES.md)。这是非官方同人项目。

## English

Your six familiar wallpapers can now follow a local task into another window. Version 2.7.0 supports the updated Codex client and improves desktop shortcuts and installation checks while keeping the look you already know.

### What changed

- Choose **Open in new window** on a local task to load the theme there too. Windows recover independently; Pause and Resume apply to all managed theme windows.
- New windows use the last successfully saved wallpaper. Existing windows keep their current selection without interrupting one another.
- Updated dynamic Chat detection retains image-viewer persistence, composer clipping, rounded corners and sidebar fixes. Wallpaper colors, framing and the two original live screenshots are unchanged.
- Unicode desktop shortcuts fix Chinese paths under an English code page. Temporary dark appearance and duplicate-start protection are retained.
- Setup verifies the release manifest before clearing download-origin markers from 14 necessary, verified scripts. Desktop shortcuts retain RemoteSigned, and system execution policy is unchanged.

### Compatibility and package choice

**Windows x64 · Codex app 26.1021.31345 / Windows package 26.1021.3705.0. Theme 2.7.0; loader 1.3.0.** Use a matching theme for other client builds; editing a version number does not provide compatibility.

- Everyday use: `Bocchi-Codex-Theme-2.7.0-windows-x64.zip`, including the runtime.
- Development: `Bocchi-Codex-Theme-2.7.0-source.zip`, without the Node binary.
- Verification: `SHA256SUMS.txt`, paired with the archives from the same release.

### Upgrade and restore

Keep the old folder, extract the new package into another folder and run **Install.cmd**. Save drafts, let active work finish and exit the ordinary Codex client normally. Then open **Bocchi Codex Theme** on your desktop. Administrator access is normally unnecessary, and no separate Node.js installation is needed.

You may transfer only `.local/wallpaper-selection.json`; do not copy the entire local profile or old runtime state. Use **Pause.cmd** to hide the theme or **Restore.cmd** to return to the ordinary client. Check client compatibility before rolling back. [Upgrade and restore guide](en/upgrade-restore.md)

### Checks and thanks

Local checks passed 52 Windows Node regressions, 10 suites in each PowerShell host, archive verification and isolated installation checks. User feedback and earlier native two-window evidence are linked by file hashes; they do not mean every scenario was repeated on this final documentation package. Download-origin behavior was simulated. A fresh cold launch of the final package, a real browser download chain and full English Windows acceptance were not repeated. [Validation details](en/validation.md)

Thank you to greppro for the time spent on the experimental Mac launcher, identity checks, archived Chat support and packaging boundaries. That packaging work also helped this Windows release preparation. Mac testing continues separately; PR #2 remains Draft and unmerged. This Windows package does not claim Mac support.

Code is MIT-licensed. Artwork, characters and derived visuals have separate rights and restrictions; see [LICENSE](../LICENSE), [asset notes](../ASSETS.md) and [third-party and contributor notes](../THIRD_PARTY_NOTICES.md). This is an unofficial fan project.
