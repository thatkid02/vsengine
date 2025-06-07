#!/bin/bash

# Video Sync Engine - Quick Start Script
# This script starts both the server and client for development

echo "Starting Video Sync Engine..."
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    exit
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check if dependencies are installed
echo "Checking dependencies..."
if [ ! -d "server/node_modules" ]; then
    echo "Installing server dependencies..."
    cd server && npm install && cd ..
fi

if [ ! -d "client/node_modules" ]; then
    echo "Installing client dependencies..."
    cd client && npm install && cd ..
fi

echo ""
echo "Starting server..."
cd server
npm start &
SERVER_PID=$!
cd ..

# Wait for server to start
echo "Waiting for server to be ready..."
sleep 3

# Check if server is running
if ! curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo "Server failed to start!"
    exit 1
fi

echo "✓ Server is running on http://localhost:3000"
echo ""

echo "Starting client..."
cd client
npm start &
CLIENT_PID=$!
cd ..

echo ""
echo "✓ Video Sync Engine is running!"
echo ""
echo "Server: http://localhost:3000"
echo "Client: Opening Electron app..."
echo ""
echo "Press Ctrl+C to stop both server and client"
echo ""

# Wait for processes
wait