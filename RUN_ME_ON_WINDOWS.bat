@echo off
title Cash-Out Advisor - Dev Server
echo.
echo Checking Node.js...
node -v >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
  echo Node.js not found.
  echo Please install Node.js LTS from https://nodejs.org/ and re-run this file.
  pause
  exit /b 1
)
echo Node.js found.
echo.
echo Installing dependencies...
call npm install
IF %ERRORLEVEL% NEQ 0 (
  echo npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)
echo.
echo Starting dev server...
call npm run dev
echo.
echo If your browser didn't open, navigate to http://localhost:3000
pause
