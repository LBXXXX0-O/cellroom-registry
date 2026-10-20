@echo off
title CellRoom Registry - cell room use log
cd /d "%~dp0"
echo Starting cell room registry...
echo Keep this window open while using. Close it to stop.
echo.
start "" http://localhost:3000
node server.js
pause
