# macOS validation and remaining work

Target: Apple Silicon macOS, ChatGPT / Codex 26.1021.31345 (21828). Prototype checks were performed on 2026-10-25.

## Prototype native evidence

The separately installed experimental package passed nine local lifecycle/identity checks: signed app and real socket ownership, wrong build rejection, changed process creation-time rejection, repeated Start reuse, Work home rendering, Pause cleanup, Resume preserving wallpaper selection, Stop exiting only the loader, and Resume creating a new loader on the same window.

The native Work home had one active page/main surface/editor, STARRY visible, and a ready renderer. Its approximately 905px content region had a 56px left reading-column offset and 560px column width. Pause/Stop yielded zero owned nodes, zero theme styles and no theme API. The user manually signed in, opened the native page and selected wallpapers. Automated native UI input and screenshot capture were unavailable.

`macos/static-validation.json` records the installed app's OpenAI signer, signed ASAR-header hash, eleven selector groups and source filenames. It is static source evidence, not proof of every native layout. In this build, the Chat reader selection attribute contains a conversation ID rather than boolean `true`; Mac reader matching was adapted accordingly.

## Rebased source contribution

The contribution retains the existing Windows adapter and release version. Mac-specific reader validation/preflight is selected only by `macos/adapter.json` with `platform: darwin`; Windows retains its existing reader fallback. Mac loader exit and additional cleanup probes are also platform-scoped.

Run `node --test tests/*.test.mjs` on macOS for the shared Node regressions and new Mac identity/launcher checks. `tools/test-renderer.mjs` tests six wallpaper switches, resizing, Mac Work composer/request/submitting shells, rejection and cleanup against inspected-marker fixtures. Fixtures do not execute the actual client React application or authenticate a session.

The native lifecycle evidence above belongs to the prototype package before this source-only rebase. The rebased contribution passed 48 Node tests (zero failed or skipped) and 18 headless renderer scenarios on 2026-10-25, including two explicit Windows legacy Chat/Work reader cases. The installed-app signature/version inspection also passed. A repeat live ownership probe could not proceed because the prototype owner process had exited; the initial PR had not repeated the authenticated native lifecycle run; the completed current-source follow-up is recorded below.

Windows PowerShell 5.1/7 and macOS Node jobs are included in `.github/workflows/tests.yml`. Each PowerShell suite runs in a separate process to isolate its mocks. CI tests do not log into or launch Codex.

