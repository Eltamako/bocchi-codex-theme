# 更新记录 / Changelog

## 2.8.0 — 新版客户端适配

- 对应 Codex 26.1023.51421／Windows 安装包 26.1023.6621.0，加载器继续使用 1.3.0。
- 保留 2.7.0 的六款画面、多窗口、动态 Chat、输入框防漏、图片预览、双语菜单和安装保护。
- 恢复新版首页标题、Chat／Work 切换和纸箱波奇贴纸与输入框的对齐；移除新版底栏挡住壁纸的纯色背景及输入框上沿的横向黑边；修正 Chat 表格内层多余缩进，保留宽表横向滚动。
- 仅局部调整页面识别与样式，加载流程和画面配色、取景、渐变保持不变。Mac 运行时继续独立开发。
- 检查范围和实机待办见 [验证记录](docs/验证记录.md)；旧客户端请使用 2.7.0。

## 2.8.0 — Updated client compatibility

- Targets Codex 26.1023.51421 / Windows package 26.1023.6621.0; loader 1.3.0 is unchanged.
- Keeps the six visuals, task multiwindow support, dynamic Chat readers, composer clipping, image previews, bilingual menus and installation guards from 2.7.0.
- Realigns home greetings, Chat/Work controls and the box Bocchi sticker with the composer. Clears the new footer's opaque wallpaper obstruction and the dark seam above the composer and the dark seam above the composer and removes excess padding inside Chat tables while preserving horizontal scrolling.
- Limits changes to page recognition and styles. Loading, artwork framing, colors and gradients remain unchanged. Mac runtime work remains separate.
- See [validation](docs/en/validation.md) for checks and native acceptance limits. Use 2.7.0 for the previous client.


## 2.7.0 · 新版 Windows 适配

- 保留已确认的 Windows 运行核心与画面；完善平台包边界、源码共存依赖测试及可靠截图检查。安装器在完整清单验证后处理脚本下载标记。

- 本地任务的新窗口自动加载壁纸；各窗口独立绘制，共享最后一次成功保存的选择，统一暂停与恢复。慢加载或关闭一个窗口不再清理其他窗口的主题。

- 适配 Codex 26.1021.31345／安装包 26.1021.3705.0，主题 2.7.0，加载器 1.3.0。
- 更新 Chat 正文识别，保留六款壁纸、已确认的画面与原有交互保护。
- 修复英文代码页下桌面快捷方式中文路径损坏；使用 Unicode 读写并核对原始参数。
- 客户端查询、安装清单、架构与版本问题分别提示，保留原界面和诊断代码。
- Windows 独立发行；不包含实验性 macOS 功能。

## 2.7.0 · Updated Windows adapter

- Preserves the confirmed Windows runtime and visuals. Adds source-coexistence dependency probes, package boundaries and reliable screenshot checks. Setup clears script download markers only after manifest verification.

- Local tasks opened in a new window now load the theme automatically. Windows render independently, share the last successfully saved choice for future windows, and pause/resume together. A slow or closing window no longer tears down its siblings.

- Targets Codex 26.1021.31345 / package 26.1021.3705.0. Theme 2.7.0; loader 1.3.0.
- Updates Chat reader detection while preserving all six wallpapers and existing visual and lifecycle safeguards.
- Fixes corrupted Unicode shortcut arguments under an English ANSI code page; verifies saved links against the original values.
- Separates app discovery, manifest, architecture and version errors without changing the ordinary client.
- Windows is distributed independently. Experimental macOS support is not included.


## 2.6.2 · 加载恢复与安装归属修复

- 合并 r3：渲染安装按代际取消，过时任务不能覆盖新实例；requestAnimationFrame 等待有界，改善最小化后恢复。
- 加载器区分暂时连接故障与身份/配置错误；连续暂时故障最多恢复 60 秒，退避期间每 250 毫秒响应暂停或停止。
- 校验安装记录归属，拒绝复制目录携带的外部状态路径；加强配置校验及进程身份保护。
- 加入安装、连接恢复和进程身份行为回归；六款壁纸、素材及客户端适配范围保持不变。
- 主题 2.6.2，加载器 1.2.2；Windows x64，Codex 26.1016.51333／安装包 26.1016.6573.0。
- 实机重复启动与真实断连恢复尚未验证；详见验证记录。

## 2.6.2 · Recovery and installation ownership fixes

