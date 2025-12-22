# Video Quality Test Rooms

## Quick Test Rooms

### Room 1: General Test
- **Room Code**: `test-quality-2025`
- **Join URL**: http://mediqzy.com:3010/join/test-quality-2025

### Room 2: Patient Test
- **Room Code**: `patient-test-123`
- **Join URL**: http://mediqzy.com:3010/join/patient-test-123?name=TestPatient

### Room 3: Doctor Test
- **Room Code**: `doctor-test-456`
- **Join URL**: http://mediqzy.com:3010/join/doctor-test-456?name=DrTest

### Room 4: Multi-User Test
- **Room Code**: `multi-user-789`
- **Join URL**: http://mediqzy.com:3010/join/multi-user-789

## How to Test

### Option 1: Direct URL (Recommended)
Click any of the URLs above or paste them in your browser.

### Option 2: Via Patient Portal
1. Go to: http://mediqzy.com/video-consultation
2. Enter one of the room codes in the "Quick Join" section
3. Click "Join Meeting"

### Option 3: Via Command Line
```bash
# Open in default browser
xdg-open "http://mediqzy.com/video/join/test-quality-2025?name=YourName"
```

## Test Checklist

### Video Quality Tests
- [ ] **Video clarity** - Is the video clear and sharp?
- [ ] **Frame rate** - Is the video smooth (30 fps)?
- [ ] **Resolution** - Check if HD quality is maintained
- [ ] **Lighting** - Test in different lighting conditions
- [ ] **Camera switching** - Test front/back camera on mobile

### Audio Quality Tests
- [ ] **Microphone clarity** - Can you hear clearly?
- [ ] **Echo cancellation** - No echo or feedback?
- [ ] **Noise suppression** - Background noise filtered?
- [ ] **Volume levels** - Audio at good levels?

### Connection Tests
- [ ] **Latency** - Low delay in video/audio?
- [ ] **Stability** - Connection remains stable?
- [ ] **Reconnection** - Auto-reconnect on disconnect?
- [ ] **Bandwidth** - Works on slower connections?

### Feature Tests
- [ ] **Screen sharing** - Can share screen?
- [ ] **Chat messaging** - Text chat working?
- [ ] **Mute/Unmute** - Controls working?
- [ ] **Camera on/off** - Toggle working?
- [ ] **Full screen** - Expand to full screen?

## Multi-User Testing

### Test with 2 Users
1. Open URL in **Browser 1** (e.g., Chrome):
   ```
   http://mediqzy.com:3010/join/test-quality-2025?name=User1
   ```

2. Open URL in **Browser 2** (e.g., Firefox or Incognito):
   ```
   http://mediqzy.com:3010/join/test-quality-2025?name=User2
   ```

3. Both users should see each other's video

### Test with Mobile + Desktop
1. Desktop: Use any room URL above
2. Mobile: Scan QR code or enter room code manually
3. Test video/audio quality across devices

## Performance Monitoring

### In-Browser DevTools
1. Open browser DevTools (F12)
2. Go to Network tab
3. Monitor:
   - WebRTC connections
   - Bandwidth usage
   - Packet loss
   - Latency

### MiroTalk Stats
During the call, click on settings/stats to view:
- Video resolution
- Frame rate
- Bitrate
- Packet loss
- Jitter
- Round-trip time (RTT)

## Troubleshooting

### Poor Video Quality
- Check internet speed (need at least 2 Mbps)
- Close other bandwidth-heavy apps
- Move closer to WiFi router
- Reduce video resolution in settings

### Audio Issues
- Check microphone permissions in browser
- Ensure correct audio input selected
- Test with headphones to reduce echo
- Check volume levels

### Connection Drops
- Verify stable internet connection
- Check firewall settings
- Try different browser
- Restart router if needed

## Quick Test Command

Run this to verify MiroTalk is working:

```bash
# Test MiroTalk endpoint
curl -I http://mediqzy.com:3010/join/test-quality-2025

# Should return: HTTP/1.1 200 OK
```

## Browser Recommendations

**Best Performance**:
1. Chrome 74+ (recommended)
2. Edge 79+

**Good Performance**:
3. Firefox 66+
4. Safari 12+ (Mac only)

**Not Recommended**:
- Internet Explorer
- Outdated browsers

## Sample Room Codes for Quick Access

Just use these codes in the "Quick Join" section:

- `quick-test`
- `video-demo`
- `quality-check`
- `hd-test`
- `mobile-test`
- `screen-share-test`

All codes are case-insensitive and work instantly!

---

**Current Date**: December 20, 2025  
**MiroTalk Version**: Latest SFU  
**Server**: http://mediqzy.com:3010
