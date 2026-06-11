#!/bin/bash

echo "🤖 Setting up Mai Buddy..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.10+ first."
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
PYTHON_MINOR=$(python3 -c 'import sys; print(sys.version_info.minor)')
if [[ "$PYTHON_MINOR" -lt 10 ]]; then
    echo "❌ Python version $PYTHON_VERSION is too old. Please install Python 3.10+."
    exit 1
fi

echo "✅ Python $PYTHON_VERSION found"

# Create the virtual environment and install dependencies
echo "📦 Installing dependencies..."
cd python && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
INSTALL_STATUS=$?
cd ..

if [[ $INSTALL_STATUS -eq 0 ]]; then
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

echo ""
echo "🎉 Mai Buddy setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your API keys"
echo "2. Run './start.sh' to launch Mai Buddy"
echo "3. Configure your settings in the app"
echo ""
echo "For voice features, you'll need an ElevenLabs API key (set in-app)."
echo "For AI functionality, you'll need an Anthropic API key."
echo ""
echo "Happy chatting with Mai Buddy! 🤖✨"
