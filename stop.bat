@echo off
echo Stopping Expo dev server...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8081"') do (
    taskkill /F /PID %%a 2>nul
)
taskkill /F /IM node.exe 2>nul
echo Done.
pause
