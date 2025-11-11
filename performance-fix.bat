@echo off
echo ========================================
echo HMS Performance Optimization Script
echo ========================================

echo.
echo 1. Clearing Angular cache...
if exist "node_modules\.angular" (
    rmdir /s /q "node_modules\.angular"
    echo ✅ Angular cache cleared
) else (
    echo ⚠️ Angular cache not found
)

echo.
echo 2. Clearing npm cache...
npm cache clean --force
echo ✅ NPM cache cleared

echo.
echo 3. Clearing browser cache (Chrome)...
echo Please manually clear browser cache: Ctrl+Shift+Delete

echo.
echo 4. Building for production...
ng build --configuration=production
echo ✅ Production build completed

echo.
echo 5. Performance Tips:
echo - Close unnecessary browser tabs
echo - Update to latest Chrome/Firefox
echo - Disable unnecessary browser extensions
echo - Check available RAM (should be >4GB free)
echo - Use SSD instead of HDD if possible

echo.
echo ========================================
echo Performance optimization completed!
echo ========================================
pause
