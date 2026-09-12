@echo off
REM ===================================================================
REM  MediKiosk - commit and push
REM
REM  Run this from the project folder by double-clicking it.
REM  It uses the git credential already on this computer - there is no
REM  token in this file, and you should never put one in it.
REM ===================================================================
setlocal
cd /d "%~dp0"

echo.
echo  MediKiosk - commit and push
echo  ===========================
echo.

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo  ERROR: this folder is not a git repository.
  pause
  exit /b 1
)

REM --- refuse to push a private key, whatever else happens -----------
REM  Two patterns, because the marker alone is not enough: these files legitimately
REM  contain "-----BEGIN PRIVATE KEY-----\n..." as a PLACEHOLDER, and blocking on
REM  that would train you to ignore the warning. These match key MATERIAL - a real
REM  base64 run after the marker, or a real service-account key id.
echo  Checking for secrets...
set "PAT1=BEGIN PRIVATE KEY-----.{0,6}[A-Za-z0-9+/]{40,}"
set "PAT2=private_key_id[^A-Za-z0-9]{1,8}[a-f0-9]{20,}"

git grep -I -l -E "%PAT1%" -- . ":(exclude)push-to-github.bat" >nul 2>&1
if not errorlevel 1 goto :secret
git grep -I -l -E "%PAT2%" -- . ":(exclude)push-to-github.bat" >nul 2>&1
if not errorlevel 1 goto :secret
goto :nosecret

:secret
echo.
echo  STOPPED: a file in this repo contains what looks like a real private key.
git grep -I -l -E "%PAT1%" -- . ":(exclude)push-to-github.bat"
git grep -I -l -E "%PAT2%" -- . ":(exclude)push-to-github.bat"
echo.
echo  Remove the key from those files before pushing - and remember that
echo  deleting it here does NOT remove it from git history. Rotate the key
echo  in the Firebase console; that is the only thing that actually helps.
echo.
pause
exit /b 1

:nosecret
if exist firebase-service-account.json (
  git check-ignore -q firebase-service-account.json
  if errorlevel 1 (
    echo.
    echo  STOPPED: firebase-service-account.json is NOT gitignored.
    pause
    exit /b 1
  )
)
echo  OK - no private keys in tracked files.
echo.

echo  These files have changed:
echo.
git status --short
echo.

set /p GO="  Commit and push all of the above? (y/N) "
if /i not "%GO%"=="y" (
  echo  Cancelled. Nothing was committed.
  pause
  exit /b 0
)

git add -A
git commit -F "%~dp0.commit-message.txt"
if errorlevel 1 (
  echo.
  echo  Nothing to commit, or the commit failed.
  pause
  exit /b 1
)

echo.
echo  Pushing...
git push origin HEAD
if errorlevel 1 (
  echo.
  echo  Push failed. Usually that means git needs your GitHub sign-in.
  echo  Run this once, then try again:
  echo.
  echo      git push origin HEAD
  echo.
  echo  and complete the browser sign-in it offers. Do not paste a token
  echo  into a chat window - use the browser prompt or Git Credential Manager.
  pause
  exit /b 1
)

echo.
echo  Done. Pushed to GitHub.
pause
