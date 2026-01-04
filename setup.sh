#!/bin/bash

echo "🤖 Setting up Mai Buddy..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2 | cut -d '.' -f 1)
if [[ "$NODE_VERSION" -lt 18 ]]; then
    echo "❌ Node.js version $NODE_VERSION is too old. Please install Node.js 18+."
    exit 1
fi

echo "✅ Node.js $(node -v) found"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [[ $? -eq 0 ]]; then
    echo "✅ Dependencies installed successfully"
else
    echo "❌ Failed to install dependencies"
    exit 1
fi

# Create .env file if it doesn't exist
if [[ ! -f .env ]]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "✅ Created .env file. Please edit it with your API keys."
else
    echo "✅ .env file already exists"
fi

# Create temp directory
mkdir -p temp

echo ""
echo "🎉 Mai Buddy setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your API keys"
echo "2. Run 'npm start' to launch Mai Buddy"
echo "3. Configure your settings in the app"
echo ""
echo "For voice features, you'll need an ElevenLabs API key."
echo "For AI functionality, you'll need an OpenAI API key."
echo ""
echo "Happy chatting with Mai Buddy! 🤖✨"
