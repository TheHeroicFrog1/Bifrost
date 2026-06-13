Write-Host "Installing Bifrost..."

# Check Python
if (-Not (Get-Command "python" -ErrorAction SilentlyContinue)) {
    Write-Host "Python is required but not installed. Please install Python 3.10+."
    exit 1
}

# Check Node.js
if (-Not (Get-Command "npm" -ErrorAction SilentlyContinue)) {
    Write-Host "Node.js and npm are required but not installed. Please install Node.js."
    exit 1
}

# Check Git
if (-Not (Get-Command "git" -ErrorAction SilentlyContinue)) {
    Write-Host "Git is required but not installed. Please install Git."
    exit 1
}

# Set up Python venv
Write-Host "Setting up Python virtual environment..."
python -m venv .venv
. .venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt

# Set up Frontend
Write-Host "Setting up frontend..."
cd frontend
npm install
npm run build
cd ..

# Create start.bat
Write-Host "Creating start.bat launcher..."
$batContent = @"
@echo off
echo Starting Bifrost Backend...
start "Bifrost Backend" cmd /c "call .venv\Scripts\activate.bat && cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo Starting Bifrost Frontend...
start "Bifrost Frontend" cmd /c "cd frontend && npm run dev"

echo Bifrost is running. Close the command windows to stop.
"@

Set-Content -Path "start.bat" -Value $batContent
Write-Host "Installation complete. Run start.bat to start Bifrost."
