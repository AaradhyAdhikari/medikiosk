@echo off
echo.
echo ========================================================
echo    OPEN FIREBASE CONSOLE TO DOWNLOAD SERVICE ACCOUNT
echo ========================================================
echo.
echo Opening Firebase Console in your browser...
echo.
echo Once it opens:
echo   1. Click "Generate new private key"
echo   2. Click "Generate key" to confirm
echo   3. Save the downloaded file as: firebase-service-account.json
echo   4. Move it to this project folder
echo.

start https://console.firebase.google.com/project/medikiosk-25458/settings/serviceaccounts/adminsdk

echo.
echo Browser opened! Follow the steps above.
echo.
echo After downloading, run: firebase-quickstart.bat
echo Or run: node check-firebase.js
echo.
pause
