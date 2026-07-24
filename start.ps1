# Digital Order System — Local Startup
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Digital Order System — Starting     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Cyan

# Start backend
Write-Host "`n[1/2] Starting Backend (FastAPI) on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
$backendJob = Start-Job -ScriptBlock {
  Set-Location -LiteralPath "$using:PSScriptRoot\backend"
  .\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
}

# Wait a moment for backend to start
Start-Sleep -Seconds 3

# Start frontend
Write-Host "[2/2] Starting Frontend (Next.js) on http://127.0.0.1:3000 ..." -ForegroundColor Yellow
$frontendJob = Start-Job -ScriptBlock {
  Set-Location -LiteralPath "$using:PSScriptRoot\frontend"
  .\node_modules\.bin\next.cmd dev
}

Write-Host "`n══════════════════════════════════════" -ForegroundColor Green
Write-Host "  Backend:  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "  Frontend: http://127.0.0.1:3000" -ForegroundColor Green
Write-Host "  API docs: http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host "  Staff:    http://127.0.0.1:3000/staff" -ForegroundColor Green
Write-Host "══════════════════════════════════════" -ForegroundColor Green
Write-Host "`nDefault staff login: admin / admin123" -ForegroundColor Cyan
Write-Host "`nPress Ctrl+C to stop both servers.`n" -ForegroundColor Cyan

# Keep script alive
try {
  while ($true) {
    Start-Sleep -Seconds 1
    # Check if jobs are still running
    $bj = Receive-Job -Job $backendJob -ErrorAction SilentlyContinue
    $fj = Receive-Job -Job $frontendJob -ErrorAction SilentlyContinue
    $bState = (Get-Job -Id $backendJob.Id).State
    $fState = (Get-Job -Id $frontendJob.Id).State
    if ($bState -eq "Failed" -or $fState -eq "Failed") {
      Write-Host "`nA server has stopped unexpectedly." -ForegroundColor Red
      break
    }
  }
} finally {
  Write-Host "`nStopping servers..." -ForegroundColor Yellow
  Stop-Job -Job $backendJob -ErrorAction SilentlyContinue
  Stop-Job -Job $frontendJob -ErrorAction SilentlyContinue
  Remove-Job -Job $backendJob -ErrorAction SilentlyContinue
  Remove-Job -Job $frontendJob -ErrorAction SilentlyContinue
  Write-Host "Both servers stopped." -ForegroundColor Green
}
