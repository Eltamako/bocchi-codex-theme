# GitHub 发布与版本更新

仓库：https://github.com/Eltamako/bocchi-codex-theme

每次发布保留三样东西：**提交**记录改动，**标签**固定该版源码，**Release**提供安装包和说明。不要覆盖旧标签或旧附件，旧版用于回退。

## 怎样选择版本号

- 小修复、轻微颜色或衔接调整：`2.4.0 → 2.4.1`。
- 新增壁纸或功能：`2.4.0 → 2.5.0`。
- 需要用户改变原有安装或配置方式的不兼容改动：评估升级主版本。
- `R17.2` 等只用于制作过程；公开下载统一使用 `2.4.0` 这样的版本。

## 发新版的顺序

1. 从最新 `main` 创建工作副本，完成修改及检查，更新版本、更新说明与校验清单。
2. 生成 Windows 完整包、源码包和 `SHA256SUMS.txt`，解包检查；确保不含个人聊天、登录资料、本机配置或调试记录。
3. 提交并推送源码。下面以未来的 `2.4.1` 为例；只在该版本已完成时执行：

```powershell
git status --short
git add README.md CHANGELOG.md ASSETS.md release.json CHECKSUMS.sha256 theme engine docs tools tests
git commit -m "发布 2.4.1：说明这次的具体修复"
git push origin main
git tag -a v2.4.1 -m "Bocchi Codex Theme 2.4.1"
git push origin v2.4.1
```

若还改了安装脚本等根目录文件，也应审查后单独加入暂存区。`git status` 中的无关文件不要一起提交。

4. 在 GitHub 的 **Releases → Draft a new release** 选择刚推送的标签，填写本版变化、适配客户端、升级方式与检查边界。
5. 上传 `windows-x64.zip`、`source.zip`、`SHA256SUMS.txt`，确认上传完成再发布。也可以在发布界面基于**已核对的提交**创建新标签，效果相同。
6. 发布后核对标签指向的提交、三份附件、文件大小和 SHA256，点开下载链接确认可用。

发布前若远端 `main` 已发生变化，先检查新提交并合并，避免强制覆盖别人的更新。凭据由 GitHub 登录或凭据管理器处理，不写进脚本、README 或仓库。

## 用户怎样升级

下载新版本到独立目录，旧版目录先保留。先保存草稿并退出旧主题会话，安装新版；启动主题前退出普通客户端。只迁移壁纸选择文件，不迁移运行状态。详见 [恢复与回退](恢复与回退.md)。
