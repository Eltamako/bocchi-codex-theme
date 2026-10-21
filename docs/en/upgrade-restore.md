# Pause, restore, upgrade and rollback

[简体中文](../恢复与回退.md) · [English home](../../README.en.md)

## Temporarily hide the theme

Run **Pause.cmd** and give it a few seconds. Your window, conversation and sign-in stay open. Run **Resume.cmd** when you want the theme back.

## Return to the ordinary client

Save unsent drafts and let active work finish first. Run **Restore.cmd**. The launcher stops its own loader, removes the theme, closes only the verified dedicated window and opens the ordinary client. You can use the official Start-menu entry afterward.

Dark appearance is temporary in the theme window and is released on pause, restore or loader lease expiry. The theme has not overwritten the ordinary client’s appearance settings. The ordinary and dedicated windows keep separate local profiles, so their sign-in or appearance preferences may differ.

If the client has updated and the window/package identity can no longer be verified, close the dedicated window yourself and open the official client. Do not terminate every process with the same name or delete chat data. If the loader stops while a themed page remains open, its roughly 12-second lease removes the theme when it expires.

## Upgrade without losing your rollback option

1. In the old package, run Restore.cmd and keep that extracted folder in its original location.
2. Extract the new Windows package into a separate folder and run Install.cmd.
3. Before the first themed launch, you may copy only the old **.local/wallpaper-selection.json** into the new **.local** folder. The six wallpaper IDs are unchanged in 2.5. Select your preferred language again using Language.cmd.
4. Save drafts and exit the ordinary client opened by Restore.cmd, then launch the new theme. Its separate profile may ask you to sign in again.

Do not copy runtime state, process IDs, control files or the entire sign-in profile. The desktop shortcut depends on the installation folder, so keep folders in place.

## Roll back

Run Restore.cmd from the new package. Save drafts and exit the ordinary client, then launch the preserved old package. Run the old package’s installer again if you want the desktop shortcut to point back to it. When returning to 2.3, choose one of its four supported wallpapers first. A client update can make both old and new theme packages incompatible; use the ordinary client until there is a matching adapter.

## Remove the theme

Restore the ordinary client first. Once it opens normally, you can remove the theme shortcut and move the extracted folder to the Recycle Bin. The dedicated profile inside that folder contains its local sign-in and settings; removing it may mean signing in again later. It does not delete cloud account conversations or the ordinary client profile. Keeping the folder is also fine; there is no autostart task.

If setup backed up a previous same-name shortcut, you can copy it back from the package’s local shortcut-backup folder after checking that its old target folder still exists.

## Match the client version

Use theme 2.6.0 with Codex 26.1016.51333 / 26.1016.6573.0. Theme 2.5.1 is for Codex 26.1013.40934 / 26.1013.4894.0. A theme rollback requires a matching client. Transfer only the wallpaper selection, not old runtime state.