CI on 2026-10-25 passed all 48 Mac Node tests, 36 Windows Node tests and six of the seven Windows suites under each PowerShell host. The unchanged shortcut suite fails on the English hosted runner: COM shortcut readback changes the Chinese `入口.ps1` argument to `??.ps1`. Running the original upstream `e9b85c8` shortcut suite on the same runner reproduced the failure (exit 1; reported ANSI code page 1252). This is an existing Windows baseline failure, remains visible in CI and is not resolved by this Mac contribution. See the [diagnostic run](https://github.com/greppro/bocchi-codex-theme/actions/runs/40160837673); the PR links the latest run.

## Pending acceptance

- Full native Chat conversation and image-preview lifecycle.
- Native Work conversation reader, request card and attachment-submitting lifecycle.
- Native visual checks across window sizes, split panels, minimize/restore, and all six wallpapers.
- Intel macOS and Linux are not supported by this experimental launcher.
- Maintainer review of Mac directory/release layout and inherited-helper policy.

The source contribution includes no app code, runtime binary, profile, token, local installation record or raw user log. Artwork and its licensing/attribution are unchanged.

## Maintainer review follow-up (2026-10-25)

`CHECKSUMS.sha256` now lists Windows distribution files only. It retains every upstream Windows manifest path and adds only the Windows payload/endpoint regression and Windows ZIP test. `.command`, `macos/`, `.github/`, Mac engine modules/tests and Mac tools are excluded. `build-release.ps1` also rejects these entries in a stale or edited manifest before opening the archive. Mac continues to use `build-macos.py` and the archive's independent `CHECKSUMS-macos.sha256`.

The dedicated `windows-package` CI job builds a real Windows ZIP with the hash-verified official Node runtime under both PowerShell 5.1 and 7. It compares the full ZIP contents to the Windows manifest, checks required launchers and adapter, runs the Windows payload/endpoint tests from the extracted package without Mac files, and rejects six mixed manifests. This job runs independently of the pre-existing shortcut failure.

The renderer harness can compare the original upstream `e9b85c8` renderer with the current renderer using the same Windows adapter. It exercises Chat/Work readers, the fallback reader, no reader, and duplicate legacy readers at 1440px and 800px, comparing readiness, geometry and cleanup. The macOS CI job preserves the result JSON as `renderer-regression-evidence`. These remain fixtures, not authenticated native client acceptance.

Boundary review: launch and Resume verify the OpenAI signer and exact version/build; each target-discovery pass probes the disk version and process/socket identity. The Mac launcher creates only package-owned `.local/managed-profile` and `.local/codex-home`, refuses symlink directories, and does not copy ordinary account data. Stop controls the loader and keeps the client open. Terminal identity errors fail closed and stop reconnecting; if cleanup cannot reach the renderer, the 12-second heartbeat lease removes the theme after its last renewal. No command kills clients by application name or deletes user profiles. `SIGKILL` cannot run immediate cleanup, so lease expiration rather than immediate removal is the expected bound. A launcher crash can leave an operation lock; the documented recovery requires confirming no launch operation is running and removing only that lock, not the profile.

Native input and screenshots are still unavailable through Computer Use (`com.openai.codex` is denied by the tool). Sending messages, uploading a harmless attachment, switching all wallpapers and resizing the native window require a human run. Record each result in `macos/native-acceptance.md`; do not mark these scenarios passed from CI evidence.

Current-source follow-up: **11 real Mac checks passed**, with runtime SHA-256 `096F49EB56026CD9547CAB78085EBE6273DD6DBB04D302DDFD9F7C6D9AB55A3F`. The signed 26.1021.31345 (21828) app rendered the native Work page, Pause/Stop removed every owned node/style/API, Resume retained the selected wallpaper, and the one ordinary client process retained its identity. The report contains no app path, PID, account or chat text: [lifecycle-evidence.json](lifecycle-evidence.json). These lifecycle checks are independent of the still-pending human send/attachment/visual acceptance.

[Review-follow-up CI](https://github.com/greppro/bocchi-codex-theme/actions/runs/40190189737) passed 50 Mac Node tests, all 23 renderer scenarios, 38 Windows Node tests, and the dedicated Windows packaging job under both PowerShell hosts. Each Windows ZIP had 103 entries, its extracted payload/endpoint tests passed and six mixed manifests were rejected. The other Windows job fails solely in the unchanged shortcut suite under both hosts; the original upstream baseline again reproduced exit 1 and the `??.ps1` readback with code page 1252.

`node tools/test-macos-session.mjs --exit-probes` additionally supports verified-loader SIGTERM/SIGKILL probes and Resume. Do not run it concurrently with manual wallpaper selection. A trial concurrent with human wallpaper switching failed the retention assertion before reaching the exit probes; it is not counted as an acceptance result. The SIGKILL probe waits 13 seconds, but native visual lease cleanup still needs human observation.

### Native archived Chat finding and fix

During human acceptance, the user reported that opening older native Chat conversations restored the default appearance, with unreliable automatic theme recovery. The theme diagnostics reported `unknown-mode`: the old conversation's composer had an unrecognized accessible label. The actual native Chat page has one inspected conversation-ID Chat reader and also a generic message-navigation/portal reader; that generic marker is shared with Chat and cannot discriminate Work.

The Mac path now accepts a unique native Chat reader inside the already-verified main surface when the composer label differs. It preserves exact version/process checks, rejects duplicate Chat readers and contradictions between an explicit Work composer and Chat reader, and leaves unknown composers without a Chat marker rejected. The Windows branch is unchanged. The installed theme recovered on the existing old Chat page (`installed=true`, `ready=true`, `mode=chat`, `reader=true`) while preserving the selected wallpaper. Sanitized diagnostics and the exact renderer SHA are in [archived-chat-evidence.json](archived-chat-evidence.json).

Renderer regression adds archived labels, fresh reader-node replacement with theme-instance retention, shared generic Chat/Work reading markers, unknown composers and explicit conflicting modes. The user then confirmed stable restoration when switching among several older native Chat conversations and back to a new one. Message sending, attachment/request states and full visual acceptance remain unverified.

The user selected **finish this PR first** and handle Images, Scheduled Tasks and Settings page theming separately. These pages are intentionally outside the current Chat/Work adapter and use the default appearance. They are not counted as a failed Chat/Work regression or silently added to this contribution.

The final code commit [9150766 CI](https://github.com/greppro/bocchi-codex-theme/actions/runs/40191142334) passed 50 Mac Node tests, 28 renderer scenarios, 38 Windows Node tests and the dedicated Windows ZIP job under both PowerShell hosts. The unchanged shortcut failure and same upstream baseline reproduction remain visible in the separate Windows regression job.

Final exit-boundary probe: **SIGTERM and SIGKILL both passed** for only the verified theme loader. The managed client and the ordinary client process retained their identities, wallpaper selection persisted and Resume created a new loader. The probe observed a ready native Chat renderer after Resume. Sanitized results are in [exit-evidence.json](exit-evidence.json). SIGTERM also wrote the expected stopped status. SIGKILL cannot execute cleanup; the probe allowed the 12-second renderer lease to expire before Resume, but did not read the native UI or confirm the visual cleanup. That visual observation remains unverified.
