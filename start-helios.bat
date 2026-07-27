@echo off
:: Helios Startup Script for Windows
:: This script prepares and starts Helios in a lightweight, resource-efficient way

echo 🚀 Iniciando Helios en modo ligero...
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Error: Node.js no está instalado.
    echo Por favor, instale Node.js v18+ desde https://nodejs.org
    pause
    exit /b 1
)

:: Check if pnpm is installed
pnpm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  pnpm no está instalado. Instalando pnpm...
    npm install -g pnpm
    if %errorlevel% neq 0 (
        echo ❌ Error al instalar pnpm
        pause
        exit /b 1
    )
)

:: Install dependencies in ultra-lightweight mode (skip scripts and optional dependencies)
echo 📦 Instalando dependencias de forma ligera...
pnpm install --ignore-scripts --no-optional
if %errorlevel% neq 0 (
    echo ❌ Error al instalar dependencias
    pause
    exit /b 1
)

:: Check if .env.local exists
if not exist ".env.local" (
    echo ⚠️  Advertencia: .env.local no encontrado.
    echo Por favor, copie .env.local.example a .env.local y configure las variables requeridas.
    pause
    exit /b 1
)

:: Run the main application
echo 🚀 Iniciando Helios...
echo.
npx tsx src/main.ts

if %errorlevel% neq 0 (
    echo ❌ Error al iniciar Helios
    pause
    exit /b 1
)

echo.
echo ✅ Helios se ha iniciado correctamente.
pause