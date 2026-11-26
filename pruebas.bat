@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   CinePass - Pruebas automatizadas (Playwright)
echo ============================================
where node >nul 2>nul || (echo Falta Node.js. Instalalo desde https://nodejs.org y vuelve a abrir este archivo. & pause & exit /b 1)

if not exist node_modules (
  echo Instalando dependencias por primera vez...
  call npm install || (pause & exit /b 1)
  call npx playwright install chromium || (pause & exit /b 1)
)

echo.
echo Se abrira Chrome y veras cada prueba ejecutarse en pantalla.
set LENTO=350
call npx playwright test --headed --workers=1
echo.
echo Abriendo el reporte con resultados y capturas...
call npx playwright show-report pruebas/reporte
