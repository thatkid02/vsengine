#!/bin/bash

# Video Sync Engine - Setup Test Script
# This script helps verify your setup is working correctly

echo "Video Sync Engine - Setup Test"
echo "=============================="
echo ""

# Check Node.js
echo "1. Checking Node.js installation..."
if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    echo "✓ Node.js installed: $NODE_VERSION"
    
    # Check version is 16+
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d. -f1 | sed 's/v//')
    if [ $MAJOR_VERSION -ge 16 ]; then
        echo "✓ Node.js version is 16 or higher"
    else
        echo "✗ Node.js version is too old. Please install Node.js 16 or higher"
        exit 1
    fi
else
    echo "✗ Node.js not found. Please install Node.js"
    exit 1
fi

echo ""

# Check npm
echo "2. Checking npm installation..."
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm -v)
    echo "✓ npm installed: $NPM_VERSION"
else
    echo "✗ npm not found. Please install npm"
    exit 1
fi

echo ""

# Check VLC
echo "3. Checking VLC installation..."
if [ -d "/Applications/VLC.app" ]; then
    echo "✓ VLC found at /Applications/VLC.app"
else
    echo "✗ VLC not found. Please install VLC from https://www.videolan.org/vlc/"
fi

echo ""

# Check server dependencies
echo "4. Checking server setup..."
cd server
if [ -d "node_modules" ]; then
    echo "✓ Server dependencies installed"
else
    echo "⚠ Server dependencies not installed. Run: npm install"
fi
cd ..

echo ""

# Check client dependencies
echo "5. Checking client setup..."
cd client
if [ -d "node_modules" ]; then
    echo "✓ Client dependencies installed"
else
    echo "⚠ Client dependencies not installed. Run: npm install"
fi
cd ..

echo ""

# Test server health endpoint
echo "6. Testing server connection..."
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "✓ Server is running and responding"
    HEALTH=$(curl -s http://localhost:3000/health)
    echo "  Server health: $HEALTH"
else
    echo "⚠ Server is not running. Start it with: cd server && npm start"
fi

echo ""
echo "=============================="
echo "Setup test complete!"
echo ""
echo "Next steps:"
echo "1. If any checks failed, fix them first"
echo "2. Start the server: cd server && npm start"
echo "3. Start the client: cd client && npm start"
echo "4. Follow the user manual to join a sync session"
echo ""