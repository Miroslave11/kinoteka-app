@echo off
rem Spustí Kinotéku přímo ze složky projektu (bez instalace).
rem Při prvním spuštění doinstaluje závislosti a stáhne mpv a ffmpeg.
chcp 65001 >nul
title Kinotéka
cd /d "%~dp0"

if not exist node_modules (
  echo Instaluji závislosti, chvíli to potrvá...
  call npm.cmd install || goto :error
)
if not exist resources\bin\mpv\mpv.exe goto :fetch
if not exist resources\bin\ffmpeg\ffmpeg.exe goto :fetch
goto :run

:fetch
echo Stahuji přehrávač mpv a ffmpeg...
call npm.cmd run fetch:bin || goto :error

:run
echo Spouštím Kinotéku. Toto okno nech otevřené – jeho zavřením se aplikace ukončí.
call npm.cmd run dev
exit /b 0

:error
echo.
echo Spuštění se nepovedlo, podrobnosti jsou ve výpisu výše.
pause
exit /b 1
