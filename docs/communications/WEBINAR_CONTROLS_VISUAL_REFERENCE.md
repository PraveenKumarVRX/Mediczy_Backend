# 🎮 Webinar Controls - Visual Reference

## Control Bar Preview

```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                 WEBINAR CONTROL BAR                          ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  🎤  │ │  🎥  │ │  🖥️  │ │  ⏺️  │ │  💬  │ │  ⋮   │ │  📞  │
│ MIC  │ │VIDEO │ │SCREEN│ │ REC  │ │ CHAT │ │ MORE │ │ END  │
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
  ALL     HOST     HOST     HOST     ALL      ALL      ALL
```

## Button States

### 1. Microphone 🎤

```
ENABLED (Gray)          DISABLED (Red)
┌──────────┐           ┌──────────┐
│    🎤    │           │    🔇    │
│   MIC    │           │   MUTE   │
└──────────┘           └──────────┘
```

### 2. Camera 🎥 (Host Only)

```
ENABLED (Gray)          DISABLED (Red)
┌──────────┐           ┌──────────┐
│    🎥    │           │    🚫    │
│  VIDEO   │           │  NO VID  │
└──────────┘           └──────────┘
```

### 3. Screen Share 🖥️ (Host Only)

```
IDLE (Gray)             SHARING (Blue)
┌──────────┐           ┌──────────┐
│    🖥️    │           │    🖥️    │
│  SHARE   │           │  STOP    │
└──────────┘           └──────────┘
```

### 4. Recording ⏺️ (Host Only)

```
IDLE (Gray)             RECORDING (Red + Pulse)
┌──────────┐           ┌──────────┐
│    ⚪    │           │ ⏺️ ••••• │
│  START   │           │   STOP   │
└──────────┘           └──────────┘
```

### 5. Chat 💬

```
CLOSED (Gray)           OPEN (Blue)
┌──────────┐           ┌──────────┐
│    💬    │           │    💬    │
│  CHAT    │           │  CLOSE   │
└──────────┘           └──────────┘
```

### 6. More Options ⋮

```
┌──────────────────────┐
│ ⚙️  Settings         │
├──────────────────────┤
│ 👥 Participants      │
├──────────────────────┤
│ 🔊 Audio Settings    │
├──────────────────────┤
│ 🎥 Video Settings    │
├──────────────────────┤
│ 📞 End Webinar       │
└──────────────────────┘
```

## Host View Layout

```
╔═══════════════════════════════════════════════════════════╗
║  Webinar Title            🟢 LIVE    👥 42    📞 End      ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    ║
║   │   Doctor    │  │ Attendee 1  │  │ Attendee 2  │    ║
║   │   (You)     │  │             │  │             │    ║
║   │   🎥        │  │   🔇        │  │   🎤        │    ║
║   └─────────────┘  └─────────────┘  └─────────────┘    ║
║                                                           ║
║   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    ║
║   │ Attendee 3  │  │ Attendee 4  │  │ Attendee 5  │    ║
║   │             │  │             │  │             │    ║
║   │   🎤        │  │   🔇        │  │   🎤        │    ║
║   └─────────────┘  └─────────────┘  └─────────────┘    ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║  🎤   🎥   🖥️   ⏺️••   💬   ⋮      📞                    ║
║ [ON] [ON] [ON] [REC] [OFF] [...] [END]                  ║
╚═══════════════════════════════════════════════════════════╝
```

## Attendee View Layout

```
╔═══════════════════════════════════════════════════════════╗
║  Webinar Title                      👥 42    📞 Leave     ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║              ┌───────────────────────────┐               ║
║              │                           │               ║
║              │      Doctor's Screen      │               ║
║              │         (Shared)          │               ║
║              │                           │               ║
║              │        [PRESENTING]       │               ║
║              │                           │               ║
║              └───────────────────────────┘               ║
║                                                           ║
║   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   ║
║   │ Doctor  │  │  You    │  │ Attendee│  │ Attendee│   ║
║   │  🎥     │  │  🔇     │  │  🎤     │  │  🔇     │   ║
║   └─────────┘  └─────────┘  └─────────┘  └─────────┘   ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║       🎤         💬         ⋮           📞                ║
║     [MUTE]     [CHAT]     [...]      [LEAVE]            ║
╚═══════════════════════════════════════════════════════════╝
```

## Control Behavior Matrix

| Control       | Default State | Click Action         | Visual Feedback          |
| ------------- | ------------- | -------------------- | ------------------------ |
| Microphone    | ON (gray)     | Toggle mute          | Gray → Red               |
| Camera (Host) | ON (gray)     | Toggle video         | Gray → Red               |
| Screen Share  | OFF (gray)    | Toggle sharing       | Gray → Blue              |
| Recording     | OFF (gray)    | Start/stop recording | Gray → Red (pulsing)     |
| Chat          | OFF (gray)    | Open/close chat      | Gray → Blue              |
| More          | N/A           | Open menu            | Dropdown appears         |
| Leave/End     | N/A           | Exit webinar         | Confirmation (host only) |

