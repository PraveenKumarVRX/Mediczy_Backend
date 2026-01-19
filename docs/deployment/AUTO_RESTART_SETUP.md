# Mediczy Auto-Restart Development Setup

## 🚀 Auto-Restart Configuration Complete

Both the Node.js server and React client have been configured for automatic restart/reload on file changes.

### 📁 Files Modified/Created:

#### Server (Backend)
- **`/server/package.json`** - Added `dev` and `dev:watch` scripts with nodemon
- **`/server/nodemon.json`** - Nodemon configuration for auto-restart
  - Watches all `.js`, `.json`, `.env` files
  - Ignores `node_modules`, `logs`, `.git`
  - 1-second delay before restart
  - Verbose logging enabled

#### Client (Frontend)  
- **`/client/package.json`** - Updated dev scripts with better Vite options
- **`/client/vite.config.ts`** - Enhanced HMR and file watching
  - Faster change detection (100ms interval)
  - Better hot module replacement
  - Separate HMR port (9444)

#### Development Scripts
- **`/dev-start.sh`** - Interactive development environment
- **`/start-dev.sh`** - Simple background service starter
- **`/package.json`** - Root-level scripts for running both services

### 🏃‍♂️ Usage Options:

#### Option 1: Interactive Mode (Recommended)
```bash
cd /root/Mediczy
./dev-start.sh
```
- Shows real-time logs from both services
- Press `Ctrl+C` to stop all services cleanly
- Color-coded output and status messages

#### Option 2: Background Mode
```bash
cd /root/Mediczy
./start-dev.sh
```
- Runs both services in background
- Logs saved to `/tmp/mediczy-*.log`
- Use `pkill -f 'nodemon|vite'` to stop

#### Option 3: Individual Services
```bash
# Server only (auto-restart)
cd /root/Mediczy/server && npm run dev

# Client only (hot reload)
cd /root/Mediczy/client && npm run dev:watch

# Both with concurrently
cd /root/Mediczy && npm run dev
```

### 🔗 Service URLs:
- **Frontend**: http://localhost:9443
- **Backend API**: http://localhost:8000  
- **Admin Dashboard**: http://localhost:9443/admin/email

### ⚙️ Auto-Restart Features:

#### Server (Nodemon)
- ✅ Restarts on `.js` file changes
- ✅ Restarts on `.json` config changes
- ✅ Restarts on `.env` environment changes
- ✅ Ignores `node_modules` and logs
- ✅ 1-second restart delay to avoid rapid restarts
- ✅ Type `rs` in terminal to manually restart

#### Client (Vite HMR)
- ✅ Hot reload on React component changes
- ✅ Fast refresh preserves component state
- ✅ CSS updates without full page reload
- ✅ TypeScript compilation on save
- ✅ Error overlay for debugging
- ✅ 100ms change detection for instant updates

### 🛑 Stopping Services:
- **Interactive mode**: Press `Ctrl+C`
- **Background mode**: `pkill -f 'nodemon|vite'`
- **Individual**: Kill specific terminal or process

### 📋 Monitoring:
```bash
# View server logs
tail -f /tmp/mediczy-server.log

# View client logs  
tail -f /tmp/mediczy-client.log

# Check if services are running
ps aux | grep -E "(nodemon|vite)"

# Check port usage
sudo lsof -i :8000,9443
```

## ✨ Benefits:
1. **Automatic Server Restart** - No need to manually restart after code changes
2. **Hot Module Replacement** - React components update instantly without losing state  
3. **Fast Development** - Changes visible within seconds
4. **Error Recovery** - Services auto-restart if they crash
5. **Clean Shutdown** - Proper cleanup when stopping services
6. **Multiple Start Options** - Choose interactive or background mode
7. **Production Ready** - Same nodemon/vite setup used in production deployments

The development environment is now optimized for rapid iteration and testing! 🎉