- Includes r3 generation cancellation and bounded animation-frame waits; retired work cannot replace a successor installation.
- Distinguishes transient transport failures from identity/configuration errors. Continuous recovery is bounded to 60 seconds; Pause/Stop is checked every 250 ms during backoff.
- Rejects foreign state paths in copied installation records; strengthens configuration checks and process identity guards.
- Adds installation, recovery and process-identity regression coverage. Artwork and supported client versions are unchanged.
- Theme 2.6.2; loader 1.2.2. Windows x64, Codex 26.1016.51333 / package 26.1016.6573.0.
- Native repeated-start and real disconnect recovery remain unverified; see validation notes.


## 2.6.1 · 桌面入口与图片预览修复

- 升级时识别旧的“Codex · 孤独摇滚”桌面入口，核对启动命令及主题安装记录后备份，再迁移为 Bocchi Codex Theme，避免退出后误启旧版。不会改动同名但无法确认归属的快捷方式。
- 修复 Chat 打开图片时替换输入框导致壁纸被移除的问题，保留打开和关闭动画中的完整场景。
- 补齐收起侧边栏后独立标题区域的左上圆角。
- 桌面入口使用本机已验证 Codex 安装中的原应用图标，并保存本地副本，不再显示 PowerShell 图标；图标不随发行包分发。
- 保持六款壁纸、配色、渐变、人物取景和两张实机展示图；STARRY 不增加光晕。
- 适配范围不变：Windows x64，Codex 26.1016.51333／安装包 26.1016.6573.0。主题 2.6.1，加载器 1.2.1。版本不匹配保护保留。

## 2.6.1 · Desktop shortcut and image-preview fixes

- Setup now verifies and backs up the legacy Chinese desktop shortcut, then replaces it with Bocchi Codex Theme. This prevents an old theme from launching after you exit. Unrecognized shortcuts with the same name are left untouched.
- Keeps the wallpaper when Chat replaces its composer for image editing, including opening and closing transitions.
- Rounds the separate page header when the sidebar is collapsed.
- Uses the original icon from the verified local Codex installation, with a local copy, instead of the PowerShell icon. The app icon is not redistributed in the release.
- Preserves all six wallpapers, colors, gradients, framing and the two original screenshots. The STARRY glow stays off.
- Compatibility is unchanged: Windows x64, Codex 26.1016.51333 / package 26.1016.6573.0. Theme 2.6.1; loader 1.2.1. Version checks remain enabled.


## 2.6.0 · 新版 Codex 适配

- 适配 Windows x64 上的 Codex 26.1016.51333／安装包 26.1016.6573.0。
- 主内容定位避开新版标题栏和标签栏的同名焦点标记。
- 壁纸跟随原版内容区圆角，保留侧栏内外边界。
- 图片查看器沿用原版透明与动画样式；打开和关闭图片时保留同一对话的完整壁纸，避免遮黑和重新加载。
- 去掉 STARRY 按钮常态和悬停时的光晕，保持原有壁纸遮罩、明暗渐变与去色带处理。
- 合并 R18：缓存复用、减少离屏扫描与重复绘制、连续尺寸变化时取消过时任务并保留完整场景。
- 加载未就绪时保留与当前请求匹配的诊断，区分页面布局、连接和加载器问题；不将未知问题归因于登录或外观。
- 六款壁纸、人物取景、配色、双语菜单和原有两张实机展示图不变。
- 旧客户端请使用 2.5.1；旧标签和附件保留。

## 2.6.0 · Updated Codex support

- Supports Windows x64, Codex 26.1016.51333 / package 26.1016.6573.0.
- Locates the content pane without confusing it with the new header and tab-row focus markers.
- Matches the native rounded content edges, including sidebar boundaries.
- Preserves native image-viewer transparency and transitions, keeping the same conversation backdrop through image opening and closing.
- Removes the STARRY button glow while preserving the existing wallpaper shading, gradients and dithering.
- Includes R18 caching and scheduling improvements for sidebar and panel transitions, with less off-screen scanning and redundant rendering.
- Keeps request-matched readiness diagnostics for page, connection and loader failures, without assuming a sign-in or appearance issue.
- Keeps all six wallpapers, framing, colors, bilingual menus and the two approved original screenshots.
- Use 2.5.1 with the previous supported client; older tags and downloads remain available.


