@echo off
chcp 65001 >nul
setlocal
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0安装.ps1"  %*
set "themeExit=%ERRORLEVEL%"
if not "%themeExit%"=="0" echo README.md / README.en.md
pause
exit /b %themeExit%
