@echo off
echo Starting Bifrost Backend...
start "Bifrost Backend" cmd /c "call .venv\Scripts\activate.bat && cd backend && python -m uvicorn main:app --host 127.0.0.1 --port 8000"

echo Starting Bifrost Frontend...
start "Bifrost Frontend" cmd /c "cd frontend && npm run dev"

echo Bifrost is running. Close the command windows to stop.
