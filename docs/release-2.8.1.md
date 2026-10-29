# 2.8.1 · 桌面启动与首页布局 / Desktop startup and home layout

## 简体中文

这次小更新让桌面入口更可靠，也整理了 Codex 首页的贴纸和输入区域。六款壁纸、配色、人物位置和使用方式保持原样。

- 修复启动和控制文件替换时的短暂读取竞态，减少偶发的启动失败。
- 已有主题窗口时，双击桌面入口会直接唤回；窗口最小化时先恢复，不重复启动客户端。
- 检测到另一份独立 Codex 主实例时，启动器会等待退出并提示。同一客户端里通过“在新窗口中打开”使用壁纸的方式不变。
- 调整 Codex 首页纸箱波奇的位置，避开输入框上方工具栏，同时保留原生 Codex 图标。
- 首页内容偏低时，将标题、纸箱贴纸及输入区域一起适度上移；小窗口自动缩减位移，居中首页与对话页保持原位。
- 打开和关闭原生项目、环境菜单时，标题和输入区域保持原位；贴纸暂时隐藏，关闭后恢复。

**适配：Windows x64 · Codex 26.1023.51421／安装包 26.1023.6621.0。主题 2.8.1，加载器 1.3.1。** 客户端兼容范围没有扩大。

### 下载与升级

- 日常安装选择 `Bocchi-Codex-Theme-2.8.1-windows-x64.zip`，已包含运行环境。
- `Bocchi-Codex-Theme-2.8.1-source.zip` 用于查看源码和开发，不含运行二进制。
- `SHA256SUMS.txt` 用于核对两个 ZIP 的校验值。

把完整包解压到新的长期保留目录，运行 `Install.cmd` 或 `01-安装.cmd`。保存草稿并等任务结束，从托盘选择 Exit 退出普通 Codex 后，再双击桌面的 **Bocchi Codex Theme**。以后需要更多任务窗口，使用客户端里的“在新窗口中打开”即可。

请保留旧目录和旧包。需要暂时恢复官方界面时运行 `Pause.cmd`；旧主题只能在其适配的客户端构建上重新启用。若要回到同构建的 2.8.0，可以从保留的旧目录运行安装入口恢复桌面指向，但该版本不包含本次启动修复。不要复制旧运行状态。[完整升级和回退说明](恢复与回退.md)

### 验证与协作

60/60 Node 回归和 48/48 页面模拟通过。PowerShell 5.1、7 各通过 36 项启动、31 项重复启动及 9 项实例保护检查。两个既有主题窗口的暂停／恢复已实机检查，客户端和加载器身份保持不变。首页菜单修正目前通过页面模拟；完整范围见[验证记录](验证记录.md)。

手机任务占用的历史日志里出现过两份独立 Desktop 主实例及官方写入者冲突。本次收紧了启动器的并行实例处理；修复后单主进程、多任务窗口下的手机访问仍待实测，暂不宣称全部手机问题已解决。最终包全新冷启动、原生首页最终视觉、真实浏览器下载链路、全新英文 Windows 和 Mac 原生验收尚未完成；远程 CI 以正式发布提交对应结果为准。

谢谢 greppro 持续推进 Mac 适配。本次仍保持 Windows 独立发行，新增的内部状态读取 helper 可以在后续整合时逐项审阅；没有混入实验性 Mac 运行代码，也没有更改 PR #2。[共享改动说明](2.8-integration-notes.md)

两张原实机展示图保持不变。代码许可与图片素材许可分别说明于仓库的 LICENSE 和 ASSETS.md；图片素材不随代码的 MIT 许可重新授权。

## English

This update makes the desktop shortcut more reliable and tidies the Codex home layout. All six wallpapers, their colors and framing, and the familiar controls stay the same.

- Handles brief read races while startup and control files are replaced, reducing intermittent launch failures.
- Opening the shortcut again brings back the existing verified theme window. A minimized window is restored without starting another client.
- If another independent Codex main process is detected, the launcher waits for it to exit and offers guidance. **Open in new window** within the same client continues to work as before.
- Repositions the box Bocchi sticker on Codex home to clear the toolbar above the composer while keeping the native Codex icon.
- Low-positioned home content moves up as a group: heading, box sticker and composer. The lift shrinks in smaller windows; centered home layouts and conversations stay in place.
- Native project and environment menus keep the heading and composer steady when opened or closed. Stickers hide temporarily and return after the menu closes.

**Supported: Windows x64 · Codex 26.1023.51421 / Windows package 26.1023.6621.0. Theme 2.8.1; loader 1.3.1.** This update does not add support for other client builds.

### Download and upgrade

- Choose `Bocchi-Codex-Theme-2.8.1-windows-x64.zip` for everyday use. The runtime is included.
- `Bocchi-Codex-Theme-2.8.1-source.zip` is for source review and development; it does not include runtime binaries.
- Use `SHA256SUMS.txt` to verify both ZIP files.

Extract the complete package into a new folder you will keep and run **Install.cmd**. Save drafts, let active work finish, and choose **Exit** from the tray to close the ordinary Codex client. Then open **Bocchi Codex Theme** on your desktop. For additional task windows, use the client's **Open in new window** command.

Keep your previous folder and package. **Pause.cmd** restores the current official interface. An older theme can only be re-enabled on its supported client build. To return to 2.8.0 on this same build, run setup from your retained 2.8.0 folder to restore the shortcut; that version does not include these startup fixes. Do not copy old runtime state. [Full upgrade and rollback guide](en/upgrade-restore.md)

### Validation and collaboration

All 60 Node regressions and 48 renderer simulations passed. PowerShell 5.1 and 7 each passed 36 startup, 31 duplicate-start and 9 instance-guard checks. Native Pause/Resume checks restored two existing themed windows without replacing the client or loader. The latest home-menu fix has simulation coverage; see the [validation record](en/validation.md) for the full scope.

Historical mobile-conflict logs showed two independent Desktop main instances and an official active-writer conflict. This update tightens the launcher's parallel-instance handling. Mobile access with multiple task windows in a single main process still needs a post-fix check; a complete mobile fix is not claimed. Fresh final-package cold starts, final native home visuals, the real browser-download installation path, a fresh English Windows environment and native Mac acceptance remain unverified. Remote CI is tracked against the release commit.

Thanks to greppro for continuing the Mac adaptation. Windows remains a separate release. The new internal state-read helper is a small change for later integration review; experimental Mac runtime code and PR #2 are untouched. [Shared-core notes](2.8-integration-notes.md)

The two existing native screenshots are unchanged. Code and artwork have separate licensing terms in LICENSE and ASSETS.md; the MIT code license does not relicense the artwork.
