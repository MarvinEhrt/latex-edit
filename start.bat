@echo off
REM Startet den Schreibtisch. Doppelklick genuegt.
setlocal
cd /d "%~dp0"

set STARTER=
where py.exe >nul 2>&1 && set STARTER=py
if not defined STARTER where python.exe >nul 2>&1 && set STARTER=python

if not defined STARTER (
  echo.
  echo   Python 3 wurde nicht gefunden.
  echo   Bitte von python.org installieren und dabei
  echo   "Add Python to PATH" ankreuzen.
  echo.
  pause
  exit /b 1
)

%STARTER% schreibtisch.py %*
set RUECKGABE=%ERRORLEVEL%

if not "%RUECKGABE%"=="0" (
  echo.
  echo   Der Schreibtisch wurde mit Fehler %RUECKGABE% beendet.
  echo   Bitte die Meldungen oben mitschicken.
  echo.
  pause
)
endlocal
