# 第三方说明

感谢 [Codex Dynamic Skin](https://github.com/CCDawn/Codex-Dynamic-Skin) 提供本地加载机制的基础。本项目沿用并调整了其中的 Windows 发现、启动、配置读取及身份核对相关实现。

- 参考提交：`5a0e74043b63ed9518ab37cdcf6865340a57006c`。
- 原许可：MIT，Copyright (c) 2026 Codex Dream Skin Studio contributors。
- 完整原始许可：[engine/LICENSE-Dynamic-Skin.txt](engine/LICENSE-Dynamic-Skin.txt)。
- 主题新增的代码同样使用 MIT，见根目录 [LICENSE](LICENSE)。

Windows 完整包附带 Node.js v24.19.0，仅用于运行本地加载器。Node.js 及所附组件的完整许可保留在 [engine/LICENSE-Node.txt](engine/LICENSE-Node.txt)，没有删去第三方条款。运行文件的 SHA256 记录在 `release.json`。

主题未包含官方 Codex 客户端的可执行文件或安装包，使用前需要自行安装官方客户端。壁纸与贴纸的来源、制作方式和许可范围单独见 [ASSETS.md](ASSETS.md)。

## 协作致谢 / Contributor thanks

感谢 [greppro](https://github.com/greppro) 在 [PR #2](https://github.com/Eltamako/bocchi-codex-theme/pull/2) 中投入的实验性 Mac 适配工作，包括独立启动器、身份检查、归档 Chat 和平台打包边界。这次 Windows 整理参考并沿用了相关打包边界与测试思路；Mac 运行时代码仍在独立整合中，PR 尚未合并，不代表 Windows 包已支持 Mac。

Thanks to [greppro](https://github.com/greppro) for the experimental Mac work in [PR #2](https://github.com/Eltamako/bocchi-codex-theme/pull/2), including the separate launcher, identity checks, archived Chat handling and distribution boundaries. This Windows preparation incorporates relevant packaging-boundary work and test ideas. Mac runtime integration remains separate; the PR is not merged, and this Windows package does not provide Mac support.
