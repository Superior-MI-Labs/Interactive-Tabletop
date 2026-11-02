@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (py -3 desktop.py) else (python desktop.py)
pause
