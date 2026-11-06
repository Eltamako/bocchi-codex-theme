# Update regression checklist

Keep the fixes that address previously observed problems. Inspect the current client structure before changing selectors, and reuse verified assets and rendering behavior where they still match.

| Area | Behavior to preserve | Verification |
| --- | --- | --- |
| First launch after tray Exit | Continue within the same click only when the former owner has exited and its port is free | Startup regression and native cold start |
| Login/loading page | Record `waiting-for-page` and keep watching; distinguish actual identity, layout and renderer errors | Readiness and runtime-install tests |
| Repeated clicks | Reuse and activate the verified existing instance | Duplicate-start tests |
| State-file replacement | Retry only known transient read errors | Runtime-state tests |
| Shortcut and downloaded scripts | Unicode paths, preserved local icon, exact package verification before removing script download marks | Shortcut, integrity and origin-mark tests |
| Client updates | Check both app and Windows package versions, architecture and process identity | Discovery and installation CheckOnly |
| Footer seam and message leakage | Clear only verified native paint layers; clip the reader at the real footer boundary | Chat/Work tall-composer, sibling-paint and restoration fixtures |
| Home layout | Align title and mode switch with the composer; keep the mascot clear of the toolbar and preserve the native icon | Global/project home, small-window and menu fixtures |
| Tables | Remove duplicated inner viewport padding without disabling horizontal scrolling | Table fixtures and restoration |
| Image previews | Handle Work portals, Chat composer replacement and closing transitions without removing the scene | Chat/Work viewer fixtures; native checks recorded separately |
| Resize and sidebars | Commit a complete matching scene, reuse cached geometry, cancel obsolete rendering | Resize fixtures and native sidebar checks |
| Appearance | Preserve native corners, no STARRY halo, temporary dark appearance and restoration | Stylesheet hashes and native inspection |
| Artwork | Keep all six assets, framing, colors, continuous top environment and headphone bottom treatment | Asset hashes and completed scene checks |
| Multiple windows | One verified Desktop instance, per-window recovery/heartbeat and shared selection transactions | Multiwindow, wallpaper-store and startup tests |
| Mobile task ownership | Prevent duplicate independent Desktop instances; do not change remote task locks | Startup tests; mobile end-to-end acceptance remains separate |
| Package boundaries | Six public wallpapers only; no private experimental assets, Mac runtime or local user data | Inspect final ZIP entries and hashes |

`tests/` contains automated regressions. `tools/test-renderer.mjs` uses simulated pages, waits for the selected scene to finish, and checks its artwork hash before screenshots. See [validation](validation.md) for results and native test boundaries.

Keep shared renderer/runtime changes small for future Mac collaboration. Windows multiwindow and identity protections remain intact. Mac runtime integration is reviewed separately; native Mac validation is not implied by Windows or simulated tests.
