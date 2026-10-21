# 2.6.1 validation

[简体中文](../验证记录.md)

Scope: Windows x64, Codex 26.1016.51333 / package 26.1016.6573.0. Theme 2.6.1; loader 1.2.1.

## Native checks

- The reported version error came from a legacy Chinese shortcut still pointing to theme 2.4.0. The v2.6.0 installer on GitHub lacked migration for that shortcut. Client-version checks remain enabled.
- The old shortcut was backed up byte for byte and replaced by the current Bocchi Codex Theme entry. The old installation was preserved.
- After exiting from the tray, the user manually opened the new desktop shortcut and confirmed the wallpaper. The startup trace confirms a launch without another client, theme 2.6.1 active, image loaded and wallpaper choice retained. This recorded launch took about 18 seconds, not a performance guarantee.
- On the user-designated Chat image, opening, closing and reopening preserved the same theme instance and backdrop. Chat replaces the conversation composer with a separate image-edit composer. Native main/header corners match and STARRY has no glow.
- The ordinary-client guard was observed and its process identity verified; no window was forcibly closed. One earlier reported unresponsive click produced no new entry record, so its cause was not independently established. A subsequent user-initiated desktop launch succeeded.

## Isolated checks

- Shortcut creation/update, exact backup, repeated setup, Chinese/space paths, legacy migration, one recognized theme entry, unrelated shortcut preservation, local application-icon copy and executable fallback.
- 19 image-preview cases cover Chat/Work, moved or replaced composers, native transitions, repeated cycles, pause, navigation, lease expiry and unrelated-dialog guards.
- Two rounded-edge cases at 100% and 150% scaling cover the separate titlebar, background, panel seams, unchanged art/composer layout and cleanup.
- 24 startup, 29 duplicate-start and 3 bilingual checks passed. Read-only installer checks passed for the local client version, runtime and six-wallpaper assets.
- All 23 PNGs match v2.6.0, including the two public screenshots. The previous large matrix was not repeated; historical results are retained under v2.6.0.

## Limits

Isolated results are not native frame-rate guarantees. Full English Windows acceptance is not complete. Community reports without machine diagnostics remain unconfirmed. Account/chat data, runtime configuration and test output are excluded from releases. No simulated screenshots are added to public pages.
