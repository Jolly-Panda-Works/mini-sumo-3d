@echo off
rem Cafe Bazaar Developer API setup: runs tools\bazaar-api-setup.ps1 (it asks for the values).
rem Run from the project folder:  tools\bazaar-api-setup.cmd
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bazaar-api-setup.ps1"
echo.
pause
