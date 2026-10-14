@echo off
cd /d %~dp0
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required.
  echo Install Node.js then run this file again.
  pause
  exit /b 1
)
start "Nice Platform" cmd /k "node server.js"
timeout /t 2 >nul
start http://localhost:3000
