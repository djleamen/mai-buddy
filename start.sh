#!/bin/bash

echo "🚀 Starting Mai Buddy..."

# Check if dependencies are installed
if [[ ! -d "python/.venv" ]]; then
    echo "📦 No virtual environment found — running setup first..."
    ./setup.sh || exit 1
fi

# Check if .env file exists
if [[ ! -f ".env" ]]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your API keys before running the app"
fi

# Start the application
echo "🤖 Starting Mai Buddy..."
cd python && . .venv/bin/activate && python main.py
