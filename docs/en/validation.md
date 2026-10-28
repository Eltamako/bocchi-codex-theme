# 2.8.0 validation

[简体中文](../验证记录.md)

Target: Windows x64, Codex **26.1023.51421 / package 26.1023.6621.0**, theme **2.8.0**, loader **1.3.0**. Updated October 29, 2026.

## Automated checks and independent review

- Registered metadata, the manifest, owl-app.ini and archived package.json agree. Work continues from the October 28 candidate with its home, footer and table fixes.
- Reviewed actual official structures for Chat, Work, home controls, DIL tables, image viewers, sidebars and window routes. Six shared CSS assets are identical. Native testing subsequently exposed a missed footer fade outside the composer host; its exact lookup scope has now been corrected.
- **52/52 Node regressions passed without skips**, including multiwindow recovery, independent heartbeats, shared selection transactions, dynamic Chat, asset fallback, identity and platform boundaries.
- **47/47 headless checks passed** for six wallpapers, Chat/Work, home alignment/stickers, table scrolling, reader clipping, preview portals, request/submission states, cleanup and baseline comparisons. Two added cases reproduce sibling footer paint, composer growth, unrelated gradients and native-style restoration. Home fixtures cover 800, 1280 and 1920 pixel widths.
- Five relevant suites passed under each of PowerShell 5.1 and 7: discovery, Unicode shortcuts, startup, readiness and duplicate starts. System execution policy was unchanged.

## Native Windows checks

- Installed through the original entry from the complete ZIP. The user exited via the tray and successfully opened the desktop shortcut; logs confirm PowerShell 5.1, the expected build and a verified themed process.
- Six Work wallpaper choices, persistence, bilingual menus, both sidebars, rounded clipping, no STARRY halo and reader clipping passed. Chat/Work home headings, mode controls and the box sticker aligned correctly.
- A new task window loaded its wallpaper and saved a choice; closing it left the main window healthy. Existing behavior is retained: windows render independently and share the last successfully saved preference.
- The real Chat generated-image viewer retained its backdrop through opening, reopening and dismissal; all 656 sampled frames kept it. Rapid consecutive close-button automation did not always dismiss the viewer; Escape closed it successfully. Viewer code was not changed on that basis.
- Work image attachments were checked in the side panel. Every kind of Work generated-image fullscreen preview was not repeated this time.
- The horizontal seam above the composer was reproduced and removed by handling the missed empty native paint node. Pause, resume and starting the already-running theme passed without replacing the browser or loader. The original wallpaper and conversation were restored.

## Changes and limits

Compared with the repaired October 28 candidate, the only shared-core change is the renderer footer-paint lookup. CSS, runtime, launch scripts, artwork, dimming strength and framing are unchanged. No public interfaces or configuration fields were added. Mac development remains separate and PR #2 was not modified.

Packages use the same source manifest, with CRC, path, platform-boundary and hash checks. Extracted-package regressions and installation checks are recorded against the final artifacts. Earlier packages and installations are retained.

No new test messages were sent, active tasks were not terminated, and crash-exit behavior was not retested. Every attachment/request-card combination was not repeated. Real browser downloads, a fresh English Windows system, native Mac acceptance and remote CI remain untested. Older native results are historical evidence only for unchanged files. The two approved public screenshots are unchanged.
