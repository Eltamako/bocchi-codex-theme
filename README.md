# 孤独摇滚 · Bocchi the Rock! Codex Theme

把结束乐队的小小夜场，留在每天聊天和工作的窗口里。

适用于 **Windows Codex Desktop** 的《孤独摇滚》（ぼっち・ざ・ろっく！）同人主题：六款动漫壁纸、STARRY 切换菜单、纸箱波奇与四人贴纸，兼顾 **Chat / Work** 的阅读体验。

**[下载 Windows 完整包](https://github.com/Eltamako/bocchi-codex-theme/releases)** · [安装说明](docs/使用说明.md) · [恢复原界面](docs/恢复与回退.md) · [问题反馈](https://github.com/Eltamako/bocchi-codex-theme/issues)

> 本版适配：Windows x64 · Codex **26.1013.40934** · 深色外观。安装时会自动检查版本。

## 2.4 实机演示

![2.4 实机演示：冬装壁纸与 Work 首页](docs/screenshots/v2.4-live-work-home-winter.png)

*冬装 · Work 首页。用户提供并指定公开展示，原始分辨率 2137 × 1332。*

![2.4 实机演示：波奇壁纸与 Work 对话页](docs/screenshots/v2.4-live-work-floating-bocchi.png)

*波奇 · Work 对话页。用户提供并指定公开展示，原始分辨率 2134 × 1339；画面文字为主题附件验收内容。*

- 新增冬装与耳机两款壁纸，环境衔接、顶部和耳机底部重新调整。
- 加深阅读区，消息接近输入框时柔和收尾，输入框下方不再露出正文。
- 侧栏收起、展开时主图和背景一起更新，复用缓存减轻 Chat / Work 切换等待。

<details>
<summary>2.3 初版实机演示</summary>

## 初版实机演示

![孤独摇滚 Codex 主题实机：Work 首页、四色肖像壁纸、STARRY 菜单入口与纸箱波奇](docs/screenshots/work-home-color-portraits.png)

*Work 首页 · 四色肖像。实际客户端截图，点击可查看原图。*

- **六款壁纸，一处切换**：点击右上角 STARRY，Chat / Work 共用选择，重启后记住。
- **陪伴感与阅读兼顾**：纸箱波奇、四人连体贴纸和发饰点缀界面，窄窗与面板场景自动避让。
- **随时换回熟悉的界面**：提供暂停、恢复和退出主题入口，使用外置加载方式。

<details>
<summary>再看一张：Work 对话 · 演出散场</summary>

![孤独摇滚 Codex 主题实机：Work 对话与演出散场壁纸](docs/screenshots/work-conversation-backstage.png)

两张截图均保留原始分辨率：Work 首页 2559 × 1510，Work 对话 2199 × 1260。截图中的文字来自主题制作过程；Chat / Work 的验证范围见 [验证记录](docs/验证记录.md)。

</details>

</details>

## 三步开始

1. 打开 **[Releases 下载页](https://github.com/Eltamako/bocchi-codex-theme/releases)**，选择文件名以 **`windows-x64.zip`** 结尾的完整包，解压到准备长期保留的文件夹。
2. 双击 **`01-安装.cmd`**，按提示完成版本检查与桌面入口创建。
3. 双击 **`02-启动主题.cmd`** 或桌面的 **Bocchi Codex Theme**。使用深色外观，点击 **STARRY** 选择喜欢的壁纸。

启动前请先保存草稿、结束正在运行的工作并退出普通 Codex 窗口，再从主题入口打开。升级请解压到新文件夹，保留旧目录；完整步骤见 [升级与回退](docs/恢复与回退.md)。

完整包已包含运行环境，无需另装 Node.js。请保留解压目录，日常入口会从这里加载；首次打开主题专用窗口时，可能需要在官方页面登录。通常无需管理员权限，也不会添加开机启动。

`source.zip` 和 GitHub 的 **Source code** 下载用于查看源码与开发，日常安装请选择 Windows 完整包。更多步骤见 [使用说明](docs/使用说明.md)。

## 六款壁纸

| 下北泽夜场 | 四色肖像 · 夜场切片 |
| --- | --- |
| ![下北泽夜场：结束乐队在 Live House 排练后的合影](theme/wallpapers/night-stage/main.png) | ![四色肖像：凉、波奇、虹夏与喜多的夜场切片](theme/wallpapers/color-portraits/main.png) |
| **演出散场 · 后台合影** | **波奇失重 · 乐器宇宙** |
| ![演出散场：结束乐队在后台的合影](theme/wallpapers/backstage/main.png) | ![波奇失重：吉他、白色贝斯、大鼓与漂浮的波奇](theme/wallpapers/floating-bocchi/main.png) |
| **冬日候场 · 暖灯店门合照** | **随身节拍 · 四色合拍** |
| ![冬装四人合照](theme/wallpapers/winter-night/main.png) | ![耳机四人合照](theme/wallpapers/headphone-evening/main.png) |

上面是壁纸原图。实际界面会结合窗口宽度、模式和侧边面板调整取景与阅读遮罩。

## 暂停、恢复与回退

| 想做的事 | 打开这个文件 |
| --- | --- |
| 暂时隐藏主题，继续使用当前窗口 | `03-暂停主题.cmd` |
| 重新显示主题 | `04-恢复主题.cmd` |
| 结束主题会话，打开普通客户端 | `05-恢复原界面.cmd` |

旧版本回退和移除方法见 **[恢复与回退](docs/恢复与回退.md)**。遇到启动或版本提示，可以先看 [常见问题](docs/常见问题.md)。

<details>
<summary>完整适配范围与加载方式</summary>

| 项目 | 本版范围 |
| --- | --- |
| 发行版本 | 2.4.0 |
| 主题 / 加载器 | 2.4.0 / 1.0.3 |
| 系统 | Windows x64，Windows PowerShell 5.1 |
| 客户端应用版本 | **26.1013.40934** |
| Windows 安装包版本 | **26.1013.4894.0** |
| 外观 | 深色，左到右布局 |
| 完整包运行环境 | Node.js v24.19.0 |

这里列的是已经适配的版本，不代表自动兼容之后的客户端更新。版本或必要页面标记不匹配时，主题会停止应用，保留原界面。

启动器使用已安装的官方客户端和独立本地配置目录，通过只监听本机的调试连接加载主题；它会核对客户端版本与窗口身份。不修改官方安装包、原有外观配置或系统代理。详见 [加载方式与目录](docs/加载方式与目录.md)。

</details>

<details>
<summary>English quick start</summary>

A **Bocchi the Rock! anime wallpaper theme for OpenAI Codex Desktop on Windows**, with six wallpapers, a STARRY wallpaper picker and chibi Kessoku Band stickers. The theme supports the Chat and Work views and remembers the selected wallpaper.

Tested target: **Windows x64, Codex app 26.1013.40934 / package 26.1013.4894.0**, dark appearance. This is a fan-made customization, not an official OpenAI or Bocchi the Rock product.

Download the **windows-x64.zip** package from [Releases](https://github.com/Eltamako/bocchi-codex-theme/releases), extract it, run `01-安装.cmd` (install), then `02-启动主题.cmd` (start). Keep the extracted folder in place. The runtime is included. Use `03-暂停主题.cmd` to pause, `04-恢复主题.cmd` to resume, and `05-恢复原界面.cmd` to return to the ordinary client.

</details>

## 说明与致谢

程序代码使用 [MIT 许可](LICENSE)，感谢 [Codex Dynamic Skin](https://github.com/CCDawn/Codex-Dynamic-Skin) 的基础工作；相关许可保留在 [第三方说明](THIRD_PARTY_NOTICES.md)。壁纸与贴纸的来源、许可范围单独见 [素材说明](ASSETS.md)，不包含在代码的 MIT 授权内。

这是爱好者制作的主题，与 OpenAI 及《孤独摇滚》官方没有隶属关系。

[更新记录](CHANGELOG.md) · [验证记录](docs/验证记录.md) · [开发与打包](docs/开发与打包.md)

欢迎在 Issues 留下版本号、复现步骤和去掉个人内容的截图，一起把它打磨得更顺手。
