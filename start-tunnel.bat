@echo off
cd /d "%~dp0"
echo ================================
echo  Tunnel mode - works across different networks
echo  (slower, needs stable internet; if it drops with
echo   'socket hang up', use start.bat LAN mode instead)
echo ================================
npx expo start --tunnel
pause
