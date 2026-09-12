@echo off
REM ===================================================================
REM  MediKiosk - commit and push  (non-interactive)
REM
REM  Double-click to run. Commits everything and pushes.
REM  Uses the git credential already on this computer - there is no
REM  token in this file, and you should never put one in it.
REM
REM  The secret scan below still aborts the push. That guard is the
REM  point of this script; do not remove it.
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
REM  Two patterns, because the marker alone is not enough: these files
REM  legitimately contain "-----BEGIN PRIVATE KEY-----\n..." as a
REM  PLACEHOLDER, and blocking on that would train you to ignore the
REM  warning. These match key MATERIAL - a real base64 run after the
REM  marker, or a real service-account key id.
echo  Checking for secrets...
set "PAT1=BEGIN PRIVATE KEY-----.{0,6}[A-Za-z0-9+/]{40,}"
set "PAT2=private_key_id[^A-Za-z0-9]{1,8}[a-f0-9]{20,}"
set "SKIP=:(exclude)push-to-github.bat :(exclude)commit-and-push.bat"

git grep -I -l -E "%PAT1%" -- . %SKIP% >nul 2>&1
if not errorlevel 1 goto :secret
git grep -I -l -E "%PAT2%" -- . %SKIP% >nul 2>&1
if not errorlevel 1 goto :secret
goto :nosecret

:secret
echo.
echo  STOPPED: a file in this repo contains what looks like a real private key.
git grep -I -l -E "%PAT1%" -- . %SKIP%
git grep -I -l -E "%PAT2%" -- . %SKIP%
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

echo  Committing these changes:
echo.
git status --short
echo.

git add -A

git diff --cached --quiet
if not errorlevel 1 (
  echo  Nothing to commit - the working tree is already clean.
  echo.
  git log --oneline -1
  echo.
  pause
  exit /b 0
)

git -c user.name="AaradhyAdhikari" -c user.email="adhikari.aaradhy26@gmail.com" commit -F "%~dp0.commit-message.txt"
if errorlevel 1 (
  echo.
  echo  The commit failed.
  pause
  exit /b 1
)

echo.
echo  Pushing...
git push origin HEAD
if errorlevel 1 (
  echo.
  echo  Push failed. Usually that means git needs your GitHub sign-in.
  echo  A browser window may have opened - complete the sign-in there,
  echo  then run this file again. Do not paste a token into a chat
  echo  window; use the browser prompt or Git Credential Manager.
  echo.
  pause
  exit /b 1
)

echo.
echo  ================================================
echo   Done. Pushed to GitHub.
echo  ================================================
echo.
git log --oneline -1
echo.
pause
