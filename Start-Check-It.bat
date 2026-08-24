@echo off
cd /d "%~dp0"
start "" "http://localhost:8765/"
"C:\Users\NUSSI\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" "server.py" 8765
