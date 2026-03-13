$response = Invoke-RestMethod -Uri "http://localhost:3000/sync" -Method Post
Write-Host "Sync Response:" -ForegroundColor Green
$response | ConvertTo-Json
