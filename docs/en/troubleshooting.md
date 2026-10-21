# Troubleshooting

[简体中文](../常见问题.md) · [English home](../../README.en.md)

## I can’t find Install.cmd

Download **windows-x64.zip** from Releases and extract it completely. GitHub’s Source code archives and source.zip do not include the runtime binary.

## My client version doesn’t match

This release supports app 26.1016.51333 / package 26.1016.6573.0 only. Client updates can change the interface structure. Use the ordinary client while waiting for a matching theme release; editing the expected version number does not adapt the theme.

## Setup succeeded, but startup says the renderer did not confirm

Setup verifies the package and client version; it does not verify the current page or appearance. In 2.4 this generic timeout could also appear when the dedicated window was using light appearance. That message alone does not identify the cause; the community report remains unconfirmed without diagnostics from that computer.

In 2.5, recognized Chat and Work pages automatically use dark appearance while the theme is active. Pausing restores the window’s original appearance without changing the saved Light, Dark or System preference. You do not need to reinstall for an appearance mismatch. If you are still signing in or the page is loading, finish signing in, open a Chat or Work home page, and resume. Other unknown pages are not labeled as light mode.

Version 2.6.0 keeps diagnostics matched to the current request and distinguishes connection, loader-exit and page-layout failures. If that doesn’t help, note the theme/client versions and the state and reason fields in your local diagnostic status. Remove paths, usernames and session identifiers before sharing. Don’t upload the entire local data folder or sign-in profile.

## Another window or a busy port

Save your drafts and exit the ordinary Codex window before opening the theme. If another theme package is already running, use Restore.cmd from that package first. The loader will not attach to a window whose identity it cannot verify. If your phone reports a session conflict, check that it is connected to the current theme window.

## Get-FileHash is unavailable

The package includes a Windows PowerShell module-path bootstrap. Use the provided entry scripts and keep the whole package together. If the error remains, extract a fresh copy and keep the diagnostic message for a report.

## A wallpaper fails to load or switch

Check that you fully extracted the package and kept the artwork files. Re-extract a fresh copy if files are damaged. When a valid wallpaper is already showing, failed switches keep the previous image and preference where recovery is possible.

## The interface flashes when sending, or stickers disappear

The loader preserves a verified Work page through a short editor rebuild, and the renderer adapts stickers to available space. New page shapes can still require an adapter update. For a report, include Chat or Work, first or follow-up message, attachments, request cards and side-panel state. [What was verified](validation.md)

## An English name is shown on a Chinese system

STARRY follows the client’s page language in Automatic mode. Use Language.cmd to select the language you prefer; the English and Chinese launcher filenames do not force a language.


## The wallpaper appears, but I see “Another theme operation is in progress”

This can happen when the shortcut is clicked again while the first launch is still running. In 2.6.0, the later request waits, verifies that the first launch succeeded, and reuses the current window. One click is enough; give startup a little time. An accidental extra click does not require reinstalling. If the operation is still busy after 90 seconds, the launcher explains that the new request was not carried out instead of claiming success.

## I chose Exit from the tray, but Codex still appears to be running

Tray Exit may take a moment to finish. Version 2.6.0 waits up to 20 seconds and distinguishes an open ordinary window, a remaining background process and an identity it cannot verify. Open the theme shortcut directly afterward; you do not need to open the ordinary client first. A verified process belonging to this theme is reused even if its window is temporarily closed.

If the problem continues, keep the message and the local `.local/startup-attempt-*.json` file, along with your theme/client versions and reproduction steps. The trace records startup stages, times, related processes and window state, not chat contents. Review it for information you do not want to share before reporting it. There is no need to delete chat data or reinstall the client.

## The backdrop disappears briefly when viewing an image

Version 2.6.0 keeps the native image viewer’s transparency and animation instead of painting its full-window surface like an ordinary menu. The same conversation backdrop stays loaded while an image is open. Pausing the theme or leaving a supported page still cleans up normally. See [validation](validation.md) for the distinction between simulation and native checks.


## An old desktop shortcut reports a client version change

If the new theme works until you exit, the desktop shortcut may still point to an older installation. Run Install.cmd from the package matching your client, then use Bocchi Codex Theme. Version 2.6.1 backs up and migrates verified legacy Chinese shortcuts; the original is saved under `.local/backups/shortcut-*/`, and the old installation stays in place. Unrecognized shortcuts are left untouched; check their Properties. If Start.cmd in the new folder still reports a version change, compare the installed client with the release compatibility list. Do not edit version numbers to bypass the check.
