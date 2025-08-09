#!/bin/bash

echo "🚀 Starting Mai Buddy with MCP..."

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your API keys before running the app"
fi

# Test MCP setup (optional)
if [ "$1" = "--test-mcp" ]; then
    echo "🧪 Testing MCP setup..."
    node test-mcp.js
    echo ""
fi

# Start the application
echo "🤖 Starting Mai Buddy..."
npm start
