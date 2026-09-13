@echo off
REM ===================================================================
REM  MediKiosk - push watcher.
REM
REM  Leave this window open. It does nothing until a file named
REM  .push-request appears in this folder; then it commits and pushes,
REM  writes the full transcript to .push-result, and deletes the request.
REM
REM  That lets Claude trigger a push by writing one file, without needing
REM  to drive your mouse or keyboard. Close this window to stop it.
REM
REM  It pushes to whatever origin this repo already points at, using the
REM  git credential already stored on this machine. There is no token in
REM  this file and none should ever be put in one.
REM ===================================================================
cd /d "%~dp0"

echo  ==========================================
echo   MediKiosk push watcher - running
echo  ==========================================
echo.
echo   Folder : %~dp0
echo   Waiting for .push-request ...
echo   (close this window to stop)
echo.

:loop
if exist "%~dp0.push-request" goto :job
ping -n 4 127.0.0.1 >nul 2>&1
goto :loop

:job
echo [%date% %time%] request seen - running...
del "%~dp0.push-result" >nul 2>&1
call "%~dp0commit-and-push-core.bat" > "%~dp0.push-result.tmp" 2>&1
set RC=%ERRORLEVEL%
echo. >> "%~dp0.push-result.tmp"
echo EXITCODE=%RC% >> "%~dp0.push-result.tmp"
REM  Rename last, so a reader never catches a half-written file.
move /y "%~dp0.push-result.tmp" "%~dp0.push-result" >nul 2>&1
del "%~dp0.push-request" >nul 2>&1
echo [%date% %time%] done, exit code %RC%
echo   Waiting for .push-request ...
echo.
goto :loop
