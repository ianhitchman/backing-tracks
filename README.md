# Backing Tracks Player

A mobile-first audio player for backing tracks with advanced channel mixing capabilities.

## Features

- 🎵 **Multi-format Support**: MP3, OGG, FLAC, WAV
- 🎚️ **Channel Mixing**: Independent L/R input mixing to dual output channels
- 📱 **Mobile-Optimized**: Large touch-friendly controls
- 💾 **State Persistence**: Remembers your settings and folder
- 🎨 **Dark Theme**: Easy on the eyes with customizable accent colors
- ⚡ **Web Audio API**: Professional-grade audio routing

## Getting Started

### Development

```bash
npm install
npm run dev
```

Open your browser to the URL shown in the terminal (usually `http://localhost:5173`).

### Build for Production

```bash
npm run build
```

The built files will be in the `dist` folder. Serve them with any static file server.

### Preview Production Build

```bash
npm run preview
```

## Usage

1. **Select a Folder**: Tap "No folder selected" or the "Change Folder" button
2. **Choose a Track**: Tap the song title to open the file selector
3. **Play**: Use the large play/pause button
4. **Seek**: Drag the seek bar to jump to different positions
5. **Mix Channels**: Adjust how much of the left/right input goes to each output channel
6. **Control Volume**: Set independent volumes for Channel 1 and Channel 2

## Channel Mixing Explained

The player splits your stereo audio file into left (L) and right (R) inputs, then lets you mix them to two output channels:

- **Channel 1** (Left Output): Mix any amount of L and R input
- **Channel 2** (Right Output): Mix any amount of L and R input

**Default Configuration:**

- Channel 1: 100% Left Input, 0% Right Input
- Channel 2: 0% Left Input, 100% Right Input

This is perfect for backing tracks where:

- One channel has the backing track
- The other channel has a guide/click track
- You can control the mix and volume independently

## Browser Compatibility

- **Desktop Chrome/Edge**: Full support including folder persistence
- **Desktop Safari**: Full support with folder re-selection
- **Mobile Chrome**: Works with folder re-selection each session
- **Mobile Safari**: Works with folder re-selection each session

## Future Enhancements

- Convert to Capacitor for native mobile app with full file system access
- Add icons for settings and controls
- Playlist management
- Tempo and pitch controls

## License

MIT
