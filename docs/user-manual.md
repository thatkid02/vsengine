# Video Sync Engine - User Manual

Welcome to Video Sync Engine! This manual will help you get started with synchronized video watching.

## Table of Contents
1. [Getting Started](#getting-started)
2. [First Time Setup](#first-time-setup)
3. [Joining a Watch Party](#joining-a-watch-party)
4. [Hosting a Watch Party](#hosting-a-watch-party)
5. [Video Controls](#video-controls)
6. [Troubleshooting](#troubleshooting)
7. [Tips for Best Experience](#tips-for-best-experience)

## Getting Started

### What You Need
1. **The Video Sync Engine app** (provided by your host)
2. **VLC Media Player** installed on your Mac
3. **The video file** you want to watch (same file as other participants)
4. **Channel ID** from your watch party host
5. **Stable internet connection**

### Understanding Roles
- **Controller**: The person who can play, pause, and seek the video for everyone
- **Viewer**: Participants who watch in sync but cannot control playback

The first person to join a channel automatically becomes the controller.

## First Time Setup

### 1. Install VLC
If you don't have VLC installed:
1. Visit [videolan.org](https://www.videolan.org/vlc/)
2. Download VLC for Mac
3. Install it like any other Mac application

### 2. Launch Video Sync Engine
1. Double-click the Video Sync Engine app
2. If you see a security warning, right-click the app and select "Open"
3. The app will open with two panels: Sync Settings (left) and Video Player (right)

### 3. Configure Your Name
1. In the "Your Name" field, enter your display name
2. This is how others will see you in the channel

## Joining a Watch Party

### Step 1: Connect to Server
1. The server URL should already be filled in (default: `ws://localhost:3000`)
2. If your host gave you a different server address, enter it here
3. Click the **Connect** button
4. You should see "Connected" in the top-right corner

### Step 2: Join the Channel
1. Enter the **Channel ID** provided by your host
2. Make sure your name is entered
3. Click **Join Channel**
4. You'll see the channel info panel appear showing:
   - Current channel name
   - Your role (Controller or Viewer)
   - List of connected users

### Step 3: Load Your Video
1. Click **Open Video File** in the Video Player section
2. Navigate to and select your video file
3. VLC will automatically open with your video
4. The app will show "Connected" under VLC Status

### Step 4: Wait for Sync
- If you're a **Viewer**: Your video will automatically sync with the controller
- If you're the **Controller**: You can now control playback for everyone

## Hosting a Watch Party

### Before the Party
1. Decide on a **Channel ID** (any unique name like "movie-night-123")
2. Make sure everyone has:
   - The exact same video file
   - The Video Sync Engine app
   - VLC installed

### Starting the Party
1. Launch the app and connect to the server
2. Enter your chosen Channel ID
3. Click **Join Channel** (you'll become the controller)
4. Share the Channel ID with your friends
5. Wait for everyone to join (you'll see them in the users list)
6. Load your video file
7. Start playing when everyone is ready!

## Video Controls

### For Controllers
- **Play Button**: Starts playback for everyone
- **Pause Button**: Pauses the video for everyone
- **Seek Bar**: Drag to jump to any point in the video
- **Volume Slider**: Controls your local volume only

### For Viewers
- Video controls are disabled while in sync mode
- You'll see "Syncing..." indicator
- **Volume Slider**: You can still control your local volume
- To leave sync mode, click **Leave Channel**

### Understanding Sync
- Commands from the controller are executed simultaneously
- Small differences (under 0.5 seconds) are automatically corrected
- Larger differences trigger automatic re-synchronization

## Troubleshooting

### "Cannot Connect to Server"
- Check your internet connection
- Verify the server URL is correct
- Ask your host if the server is running

### "VLC Not Connecting"
- Make sure VLC is installed
- Try clicking **Start VLC** button
- Close any other VLC windows and try again
- Restart the Video Sync Engine app

### "Video Out of Sync"
- Verify you have the exact same video file as others
- Check your internet connection stability
- The app will auto-correct within a few seconds
- If persistent, leave and rejoin the channel

### "Cannot Control Video"
- Only the controller can control playback
- Check your role in the Channel Info section
- If you need control, ask the current controller to leave

### "Others Can't Hear Audio"
- Audio is not shared - each person hears their own local audio
- Make sure your local volume is turned up
- Check the volume slider in the app
- Check your system volume

## Tips for Best Experience

### Before Starting
1. **Test Everything**: Do a quick test run before your scheduled watch party
2. **Same Files**: Ensure everyone has identical video files (same quality, same edit)
3. **Close Other Apps**: Close bandwidth-heavy applications for better performance

### During Watching
1. **Stable Connection**: Use ethernet instead of WiFi if possible
2. **Don't Manually Control VLC**: Let the app control VLC for you
3. **Communicate**: Use a separate voice/text chat for discussions

### For Controllers
1. **Pause for Breaks**: Use pause when people need breaks
2. **Announce Seeks**: Let viewers know before making big jumps
3. **Check Sync**: Occasionally ask if everyone is still in sync

### For Large Files
1. **Start Early**: Load large video files before others join
2. **Be Patient**: Initial sync might take a few seconds
3. **Local Storage**: Keep video files on fast local storage (not external drives)

## Keyboard Shortcuts
Currently, the app doesn't support keyboard shortcuts. Use the on-screen controls.

## Privacy & Security
- Video files are played locally - not uploaded or streamed
- Only sync timing data is transmitted
- No personal data is collected beyond your display name
- All connections are direct between your app and the sync server

## Getting Help
1. Check this manual first
2. Try the troubleshooting steps
3. Restart the app if issues persist
4. Contact your watch party host for server-related issues

## Frequently Asked Questions

**Q: Can I join from Windows or Linux?**
A: Currently, only macOS is supported.

**Q: How many people can join?**
A: Each channel supports up to 5 people.

**Q: Can I change who's the controller?**
A: The controller must leave for someone else to take control. The next person in line becomes controller automatically.

**Q: Do I need a fast internet connection?**
A: A stable connection is more important than speed. 5 Mbps is sufficient.

**Q: Can I watch different videos in the same channel?**
A: No, everyone must have the same video file for proper synchronization.

---

Enjoy your synchronized viewing experience!