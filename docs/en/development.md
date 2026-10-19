# Development and packaging

[English home](../../README.en.md) · [中文说明](../开发与打包.md)

The source package omits the Node binary. Copy it from the matching Windows package into the engine folder and verify its SHA256 against the release metadata. Keep its license notices.

Use the package runtime with **--preserve-symlinks --preserve-symlinks-main** when running local Node checks. Run the wallpaper-store, environment and language test modules with Node’s test runner, and the shortcut, instance-guard and readiness PowerShell tests. Tests use isolated output directories. **Install.cmd -CheckOnly** reads the local client version and validates files without creating settings or a desktop shortcut. A skipped test is not a pass.

Shared strings live in the theme’s translation catalog. Add each key and format placeholder to both languages, keep diagnostic identifiers stable and use plain, friendly wording. PowerShell scripts are UTF-8 with BOM for Windows PowerShell 5.1 compatibility; command entry files use UTF-8 and set code page 65001.

Update release metadata, the adapter, changelog, both READMEs and validation notes together. Do not widen the supported client versions without validation. Refresh checksums using the checksum tool, then run the release build script with the approved Node binary. The Windows package includes the runtime; the source package uses the same file manifest and omits that binary. Do not overwrite published archives or tags.

Packaging is allowlisted. It excludes local profiles, sign-in data, installation records, logs, shortcuts, test output and Git history. Inspect the extracted archive, verify every entry and publish archive hashes. Keep a source commit, an immutable version tag and a Release containing the Windows package, source package and SHA256SUMS.txt. Verify downloads and hashes after publication.

Do not bundle screenshots with personal content unless their public use has been authorized. See [validation and limits](validation.md) and [artwork permissions](assets.md).
