# How the theme loads

[English home](../../README.en.md) · [中文说明](../加载方式与目录.md)

The Windows launcher locates the installed official Codex package and checks its application and package versions. It starts a dedicated local profile and connects through a debugging endpoint bound to 127.0.0.1. Browser identity, process identity and the main page are verified before the theme is applied. The verified theme window temporarily uses the client’s existing dark palette; pausing releases that presentation override. It does not patch the official application, change the system proxy or replace the ordinary client’s appearance preferences.

The theme folder contains the renderer, artwork, shared translation catalog and bundled runtime. Local installation state lives inside **.local**: the dedicated sign-in profile, wallpaper choice, language choice, runtime status and diagnostic logs. These files are not release assets and should not be uploaded as a support bundle.

The renderer uses the existing client layout, with a shared coordinate system for artwork and environment extensions, reading overlays, footer clipping and a STARRY picker. Six fixed wallpaper IDs are kept stable across languages. Language changes update labels without recreating the wallpaper scene. Unsupported pages or an expired loader lease remove the theme; a failed wallpaper load retains the last valid catalog where available.

The local language setting accepts Automatic, Simplified Chinese or English. Windows tools use the system UI language when automatic. The renderer prefers the client document language and otherwise uses the system language recorded by setup. Explicit preferences override both and never change official settings.