## Keyboard Shortcuts (Future Enhancement)

```
┌─────────────────────────────────────────┐
│  M     Toggle Microphone                │
│  V     Toggle Video (Host)              │
│  S     Toggle Screen Share (Host)       │
│  C     Toggle Chat                      │
│  R     Start/Stop Recording (Host)      │
│  ESC   Leave/End Webinar                │
│  ?     Show Keyboard Shortcuts          │
└─────────────────────────────────────────┘
```

## Notification System

```
┌─────────────────────────────────────┐
│  ✅ Recording Started                │
│  This webinar is now being recorded │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ✅ Recording Stopped                │
│  Recording has been saved           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ✅ Screen Sharing                   │
│  You are now sharing your screen    │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  ❌ Screen Share Error               │
│  Failed to toggle screen sharing    │
└─────────────────────────────────────┘
```

## Responsive Breakpoints

### Desktop (1920x1080)

- Full control bar with labels
- Grid layout: 3-4 columns
- Large video tiles

### Tablet (1024x768)

- Compact control bar (icons only)
- Grid layout: 2-3 columns
- Medium video tiles

### Mobile (375x667)

- Minimal controls (essential only)
- Grid layout: 1-2 columns
- Small video tiles
- Swipe gestures for chat

## Color Reference

```css
/* Button States */
--btn-default: #374151; /* Gray-700 */
--btn-active: #3b82f6; /* Blue-500 */
--btn-disabled: #ef4444; /* Red-500 */
--btn-recording: #dc2626; /* Red-600 */

/* Hover States */
--btn-hover-default: #4b5563; /* Gray-600 */
--btn-hover-active: #2563eb; /* Blue-600 */
--btn-hover-disabled: #dc2626; /* Red-600 */

/* Text Colors */
--text-primary: #ffffff; /* White */
--text-secondary: #d1d5db; /* Gray-300 */

/* Backgrounds */
--overlay-top: rgba(0, 0, 0, 0.8);
--overlay-bottom: rgba(0, 0, 0, 0.9);
```

## Animation Timing

```css
/* Transitions */
button {
  transition: all 0.2s ease-in-out;
}

/* Recording Pulse */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.recording {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Hover Scale */
button:hover {
  transform: scale(1.05);
}

button:active {
  transform: scale(0.95);
}
```

## Accessibility

```
┌─────────────────────────────────────────┐
│  ARIA Labels                            │
├─────────────────────────────────────────┤
│  • aria-label="Toggle microphone"      │
│  • aria-label="Toggle camera"          │
│  • aria-label="Share screen"           │
│  • aria-label="Start recording"        │
│  • aria-label="Open chat"              │
│  • aria-label="More options"           │
│  • aria-label="Leave webinar"          │
├─────────────────────────────────────────┤
│  Keyboard Navigation                    │
├─────────────────────────────────────────┤
│  • Tab: Navigate through controls      │
│  • Space/Enter: Activate button        │
│  • ESC: Close menu/modal               │
└─────────────────────────────────────────┘
```

## Testing Scenarios

### ✅ Host Controls

1. Start webinar → All controls visible
2. Toggle camera → Video stream starts/stops
3. Toggle mic → Audio stream starts/stops
4. Start screen share → Desktop picker appears
5. Start recording → Red pulsing indicator
6. Stop recording → Toast notification
7. Open chat → Chat panel slides in
8. Click more → Dropdown menu appears
9. End webinar → Confirmation dialog

### ✅ Attendee Controls

1. Join webinar → Limited controls visible
2. Toggle mic → Audio stream starts/stops
3. View host's camera → Video renders correctly
4. View screen share → Shared screen visible
5. Open chat → Can send messages
6. Leave webinar → Graceful disconnect

## Performance Considerations

```
┌────────────────────────────────────────┐
│  Video Quality Settings                │
├────────────────────────────────────────┤
│  Resolution: 1280x720 @ 30fps          │
│  Bitrate: Adaptive (500kbps - 2.5Mbps) │
│  Codec: VP8/H.264                      │
│  Audio: Opus @ 48kHz                   │
├────────────────────────────────────────┤
│  Optimization                          │
├────────────────────────────────────────┤
│  • Adaptive streaming enabled          │
│  • Dynacast enabled                    │
│  • Echo cancellation ON                │
│  • Noise suppression ON                │
│  • Auto gain control ON                │
└────────────────────────────────────────┘
```

---

**Visual Reference Complete! 🎨**
All controls documented with states, colors, and behavior.
