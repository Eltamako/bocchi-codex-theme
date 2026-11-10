# 2.11.0 · 新版 Codex Desktop 适配 / Updated Codex Desktop support

## 中文

六款孤独摇滚壁纸已适配新版 Codex Desktop。原来的取景、配色、STARRY 切换、选择记忆和多窗口操作都可以继续使用。

- 支持 **Windows x64**，对应 Codex **26.1103.60933** 和安装包 **26.1103.7773.0**。加载器为 **1.3.1**。
- 桌面快捷方式继续等待旧进程退出和首个 Chat 或 Work 页面加载。已复查首屏加载较慢和重复点击的情形。
- 已重新核对输入框、阅读区、首页贴纸和图片预览。共享渲染核心仅更新版本校验，便于后续协作。

下载 **Bocchi-Codex-Theme-2.11.0-windows-x64.zip**，完整解压到新文件夹，运行 **01-安装.cmd** 或 **Install.cmd**。保存工作后，从托盘选择 **Exit**，再从桌面的 **Bocchi Codex Theme** 启动。完整包已包含运行环境，`source.zip` 用于开发。

客户端仍是 **26.1103.31037／26.1103.3517.0** 的用户可继续使用 [2.10.0](https://github.com/Eltamako/bocchi-codex-theme/releases/tag/v2.10.0)。如需暂时回到原界面，用 **Pause.cmd**，之后用 **Resume.cmd** 恢复主题。

本机桌面首启成功，Work 页面已加载冬装壁纸。50 项页面模拟、PowerShell 5.1 与 7 各 10 组检查、候选解压包 61 项回归和全新安装检查通过。本次实机验收覆盖 Windows 单窗口首启，Mac、手机和完整双窗口周期未重新实测。

代码使用 MIT 许可。壁纸和贴纸的来源与权利说明见仓库中的 **ASSETS.md**。感谢 greppro 对 Mac 适配和平台边界的贡献。

## English

All six Bocchi the Rock! wallpapers now support the updated Codex Desktop build, with the same framing, colors, STARRY picker, saved selections, and multiwindow controls.

- Supports **Windows x64** with Codex **26.1103.60933** and Windows package **26.1103.7773.0**. The loader version is **1.3.1**.
- The desktop shortcut waits for the previous instance to exit and the first Chat or Work page to load. The startup checks cover a slow first page and repeated clicks.
- The composer, reading area, home stickers, and image preview were rechecked. The shared renderer changes only its version check.

Download **Bocchi-Codex-Theme-2.11.0-windows-x64.zip**, extract it into a new folder, and run **Install.cmd**. Save your work, choose **Exit** in the system tray, then open **Bocchi Codex Theme** from your desktop. The Windows package includes the runtime. The `source.zip` archive is for development.

Use [2.10.0](https://github.com/Eltamako/bocchi-codex-theme/releases/tag/v2.10.0) with Codex **26.1103.31037 / 26.1103.3517.0**. To return to the original appearance temporarily, run **Pause.cmd**. Use **Resume.cmd** to bring the theme back.

The first desktop shortcut launch succeeded on Windows and loaded Winter Lights in Work. All 50 simulated page checks, 10 suites each under PowerShell 5.1 and 7, and 61 checks from the unpacked candidate passed, as did a fresh installation from that ZIP. Native acceptance covered one Windows window on first launch. Mac, mobile, and a complete two-window lifecycle were not retested.

The code uses the MIT license. See **ASSETS.md** for artwork and sticker sources and rights. Thanks to greppro for the Mac adaptation and platform boundary work.
