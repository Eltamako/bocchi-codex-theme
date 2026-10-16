@echo off
chcp 65001 >nul
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0入口.ps1" -Action Restore
set "themeExit=%ERRORLEVEL%"
if not "%themeExit%"=="0" echo Please see README.md and docs for help.
pause
exit /b %themeExit%
