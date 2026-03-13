# Start ChromaDB Server

Write-Host "Installing ChromaDB..." -ForegroundColor Green
pip install chromadb

Write-Host "`nStarting ChromaDB server on port 8000..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

chroma run --host localhost --port 8000 --path ./chroma_data
