@echo off
REM ===================================================================
REM  MediKiosk - commit and push, CORE logic.
REM
REM  Non-interactive: no pause, no prompts. Exits with a code.
REM  Called by commit-and-push.bat (manual) and watch-and-push.bat (auto).
REM  Do not add "pause" here - it would hang the watcher forever.
REM
REM  Exit codes: 0 ok (pushed or nothing to do), 1 refused, 2 push failed.
REM ===================================================================
setlocal
cd /d "%~dp0"

echo MediKiosk - commit and push
echo ===========================

git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo ERROR: this folder is not a git repository.
  exit /b 1
)

if not exist "%~dp0.commit-message.txt" (
  echo ERROR: .commit-message.txt is missing - refusing to commit without a message.
  exit /b 1
)

REM --- refuse to push a private key, whatever else happens -----------
REM  Two patterns, because the marker alone is not enough: these files
REM  legitimately contain "-----BEGIN PRIVATE KEY-----\n..." as a
REM  PLACEHOLDER, and blocking on that would train you to ignore the
REM  warning. These match key MATERIAL - a real base64 run after the
REM  marker, or a real service-account key id.
echo Checking for secrets...
set "PAT1=BEGIN PRIVATE KEY-----.{0,6}[A-Za-z0-9+/]{40,}"
set "PAT2=private_key_id[^A-Za-z0-9]{1,8}[a-f0-9]{20,}"
set "SKIP=:(exclude)push-to-github.bat :(exclude)commit-and-push.bat :(exclude)commit-and-push-core.bat :(exclude)watch-and-push.bat"

git grep -I -l -E "%PAT1%" -- . %SKIP% >nul 2>&1
if not errorlevel 1 goto :secret
git grep -I -l -E "%PAT2%" -- . %SKIP% >nul 2>&1
if not errorlevel 1 goto :secret
goto :nosecret

:secret
echo.
echo STOPPED: a tracked file contains what looks like a real private key.
git grep -I -l -E "%PAT1%" -- . %SKIP%
git grep -I -l -E "%PAT2%" -- . %SKIP%
echo.
echo Deleting it here does NOT remove it from history. Rotate the key
echo at the provider; that is the only thing that actually helps.
exit /b 1

:nosecret
if exist firebase-service-account.json (
  git check-ignore -q firebase-service-account.json
  if errorlevel 1 (
    echo STOPPED: firebase-service-account.json is NOT gitignored.
    exit /b 1
  )
)
echo OK - no private keys in tracked files.
echo.

echo Working tree:
git status --short
echo.

git add -A

REM  A previous run may have committed successfully and then failed to
REM  push. In that case there is nothing new to commit, but there IS
REM  still something to push - so never exit before reaching :push.
git diff --cached --quiet
if not errorlevel 1 goto :nothingnew

git -c user.name="AaradhyAdhikari" -c user.email="adhikari.aaradhy26@gmail.com" commit -F "%~dp0.commit-message.txt"
if errorlevel 1 (
  echo ERROR: the commit failed.
  exit /b 1
)
goto :push

:nothingnew
echo Nothing new to commit - pushing whatever is already committed.
echo.

:push
echo Pushing...
git push origin HEAD 2>&1
if errorlevel 1 (
  echo.
  echo PUSH FAILED. Usually git needs the GitHub sign-in completed once
  echo in a browser, or via GitHub Desktop. No token belongs in this file.
  exit /b 2
)

echo.
echo PUSHED OK
git log --oneline -1
git rev-parse HEAD
exit /b 0