## 2.5.1 — 2026-10-20

- 连续点击主题入口时，后一次会等待正在进行的操作，并在核对当前窗口与加载状态后复用成功结果，避免壁纸已显示却弹出“另一次操作正在进行”的错误。
- 修复主题窗口关闭后、已验证的专用进程仍在后台时被误认为普通客户端的情况；启动与恢复入口都能重新打开同一主题窗口。
- 托盘 Exit 后允许客户端用最多 20 秒完成退出；真正仍在运行或无法确认身份时，保留窗口，并给出对应的中英文说明。
- 保留启动阶段的本地诊断记录。超时、未登录、版本不匹配等真实问题仍会提示，不会被当成成功。
- 壁纸、人物取景、配色、菜单和兼容范围不变。主题版本 2.5.1，加载器 1.1.1。

### English

- Repeated shortcut launches wait for the current operation, then reuse a verified, successfully loaded window instead of showing an “operation in progress” error over a working wallpaper.
- Recognize an existing verified theme process even when its window is closed. Both Start and Resume can reopen the same theme window.
- Allow up to 20 seconds for a tray Exit to finish. A still-running or unverified client is left untouched, with specific guidance in Chinese and English.
- Save local startup traces for troubleshooting. Genuine timeouts, sign-in delays and compatibility failures are still reported.
- Artwork, framing, colors, menus and supported client versions are unchanged. Theme 2.5.1; loader 1.1.1.


## 2.5.0 — 2026-10-20

- 中英文首页、安装教程、恢复说明及共用安装入口；菜单与提示可自动或手动选择语言。
- 波奇单人款恢复暗灰紫底色并小幅下移，环境与主图保持对齐。
- 主题窗口自动使用深色显示，暂停后恢复原外观；首次登录未完成时的提示更清楚。
- 保留原有客户端版本检查、选择记忆、输入框防漏与侧栏切换保护。

### English

- Full Chinese and English guides, shared launcher entries, and automatic or manual language selection for theme text.
- Bocchi in Orbit returns to its dark gray-purple base and sits slightly lower with aligned environment layers.
- Automatic dark appearance while active, restoration when paused, and clearer first-sign-in readiness messages.
- Existing compatibility checks, wallpaper memory, composer clipping and sidebar-transition protections are retained.


## 2.4.0 · 2026-10-19

- 新增冬装「暖灯店门合照」和耳机「四色合拍」，共六款固定壁纸；选择继续保存到本机。
- 重做顶部环境衔接、耳机底部纹理收尾，保留人物原图；冬装轻微放大和右移，波奇采用更暗的黑蓝灰底色。
- Chat / Work 有消息页面阅读区加深，清除输入框外额外暗条；正文在输入框边界前柔和淡出，下面继续显示壁纸。
- 侧栏尺寸变化时整幅场景同步提交，避免主图和补景先后移动；缓存最近稳定布局，优化模式切换等待。
- 保留请求卡片、发送过渡、侧边聊天避让、缺图回退及暂停清理；启动前检查其他桌面主会话，避免手机连到另一窗口。
- 适配 Codex **26.1013.40934 / Windows 包 26.1013.4894.0**。沿用严格版本校验。
- 本次公开版本汇总本地 R17.2；2.3.1 只曾本地准备，没有作为 GitHub Release 发布。检查范围见 [验证记录](docs/验证记录.md)。


## 2.3.0-public.1 · 2026-10-17

将已使用的 2.3 主题整理为可分发的 Windows 完整包与源码包。补充两张原始分辨率实机截图，展示 Work 对话和首页效果。

- 新增首次安装入口，按实际解压目录生成本机配置，提供启动、暂停、恢复主题和恢复原界面的编号入口。
- 保留四款壁纸、STARRY 切换菜单、重启记忆及 Chat／Work 共用选择。
- 保留小窗口贴纸自适应修复：按可用空间从 76 像素逐级缩小至 32 像素。
- 保留 Work 跟进发送的闪回修复：同一已验证页面中的短暂编辑器重建不再立即撤掉主题。
- 清除交付包里的原作者本机路径、登录配置、运行记录及私人对话截图。
- 补充使用、恢复、旧版本回退、素材来源、第三方许可和构建说明。

本次新增的是分发与配置流程；主题协议仍为 2.3.0，加载器版本仍为 1.0.3。应用兼容范围没有扩大。
