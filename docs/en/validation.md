# Validation and limits — 2.5.1

[中文记录](../验证记录.md)

Checked on 2026-10-20. Windows x64, Codex app 26.1013.40934 / package 26.1013.4894.0; theme 2.5.1, loader 1.1.1.

## Patch checks

- 24 new startup checks cover exit-in-progress waits, verified windowless theme processes, foreign processes, identity changes and both Start/Resume paths.
- 29 new duplicate-start checks use separate Windows PowerShell 5.1 processes to contend for a real named mutex, testing waits, timeouts and abandoned ownership. Isolated status fixtures cover stale acknowledgments, other sessions, pause, unloaded assets and failures. No real client is started or stopped by these tests.
- The existing nine instance checks, eight readiness-attribution checks, and isolated shortcut creation, backup and repeat-install checks pass.
- Node tests: 25 passed, one skipped because the sandbox blocks directory-junction creation, zero failed. Coverage includes language parity, entry aliases, six wallpaper assets, selection memory, switching and missing-asset fallback.
- Windows/source package manifests, exclusions and per-file SHA256 checks are verified. Both approved screenshots, all wallpaper images and framing settings match 2.5.0; the renderer changes only its version number.

## Live evidence and limits

After the same startup fix was applied to the existing local installation, the user confirmed that the wallpaper loaded. Its trace shows background exit completion, the verified window becoming ready and the overlapping shortcut clicks. The duplicate-click fix also has isolated process tests and a read-only check that the current live theme meets the reuse conditions. The active client was not restarted for this release.

This is not a complete 2.5.1 package acceptance run on another machine or an English-language Windows installation. The full visual matrix was not rerun because artwork, framing and rendering behavior are unchanged. The historical page checks below belong to 2.5.0. Real timeout, sign-in, compatibility and identity failures are still reported.

Local runtime settings, traces, chats, accounts and generated test artifacts are excluded. The README screenshots remain the original approved 2.4 Chinese-interface captures.

---

## Historical validation — 2.5.0

[中文记录](../验证记录.md)

Checked on 2026-10-20. Target: Windows x64, Codex app 26.1013.40934 / package 26.1013.4894.0. Theme 2.5.0; loader 1.1.0.

## Completed checks

- **216 simulated page cases** passed: two languages, six wallpapers, Chat/Work, home/short/long conversations and three sizes (1280×800, 1346×860, 1920×1080).
- **36 light-start cases and 10 appearance edge cases** passed: automatic dark presentation, restoration on pause, native/system appearance changes, renderer replacement, lease expiry, unsupported pages and failed assets. No official appearance preference was written.
- **28 sidebar traces** passed, including 100%, 125%, 150% and 200% scale factors. Maximum artwork/environment geometry mismatch was below 0.016 CSS pixels.
- **23 composer/clipping cases** passed: changing footer heights, long content, simulated scrolling, the final message, request cards and cleanup on pause.
- **8 UI cases** passed: all six menu labels fit in both languages; changing language preserves scene and composer geometry. Bocchi framing matches the locally approved R17.4 build. The old generic light-mode failure was reproduced; the new renderer applies dark appearance and restores the prior appearance.
- **13 isolated installer checks** passed, covering Chinese/spaced paths, reinstall, mismatched versions/runtime files/assets, read-only checks and preservation of local state. Shortcut creation and backup were tested in a test directory only.
- Node tests: **25 passed, 1 skipped, 0 failed**. The sandbox blocked directory-junction creation; that case is not counted as passed. Translation parity, entry aliases, selection persistence, rapid switching and missing-asset fallback were checked.
- Five language-tool checks, nine instance-identity checks and eight readiness-attribution checks passed. Both entry languages also passed an isolated startup test with an invalid inherited module path; no real client was launched. PowerShell and JavaScript syntax checks passed.

## What these results do not establish

Browser checks use isolated simulated pages. They do not replace real sending, native scrolling, side-chat or a complete installation on an English-language Windows system. This release has not completed that full English Windows acceptance run. The current local installation and its appearance were left unchanged, with existing theme/loader files verified against their baseline hashes.

README images are two user-approved screenshots from 2.4, not evidence of the 2.5 English interface. Simulation captures, the reported-error photo, accounts, chats, local settings and test artifacts are excluded from the public package.

The reported photo is consistent with the old light-appearance limitation, but the remote machine was not inspected. The new behavior fixes the reproduced trigger; it does not remove version checks or sign-in/page readiness requirements.

Fixed Chinese and English GitHub search terms were recorded before publication. Metadata and bilingual guides improve discoverability and accessibility, but no ranking or indexing-time guarantee is made. Archive and uploaded-asset verification is recorded with this release’s SHA256 files.
