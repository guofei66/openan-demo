@echo off
REM One-shot deploy for openan-debug -> root@47.236.98.226
REM Usage:  run-deploy.cmd [password]
REM   If password omitted, deploy.py will prompt interactively.

setlocal
set "PY=D:\OpenAN-Github\openan-master\backend\.venv\Scripts\python.exe"
set "PATH=D:\OpenAN-Github\openan-master\backend\.venv\Scripts;%PATH%"
cd /d "%~dp0.."

if not exist "%PY%\..\uv.exe" (
  echo [ERROR] uv not found in deploy venv. Install it first:
  echo   "%PY%" -m pip install uv
  exit /b 1
)
if not exist "%PY%" (
  echo [ERROR] python with paramiko not found: %PY%
  exit /b 1
)

echo [1/2] building frontend ...
pushd frontend
call npm run build
if errorlevel 1 (
  popd
  echo [ERROR] frontend build failed
  exit /b 1
)
popd

echo [2/2] deploying to 47.236.98.226 ...
if not "%~1"=="" set "DEPLOY_PASSWORD=%~1"
"%PY%" deploy\deploy.py
