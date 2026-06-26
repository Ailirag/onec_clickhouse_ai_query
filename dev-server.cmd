@echo off
cd /d "%~dp0"
call ".\node_modules\.bin\tsx.cmd" server.ts
