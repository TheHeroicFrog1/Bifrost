#!/bin/bash
echo "Installing Bifrost..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Python 3 is required but not installed. Please install Python 3.10+."
    exit 1
fi

# Check Node.js
if ! command -v npm &> /dev/null; then
    echo "Node.js and npm are required but not installed. Please install Node.js."
    exit 1
fi

# Check Git
if ! command -v git &> /dev/null; then
    echo "Git is required but not installed. Please install Git."
    exit 1
fi

# Set up Python venv
echo "Setting up Python virtual environment..."
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# Set up Frontend
echo "Setting up frontend..."
cd frontend
npm install
npm run build
cd ..

# Create start.sh
echo "Creating start.sh launcher..."
cat << 'EOF' > start.sh
#!/bin/bash
echo "Starting Bifrost Backend..."
source .venv/bin/activate
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

echo "Starting Bifrost Frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

function cleanup {
    echo "Shutting down Bifrost..."
    kill $BACKEND_PID
    kill $FRONTEND_PID
    exit
}

trap cleanup EXIT
wait
EOF

chmod +x start.sh
echo "Installation complete. Run ./start.sh to start Bifrost."
