# 实验性 macOS / Experimental macOS support

目标：Apple Silicon，ChatGPT / Codex **26.1021.31345（21828）**。这是独立的实验适配，不改变上游 Windows 2.6.2 的正式支持版本。Mac 使用 `macos/adapter.json`，Windows 继续使用 `theme/adapter.json`。

## 使用源码

1. 安装官方 Apple Silicon 客户端和原生 arm64 Node.js 24+。Git 源码不包含 Node 二进制。`.command` 优先使用 `engine/node-darwin-arm64`，没有时使用 PATH 中的 Node。
2. 在仓库根目录运行 `bash ./01-检查安装.command`，检查版本、OpenAI 签名和素材。
3. 运行 `bash ./02-启动主题.command`，在新开的独立配置窗口手动登录，打开客户端自身的原生 Chat/Work 页面。浏览器里的 chatgpt.com 页面不在注入范围内。
4. “主题已加载”后，用右上角 STARRY 切换六张壁纸。首次登录或原生页面未就绪时会继续检查；可运行 `04-恢复主题.command`。

03 暂停并清理外观，04 恢复，05 清理并停止加载器，06 检查应用版本/签名，07 查看状态。暂停/停止保持应用窗口打开。保留源码目录及 `.local/`，其中保存专用登录、配置和壁纸选择。

应用自定义路径通过 `BOCCHI_APP="/路径/ChatGPT.app"` 指定。脚本不复制普通客户端账号或 `~/.codex`，不修改、重签名官方应用，也不按应用名批量终止进程。

## 保护与验证

启动时要求精确 bundle `com.openai.codex` 和 OpenAI 团队 `2DC432GLL2` 的有效签名；版本与构建号同时匹配。每次调试连接前复核磁盘版本、进程创建时间/路径/启动参数、监听者及 IPv4 loopback 地址。

本机新版官方 Computer Use helper 会继承同一监听 socket。仅允许确定路径、直接父进程、有效 OpenAI 签名及相同内核 socket 的官方 helper；其他共享监听者和不同 socket 仍拒绝。加载器退出后，12 秒租约自动移除主题。

已在原型安装包实测 Work 首页及主题生命周期；源码贡献的检查与未验证范围见 `macos/validation.md`。完整原生 Chat 对话、Work 请求/提交状态和各尺寸视觉效果仍需实机验收。

## 本地检查与打包

```bash
node --test tests/*.test.mjs
python3 tools/inspect-macos.py
```

第二条仅适用于目标版本的本机签名应用，会重新生成 `macos/static-validation.json`，不修改应用。

运行 `python3 tools/build-macos.py` 可构建 Mac 完整包。需先从 `macos/node-checksum.json` 中的官方 Node 下载地址取得 arm64 二进制，放到 `engine/node-darwin-arm64`；构建时强制核对 SHA256。Node 许可保留于 `engine/LICENSE-Node.txt`。不要把 Node 二进制或 `.local/` 提交到 Git。

`tools/test-renderer.mjs` 是本地 headless 浏览器夹具，需通过 `BOCCHI_PLAYWRIGHT_MODULE` 指定 Playwright `index.mjs`，并可通过 `BOCCHI_CHROME_EXECUTABLE` 指定浏览器。它不连接客户端，也不替代原生验收。

`tools/test-macos-session.mjs` 需要由这个仓库目录启动并已登录的原生主题窗口，会测试暂停/恢复/停止，最后恢复主题。输出的本机报告默认应保留在本地，分享前审查并去除个人路径。

## English

Experimental Apple Silicon support targets ChatGPT / Codex 26.1021.31345, build 21828. The supported Windows adapter and release metadata remain separate and unchanged. Git source does not include Node binaries; install native arm64 Node.js 24+ or obtain the verified runtime listed in `macos/node-checksum.json`.

Run the numbered `.command` files from the repository root. The launcher creates an isolated profile and Codex home, verifies the OpenAI signer and exact version/build, and checks process identity and loopback port ownership before every debugging connection. Sign in manually in that separate window and open a native Chat/Work page. Browser-hosted chatgpt.com pages are excluded.

Pause/Stop removes the theme and keeps the application open; Resume reuses the verified window. The original application and ordinary profile are not modified. Prototype native checks cover Work home and the theme lifecycle. Full native Chat conversations, Work request/submitting states and visual acceptance remain pending; see `macos/validation.md`.
