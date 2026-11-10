@echo off
setlocal
if exist "%~dp0windows-x64.json" if exist "%~dp0install.ps1" goto localbundle
set "FW_INSTALL_SCRIPT=%TEMP%\frameweava-install-%RANDOM%-%RANDOM%.ps1"
curl.exe -fL "https://raw.githubusercontent.com/Dias-Dd/frameweava/dev/install.ps1" -o "%FW_INSTALL_SCRIPT%"
if errorlevel 1 exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%FW_INSTALL_SCRIPT%" %*
set "FW_INSTALL_EXIT=%ERRORLEVEL%"
del /q "%FW_INSTALL_SCRIPT%"
exit /b %FW_INSTALL_EXIT%

:localbundle
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -BundleDirectory "%~dp0." %*
exit /b %ERRORLEVEL%
