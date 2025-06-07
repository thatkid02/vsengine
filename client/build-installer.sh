#!/bin/bash

# Video Sync Engine - Build Installer Script
# This script builds distributable installer files for the client application

echo "Building Video Sync Engine Installer..."
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the client directory
if [ ! -f "package.json" ] || [ ! -f "main.js" ]; then
    echo -e "${RED}Error: Must run this script from the client directory${NC}"
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

# Create assets directory if it doesn't exist
mkdir -p assets

# Create placeholder icon files if they don't exist
if [ ! -f "assets/icon.icns" ]; then
    echo -e "${YELLOW}Creating placeholder icon.icns...${NC}"
    # Create a simple icon placeholder (in production, use proper icon)
    echo "Replace with actual icon.icns file" > assets/icon.icns
fi

if [ ! -f "assets/icon.ico" ]; then
    echo -e "${YELLOW}Creating placeholder icon.ico...${NC}"
    echo "Replace with actual icon.ico file" > assets/icon.ico
fi

if [ ! -f "assets/icon.png" ]; then
    echo -e "${YELLOW}Creating placeholder icon.png...${NC}"
    echo "Replace with actual 512x512 icon.png file" > assets/icon.png
fi

# Clean previous builds
echo -e "${YELLOW}Cleaning previous builds...${NC}"
rm -rf dist/

# Determine platform
PLATFORM=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="mac"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    PLATFORM="win"
else
    PLATFORM="linux"
fi

echo -e "${GREEN}Building for platform: $PLATFORM${NC}"
echo ""

# Build based on platform
case $PLATFORM in
    mac)
        echo -e "${YELLOW}Building macOS installer (.dmg)...${NC}"
        npm run dist
        ;;
    win)
        echo -e "${YELLOW}Building Windows installer (.exe)...${NC}"
        npm run build -- --win
        ;;
    linux)
        echo -e "${YELLOW}Building Linux installer (.AppImage)...${NC}"
        npm run build -- --linux
        ;;
    *)
        echo -e "${RED}Unknown platform: $PLATFORM${NC}"
        exit 1
        ;;
esac

echo ""

# Check if build was successful
if [ -d "dist" ]; then
    echo -e "${GREEN}Build completed successfully!${NC}"
    echo ""
    echo "Installer files created in ./dist/:"
    ls -la dist/
    echo ""
    
    # Platform-specific output
    case $PLATFORM in
        mac)
            DMG_FILE=$(find dist -name "*.dmg" | head -1)
            if [ -n "$DMG_FILE" ]; then
                echo -e "${GREEN}macOS Installer: $DMG_FILE${NC}"
                echo "Users can double-click this file to install the app"
            fi
            ;;
        win)
            EXE_FILE=$(find dist -name "*.exe" | head -1)
            if [ -n "$EXE_FILE" ]; then
                echo -e "${GREEN}Windows Installer: $EXE_FILE${NC}"
                echo "Users can run this installer on Windows"
            fi
            ;;
        linux)
            APPIMAGE_FILE=$(find dist -name "*.AppImage" | head -1)
            if [ -n "$APPIMAGE_FILE" ]; then
                echo -e "${GREEN}Linux Installer: $APPIMAGE_FILE${NC}"
                echo "Users can run: chmod +x $APPIMAGE_FILE && ./$APPIMAGE_FILE"
            fi
            ;;
    esac
else
    echo -e "${RED}Build failed! Check the error messages above.${NC}"
    exit 1
fi

echo ""
echo "Next steps:"
echo "1. Test the installer on a fresh system"
echo "2. Sign the app for distribution (macOS/Windows)"
echo "3. Upload to your distribution platform"
echo ""