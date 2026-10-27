# 2.7.0 validation notes

[简体中文](../验证记录.md)

Scope as of 2026-10-27: **Windows x64**, Codex app **26.1021.31345**, Windows package **26.1021.3705.0**, theme **2.7.0**, loader **1.3.0**. Evidence sources and unverified scenarios are separated below.

## Automated checks in this round

- Windows source Node regressions: **52/52 passed, none skipped**, including window discovery, per-window recovery, independent heartbeats, shared selection transactions and dynamic Chat identification.
- **10 isolated suites in each of Windows PowerShell 5.1 and PowerShell 7 passed**: discovery, Unicode shortcuts, instance and readiness guards, startup, duplicate start, installation ownership, termination, package integrity and download-origin boundaries. The two new suites contain 22 and 20 checks.
- Platform tests allow both platforms in a source tree and monitor actual Windows imports, adapter reads and platform calls. Four negative cases detect static/dynamic Mac dependencies, Mac adapter reads and Mac platform commands. Windows ZIP contents are checked separately for Mac-only files.
- Assets and manifest checks passed. Renderer, runtime, wallpaper configuration, CSS and images were not changed in this round; their hashes link to earlier acceptance evidence rather than a claimed new full visual run.

## Simulated download-origin checks

- A harmless marked script was blocked by Windows PowerShell 5.1 under RemoteSigned. After its marker was removed, a Unicode shortcut in the test directory successfully launched the harmless probe. No second real client was launched.
- The real installer passed five scenarios in an isolated copy: CheckOnly, tampered file rejection, missing dependency rejection, installation and repeat installation. CheckOnly preserves markers and creates no configuration; rejected installs preserve markers. Successful installation clears markers only from 14 necessary production scripts after the full manifest is verified. Unneeded scripts remain marked.
- The tested ZIP extractor did not propagate the ZIP marker, so files were also marked explicitly. This is a **download-origin simulation**, not verification of a real browser download and first launch.
- RemoteSigned was applied only to authorized test processes. System, user and organization policies were unchanged. Desktop shortcuts still use RemoteSigned.

## User feedback and earlier evidence

- The user installed and tried the earlier candidate ZIP and reported no problems. Its installation has a successful Windows PowerShell 5.1 start record, and its 105 original manifest files matched the reviewed ZIP. This confirms a successful start, not every possible workflow.
- Earlier native Windows checks covered Chat attachments/replies, scrolling, image viewers, all six wallpapers, composer growth, rounded edges, pause/resume, repeat start and loader cleanup.
- Earlier native two-window checks covered opening a task in another window, loading both windows, reopening a window, coordinated pause/resume and cleanup after normal or abnormal loader termination. The user's client was not forcibly terminated.
- Earlier simulations included 108 visual combinations, four scale factors, 23 renderer fixtures, and targeted image-viewer, corner, English-menu and dynamic-DOM checks. These are not native frame-rate guarantees.

## Final artifacts and limits

Use SHA256SUMS.txt beside the final ZIPs to identify them. Local release review separately records archive hashes, counts, CRC checks, extracted-package regressions and installation checks. Earlier packages and evidence are retained. The installer fix produces different bytes from the package previously tried by the user.

Not verified: a real browser download chain, a fresh English Windows installation, other Windows versions, real client crashes or shutdown recovery, arbitrary window-count load, or native macOS. The current final package has not been cold-launched by exiting the active client again; earlier startup and two-window evidence is reused only where unchanged file hashes support it. Remote CI was not triggered. Experimental macOS integration is reviewed separately and is excluded from the Windows release package.
