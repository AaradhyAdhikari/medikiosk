@echo off
REM Manual double-click entry point. Runs the same logic the watcher uses,
REM then holds the window open so the result is readable.
call "%~dp0commit-and-push-core.bat"
echo.
echo (exit code %ERRORLEVEL%)
echo.
pause
