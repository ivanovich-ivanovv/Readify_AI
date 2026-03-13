Write-Host "Resetting ChromaDB collection..." -ForegroundColor Cyan
try {
    $reset = Invoke-RestMethod -Uri "http://localhost:3000/debug/reset-chroma" -Method Post
    Write-Host "ChromaDB reset successful" -ForegroundColor Green
    Start-Sleep -Seconds 1
} catch {
    Write-Host "ChromaDB reset failed" -ForegroundColor Red
}
Write-Host ""

Write-Host "Testing MongoDB connection..." -ForegroundColor Yellow
try {
    $mongo = Invoke-RestMethod -Uri "http://localhost:3000/debug/test-mongo"
    $mongo | ConvertTo-Json
} catch {
    Write-Host "MongoDB connection failed" -ForegroundColor Red
    $mongo = @{ status = "error" }
}
Write-Host ""

Write-Host "Testing ChromaDB connection..." -ForegroundColor Yellow
try {
    $chroma = Invoke-RestMethod -Uri "http://localhost:3000/debug/test-chroma"
    $chroma | ConvertTo-Json
} catch {
    Write-Host "ChromaDB connection failed" -ForegroundColor Red
    $chroma = @{ status = "error" }
}
Write-Host ""

Write-Host "Testing Gemini API..." -ForegroundColor Yellow
try {
    $gemini = Invoke-RestMethod -Uri "http://localhost:3000/debug/test-gemini"
    $gemini | ConvertTo-Json
} catch {
    Write-Host "Gemini API failed" -ForegroundColor Red
    $gemini = @{ status = "error" }
}
Write-Host ""

if ($mongo.status -eq "ok" -and $chroma.status -eq "ok" -and $gemini.status -eq "ok") {
    Write-Host "All services are working! Now testing sync..." -ForegroundColor Green
    Write-Host ""
    
    try {
        $sync = Invoke-RestMethod -Uri "http://localhost:3000/sync" -Method Post
        Write-Host "Sync successful!" -ForegroundColor Green
        $sync | ConvertTo-Json
    } catch {
        Write-Host "Sync failed with error:" -ForegroundColor Red
        Write-Host $_.Exception.Message
    }
} else {
    Write-Host "Some services are not working. Please check the errors above." -ForegroundColor Red
}
