# macOS validation and remaining work

Target: Apple Silicon macOS, ChatGPT / Codex 26.1021.31345 (21828). Prototype checks were performed on 2026-10-25.

## Prototype native evidence

The separately installed experimental package passed nine local lifecycle/identity checks: signed app and real socket ownership, wrong build rejection, changed process creation-time rejection, repeated Start reuse, Work home rendering, Pause cleanup, Resume preserving wallpaper selection, Stop exiting only the loader, and Resume creating a new loader on the same window.

The native Work home had one active page/main surface/editor, STARRY visible, and a ready renderer. Its approximately 905px content region had a 56px left reading-column offset and 560px column width. Pause/Stop yielded zero owned nodes, zero theme styles and no theme API. The user manually signed in, opened the native page and selected wallpapers. Automated native UI input and screenshot capture were unavailable.

`macos/static-validation.json` records the installed app's OpenAI signer, signed ASAR-header hash, eleven selector groups and source filenames. It is static source evidence, not proof of every native layout. In this build, the Chat reader selection attribute contains a conversation ID rather than boolean `true`; Mac reader matching was adapted accordingly.

## Rebased source contribution

The contribution retains the existing Windows adapter and release version. Mac-specific reader validation/preflight is selected only by `macos/adapter.json` with `platform: darwin`; Windows retains its existing reader fallback. Mac loader exit and additional cleanup probes are also platform-scoped.

Run `node --test tests/*.test.mjs` on macOS for the shared Node regressions and new Mac identity/launcher checks. `tools/test-renderer.mjs` tests six wallpaper switches, resizing, Mac Work composer/request/submitting shells, rejection and cleanup against inspected-marker fixtures. Fixtures do not execute the actual client React application or authenticate a session.

The native lifecycle evidence above belongs to the prototype package before this source-only rebase. The rebased contribution passed 48 Node tests (zero failed or skipped) and 18 headless renderer scenarios on 2026-10-25, including two explicit Windows legacy Chat/Work reader cases. The installed-app signature/version inspection also passed. A repeat live ownership probe could not proceed because the prototype owner process had exited; the rebased contribution has not repeated the authenticated native lifecycle run.

Windows PowerShell 5.1/7 and macOS Node jobs are included in `.github/workflows/tests.yml`. Each PowerShell suite runs in a separate process to isolate its mocks. CI tests do not log into or launch Codex.

CI on 2026-10-25 passed all 48 Mac Node tests, 36 Windows Node tests and six of the seven Windows suites under each PowerShell host. The unchanged shortcut suite fails on the English hosted runner: COM shortcut readback changes the Chinese `入口.ps1` argument to `??.ps1`. Running the original upstream `e9b85c8` shortcut suite on the same runner reproduced the failure (exit 1; reported ANSI code page 1252). This is an existing Windows baseline failure, remains visible in CI and is not resolved by this Mac contribution. See the [diagnostic run](https://github.com/greppro/bocchi-codex-theme/actions/runs/40160837673); the PR links the latest run.

## Pending acceptance

- Full native Chat conversation and image-preview lifecycle.
- Native Work conversation reader, request card and attachment-submitting lifecycle.
- Native visual checks across window sizes, split panels, minimize/restore, and all six wallpapers.
- Intel macOS and Linux are not supported by this experimental launcher.
- Maintainer review of Mac directory/release layout and inherited-helper policy.

The source contribution includes no app code, runtime binary, profile, token, local installation record or raw user log. Artwork and its licensing/attribution are unchanged.
