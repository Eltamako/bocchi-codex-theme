# Getting started

[简体中文](../使用说明.md) · [English home](../../README.en.md)

Install and open the official Codex client once before setting up the theme. Use the 2.5.0 Windows x64 package with Codex app 26.1013.40934 / package 26.1013.4894.0 ; dark appearance is applied automatically while the theme is active.

Extract the whole archive into a writable, permanent folder. Avoid WindowsApps, Program Files and temporary extraction folders. Run **Install.cmd**. It creates an installation record, a local data folder and one desktop shortcut named **Bocchi Codex Theme**. Setup does not close your current client or immediately switch its appearance. If a same-name shortcut points elsewhere, it is backed up before being updated; other shortcuts are left alone.

Save drafts, let active tasks finish and exit the ordinary Codex window. Open the theme shortcut or **Start.cmd**. The dedicated theme window may need its own sign-in; enter credentials only in the official client. Open Chat or Work. The theme temporarily uses dark appearance and restores the window’s original appearance when paused. Your saved Light, Dark or System preference is unchanged. If the launcher times out during sign-in, finish signing in and run **Resume.cmd**.

## Picking a wallpaper

Open STARRY in the top-right corner. All six wallpaper choices are shared by Chat and Work and remembered after restart. Use the mouse or keyboard; Escape closes the menu and returns focus to STARRY. When switching quickly, the latest request takes priority.

Work conversation pages have a darker reading area than Chat. Stickers adapt to the space available and may shrink or hide around panels, dialogs and narrow windows. Native menus, code and tool cards keep readable backgrounds.

## Language and everyday controls

Run **Language.cmd** and choose 1 (Automatic), 2 (简体中文) or 3 (English). Press Enter to keep your current setting. An explicit choice overrides automatic detection and stays in this installation’s local data folder. Automatic follows Windows in setup and the client’s page language in STARRY, falling back to the recorded system language when unavailable. Chinese locales use Simplified Chinese; other locales use English. Neither Windows nor Codex language settings are changed.

From a terminal, the same tools accept **-Language auto**, **-Language zh-CN** or **-Language en**; for example, **Install.cmd -Language en**, **Start.cmd -Language en**, or **Language.cmd -Language auto**. English filenames do not force English by themselves. Both entry sets use the same implementation.

**Pause.cmd** hides the theme while keeping the window open. **Resume.cmd** brings it back. **Restore.cmd** closes the verified theme window and opens the ordinary client, so save unsent drafts first. [Restore and rollback](upgrade-restore.md)

Command windows remain open at the end so you can read the result; press any key to close them. The entry scripts set execution policy only for their own PowerShell process, not system-wide. On managed computers, follow your organization’s software policy.
