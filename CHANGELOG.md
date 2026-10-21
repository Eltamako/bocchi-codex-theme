# 更新记录 / Changelog

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
