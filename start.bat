@echo off
REM Startet den Schreibtisch. Doppelklick genuegt.
cd /d "%~dp0"
where py >nul 2>&1 && (py schreibtisch.py %* & goto :ende)
where python >nul 2>&1 && (python schreibtisch.py %* & goto :ende)
echo.
echo   Python 3 wurde nicht gefunden.
echo   Bitte von python.org installieren und dabei
echo   "Add Python to PATH" ankreuzen.
echo.
pause
:ende
