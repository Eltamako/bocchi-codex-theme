# 2.6.0 validation

[简体中文](../验证记录.md)

Target: Windows x64, Codex 26.1016.51333 / package 26.1016.6573.0. Theme 2.6.0; loader 1.2.0.

## Completed candidate checks

- Local client bundle review of page, composer, footer and panel structure.
- 38 isolated page checks: 24 six-wallpaper Chat/Work home/conversation comparisons against 2.5.1; window sizes, shared titlebar focus markers, sidebar/panel transitions and English/dark-appearance behavior.
- 14 additional simulated checks for mode reuse, drawing failure recovery, choice persistence, missing assets and cleanup.
- 23 composer/footer checks covering multiline and attachment heights, scrolling, long content, the last message, request cards and style restoration.
- 2 rounded-edge checks at 100% / 150% scaling: native corners, panel seams, sidebar cut-outs, unchanged framing/composer and cleanup.
- 14 image-preview checks: old opaque-dialog reproduction, Chat/Work ordinary, generated-image and portalled-composer variants, repeated opening/closing, native View Transition, pause/navigation/lease guards, ordinary-dialog exclusion and appearance restoration.
- Node: 25 passed, 1 skipped (sandbox directory-junction restriction).
- Isolated PowerShell: 24 startup, 29 duplicate-launch and 9 identity checks, plus readiness/diagnostic and test-directory shortcut checks.
- Read-only installer validation passed for the actual client, bundled runtime and assets; the current client was not closed.

## Native validation

After the user relaunched through the candidate entry, Codex 26.1016.51333 loaded theme 2.6.0 with loader 1.2.0. Pause/resume succeeded. Opening and closing an image in the Work test conversation preserved the same theme instance, backdrop, framing and reading gradient. Native inspection found and fixed cleanup caused by the viewer temporarily portalling the same composer outside the conversation.

Checked the Chat test conversation, all six menu thumbnails, wallpaper selection, sidebar resizing, native rounded edges and the glow-free STARRY button. Chat image previews passed isolated simulations; native Chat image opening/closing was not completed.

## Limits

Page and timing results are simulations, not native frame-rate guarantees. Full acceptance on an English Windows installation is not complete. The community-reported startup failure remains unconfirmed without that machine's diagnostic data.

The two approved 2.4 screenshots are unchanged. No new simulation images, account/chat data, local settings, client reference code or test artifacts are packaged. Historical results remain under their original release tags.
