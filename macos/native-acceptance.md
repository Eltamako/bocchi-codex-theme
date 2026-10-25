# Native Mac acceptance checklist

Target: Apple Silicon, ChatGPT / Codex 26.1021.31345 (21828). Keep the PR Draft / experimental until the actual client scenarios below have been reviewed. Use the theme package's dedicated window and synthetic text/files; screenshots must hide account identity, real conversations and workspace paths.

| Scenario | Steps | Current evidence |
| --- | --- | --- |
| Old Chat navigation | Open 3–5 older native Chat conversations and return to a new conversation; check selected wallpaper restoration | Initial failure reproduced; renderer fix loaded; human retest pending |
| Chat send and reply | Open a native Chat conversation; send “Reply with OK only”; check composer, reading area and response layout | Pending human run |
| Work send and reply | Open a disposable native Work chat; send the same synthetic request | Pending human run |
| Work request card | Observe a harmless request/approval card when available; check visibility and controls | Pending human run; absence is uncovered |
| Attachment/submitting | Attach a text file containing only “Bocchi theme acceptance test”; observe pending/upload/submitting/completed states | Pending human run |
| Six wallpapers | Use STARRY to select night-stage, color-portraits, backstage, floating-bocchi, winter-night, headphone-evening; confirm each displays and preserves readable text | Pending human run |
| Window layout | Narrow and widen the native window, then maximize and restore; check sidebar, reader, input and STARRY; repeat with a split panel if used | Pending human run |
| Pause/Resume/Exit | Run the numbered Pause, Resume and Restore entries; check ordinary appearance, selected wallpaper restoration and that Restore leaves the client open | Current source: 11 automated checks passed; human visual review pending |
| Abrupt loader exit | With synthetic content only, stop the verified loader; allow the last 12-second lease to expire, confirm ordinary appearance, then Resume | Pending current-source run |

Record date, source commit, client version/build, observed result and uncovered states for each scenario. Do not infer attachment success from a static composer shell. If the installed client does not expose native Chat, record that limitation instead of testing embedded chatgpt.com as native Chat.

Automated lifecycle probe: `node tools/test-macos-session.mjs` after manually entering an authenticated native page and finishing manual wallpaper changes. Add `--exit-probes` to test verified-loader SIGTERM/SIGKILL and Resume; this mode waits for the last lease to expire but does not observe its visual cleanup. It controls only this package's theme loader, preserves the managed client window and finishes with Resume. Its JSON report excludes chat content; keep generated reports local until sanitized. Computer Use cannot operate Codex, so this script does not send messages, click native controls or take native screenshots.
