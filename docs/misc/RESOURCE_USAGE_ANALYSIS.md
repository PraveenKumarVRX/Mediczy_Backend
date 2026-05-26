# Resource Usage Analysis - February 9, 2026

## Problem Summary
Frontend build failing due to resource constraints in development container.

## Current Resource State

### System Capacity
- **Configured**: t3.xlarge with 16GB RAM (claimed)
- **Actual Available**: 7.8GB RAM в dev container
- **Used**: 5.6GB (72% utilization)
- **Free**: 2.1GB available
- **Disk**: 20GB used / 32GB total (65%)

### Critical Resource Consumers

#### 1. VS Code TypeScript Servers - **1,979MB (25% RAM)**
```
PID 8782: TypeScript Server (full semantic)   1,765MB  34% CPU
PID 8781: TypeScript Server (partial semantic)  214MB   5% CPU
```
- Using `--max-old-space-size=3072` (3GB limit each!)
- Running full IntelliSense analysis on entire workspace
- **ROOT CAUSE of high memory + CPU usage**

#### 2. VS Code Extension Host - **1,351MB (17% RAM)**
```
PID 536: Extension Host  1,351MB  8% CPU
```
- Loading all installed extensions
- Including heavy extensions:
  - Azure App Modernization MCP (310MB)
  - Tailwind CSS IntelliSense (164MB)
  - MS SQL Tools (103MB combined)

#### 3. Other VS Code Processes - **~800MB**
- File watcher: 99MB
- PTY host: 46MB
- Language servers: ~300MB

**Total VS Code Overhead: 4.4GB (57% of available RAM)**

### PM2 Processes - Currently STOPPED
- Previously using ~200-500MB when running
- mediczy-server (2 cluster instances)
- sib-fastapi, worker, kafka, livekit, n8n

## Root Cause Analysis

### Why Only 7.8GB Available?
The development container has resource limits:
```bash
# Likely in .devcontainer/devcontainer.json or docker-compose
"runArgs": ["--memory=8g"]  # Limited to 8GB
```

The host t3.xlarge has 16GB, but container is restricted to ~8GB.

### Why TypeScript Servers Use So Much?
1. **Analyzing entire monorepo**: client/ + server/ + node_modules
2. **Memory limit set too high**: 3GB per ts-server instance
3. **Multiple instances running**: Full + Partial semantic modes
4. **Large dependency tree**: 1.1GB client node_modules + 1.1GB server node_modules

### Why Build Fails?
```
7.8GB total
- 4.4GB VS Code processes
- 0.5GB OS + system services
= 2.9GB available

Vite build needs: ~2-3GB minimum
Result: Insufficient memory → OOM kill → "Terminated"
```

## Solutions

### Immediate Actions (Before Build)

#### Option 1: Kill TypeScript Servers (Recommended - Frees ~2GB)
```bash
# Identify TS server PIDs
ps aux | grep tsserver.js | grep -v grep

# Kill them
pkill -f tsserver.js

# They will auto-restart when needed by VS Code
```

#### Option 2: Reduce TS Server Memory Limits
Create `.vscode/settings.json`:
```json
{
  "typescript.tsserver.maxTsServerMemory": 1024,
  "typescript.tsserver.experimental.enableProjectDiagnostics": false
}
```

#### Option 3: Disable Heavy Extensions Temporarily
```bash
# List extensions
code --list-extensions

# Disable temporarily (manual via VS Code UI):
# - Azure App Modernization
# - Tailwind CSS IntelliSense  
# - MSSQL Tools
```

#### Option 4: Build with PM2 Stopped (Already done)
```bash
pm2 stop all  # Frees 200-500MB
```

### Long-term Solutions

#### 1. Increase Dev Container Memory Allocation
Edit `.devcontainer/devcontainer.json`:
```json
{
  "runArgs": [
    "--memory=12g",
    "--memory-swap=14g"
  ]
}
```
Then rebuild container.

#### 2. Optimize TypeScript Configuration
`tsconfig.json`:
```json
{
  "compilerOptions": {
    "incremental": true,
    "skipLibCheck": true
  },
  "exclude": [
    "node_modules",
    "dist",
    "build",
    "**/node_modules"
  ]
}
```

#### 3. Split Workspaces
Instead of monorepo, open client/ and server/ as separate VS Code workspaces.

#### 4. Use .vscodeignore
```
node_modules/
dist/
build/
*.log
.git/
```

#### 5. Configure Git to Exclude node_modules
`.git/info/exclude`:
```
node_modules
dist
build
*.log
```

## Recommended Build Strategy

### Strategy A: Aggressive (Kill TS Servers)
```bash
#!/bin/bash
# Free ~2GB instantly
pkill -f tsserver.js
sleep 2

# Stop PM2
pm2 stop all

# Build with limited memory
cd /workspaces/Mediczy/client
NODE_OPTIONS='--max-old-space-size=2048' npm run build

# Restart PM2
pm2 start /workspaces/Mediczy/ecosystem.config.js
```

### Strategy B: Safe (Close VS Code Terminal)
1. Close VS Code window/tab
2. SSH directly to server
3. Run build from SSH session
4. Reopen VS Code after build

### Strategy C: Swap Memory (If available)
```bash
# Check swap
free -h

# Create swap if needed (requires root)
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

## Next Steps

1. ✅ **Immediate**: Kill TypeScript servers to free 2GB
2. ✅ **Verify**: Check available memory after cleanup
3. ⏳ **Build**: Run frontend build with 2GB node memory limit
4. ⏳ **Long-term**: Increase dev container memory to 12GB
5. ⏳ **Optimize**: Configure TS server limits permanently

## Commands to Execute Now

```bash
# 1. Kill TS servers (frees ~2GB)
pkill -f tsserver.js

# 2. Verify memory
free -h

# 3. Build frontend
cd /workspaces/Mediczy/client && \
NODE_OPTIONS='--max-old-space-size=2048' npm run build

# 4. Restart PM2 if needed
pm2 start /workspaces/Mediczy/ecosystem.config.js
```
