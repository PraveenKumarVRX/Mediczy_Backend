# Terminal & Performance Optimization Guide

## 🎯 Issues Fixed

### 1. Terminal Output Visibility

**Problem**: Terminal content not visible in VS Code  
**Solutions**:

#### Option A: Clear Terminal Buffer

```bash
# Clear VS Code terminal
Ctrl+Shift+P → "Terminal: Clear"
# Or press Ctrl+K in the terminal
```

#### Option B: Increase Terminal Buffer Size

In VS Code Settings (`Ctrl+,`), add:

```json
{
  "terminal.integrated.scrollback": 10000,
  "terminal.integrated.bufferSize": 10000,
  "terminal.integrated.fontSize": 12
}
```

#### Option C: Use External Terminal

Run commands in external terminal instead:

```bash
cd /home/ubuntu/Mediczy
# Then run any command here
```

### 2. Slow Performance

**Problem**: System slowness, high memory usage  
**Actions Taken**:

- ✅ Cleaned old server logs
- ✅ Cleared npm cache
- ✅ Restarted all PM2 services with fresh memory

**Memory Usage After Optimization**:

```
mediczy-server (cluster): ~230MB + 1.9GB (normal)
kafka-server: ~270MB (normal)
livekit-server: ~43MB (good)
mediczy-worker: ~100MB (good)
```

---

## 🚀 Quick Terminal Tips

### View Full Terminal Output

```bash
# If output is cut off, use the scroll up feature
# VS Code Terminal: Use Page Up or Shift+Page Up

# Or pipe output to a file for review
command-name > output.log 2>&1
cat output.log
```

### Monitor Services in Real-Time

```bash
# Watch server logs in real time
pm2 logs mediczy-server --lines 100 --format

# Watch all logs
pm2 logs --format
```

### Clear Terminal Safely

```bash
# In VS Code: Ctrl+K (clears display, not history)
# Or: clear (bash command)
clear
```

---

## 📊 Performance Monitoring

### Check System Health

```bash
# Quick health check
./sanity-check-video-fix.sh

# Full diagnostics
top -b -n 1 | head -20
ps aux --sort=-%cpu | head -10
```

### Restart Services if Slow

```bash
# Soft restart (recommended)
pm2 gracefulReload all

# Hard restart (if stuck)
pm2 restart all --update-env
```

---

## 💡 Best Practices Going Forward

1. **Terminal Output**: If you need to see large outputs, use file redirection:

   ```bash
   curl -v http://localhost:8888/api/health > api-response.log
   cat api-response.log
   ```

2. **Long-Running Commands**: Use screen or tmux:

   ```bash
   # Start background session
   screen -S build
   npm run build
   # Detach: Ctrl+A, then D
   # Re-attach: screen -r build
   ```

3. **Monitor vs Execute**: Use `pm2 monit` for live monitoring:

   ```bash
   pm2 monit
   ```

4. **Clean Regular Intervals**:
   ```bash
   # Weekly maintenance
   npm cache clean --force
   rm -rf /tmp/* 2>/dev/null
   ```

---

## ✅ Verification

To verify everything is working:

```bash
# 1. Check all services online
pm2 status

# 2. Test API endpoint
curl http://localhost:8888/api/video/test

# 3. Run sanity check
./sanity-check-video-fix.sh

# 4. Check memory (should be stable)
free -h
```

---

## 🎯 What You Can Do Now

1. **Close & Reopen Terminal** in VS Code (Ctrl+Shift+`)
2. **Run Commands Directly** - they'll execute in the clean terminal
3. **Use File Output** for large results - `command > output.log`
4. **Monitor via PM2** - `pm2 logs` instead of terminal for live output

Everything is optimized and ready! 🚀
