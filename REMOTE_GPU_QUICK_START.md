# 🎯 Remote GPU Quick Start - isha.buzz:8080

## ⚡ One-Liner Startup

```bash
cd /home/ubuntu/Mediczy/scribe_service && ./start.sh remote isha.buzz 8080
```

Service will start on `http://localhost:8001`

---

## 📋 Quick Facts

| Component | Details |
|-----------|---------|
| **Service** | localhost:8001 |
| **Remote GPU** | isha.buzz:8080 |
| **LLM** | Bimedix.gguf |
| **STT** | Whisper |
| **Local Services** | Abbreviations, Templates, ICD-10 |
| **Config** | scribe_service/config.py |
| **Startup** | scribe_service/start.sh |

---

## 🔧 Configuration Methods

### Method 1: Startup Script (Recommended)
```bash
./start.sh                              # Default: remote isha.buzz 8080
./start.sh local                        # Local GPU mode
./start.sh remote isha.buzz 8080       # Explicit remote
```

### Method 2: Environment Variables
```bash
export GPU_MODE=remote
export GPU_HOST=isha.buzz
export GPU_PORT=8080
python3 main.py
```

### Method 3: .env File
```bash
# Create .env file
cat > .env << EOF
GPU_MODE=remote
GPU_HOST=isha.buzz
GPU_PORT=8080
SERVICE_HOST=0.0.0.0
SERVICE_PORT=8001
EOF

# Load and start
set -a
source .env
set +a
python3 main.py
```

---

## 🧪 Quick Tests

### 1. Check Remote GPU
```bash
curl http://isha.buzz:8080/api/scribe/health
```

### 2. Check Local Service
```bash
curl http://localhost:8001/api/scribe/health
```

### 3. Test Abbreviations (Local, <100ms)
```bash
curl -X POST http://localhost:8001/api/scribe/expand-abbreviations \
  -d "text=Patient with HTN and DM on treatment"
```

### 4. Test Specialties (Local, <50ms)
```bash
curl http://localhost:8001/api/scribe/specialties
```

### 5. Test Remote Bimedix (10-30s)
```bash
curl -X POST http://localhost:8001/api/scribe/process-medical-text \
  -d "text=62yo male with chest pain and ST elevation on ECG. HR 110 BP 160/95"
```

---

## 📊 Architecture

```
┌─────────────────────────────────────────┐
│ Frontend (React)                        │
│ Hospital Discharge Summary              │
└────────────────┬────────────────────────┘
                 │
                 ↓ HTTP/JSON
┌─────────────────────────────────────────┐
│ Service: localhost:8001                 │
│  • Abbreviation Expansion (Local)       │
│  • Template Management (Local)          │
│  • ICD-10 Suggestions (Local)           │
│  • API Gateway                          │
└────────────────┬────────────────────────┘
                 │
         ┌───────┴───────┐
         ↓               ↓
    Local Services   Remote GPU
    (Instant)        (isha.buzz:8080)
    • Abbrevs           • Whisper (STT)
    • Templates         • Bimedix (LLM)
    • ICD-10            • Medical Processing
```

---

## 🚀 Production Deployment

### Docker
```bash
# Build and run
cd /home/ubuntu/Mediczy/scribe_service
docker build -t medical-scribe:2.1 .
docker run -e GPU_MODE=remote -e GPU_HOST=isha.buzz -e GPU_PORT=8080 \
  -p 8001:8001 medical-scribe:2.1
```

### Systemd Service
```ini
[Unit]
Description=Medical Scribe Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/Mediczy/scribe_service
ExecStart=/home/ubuntu/Mediczy/scribe_service/start.sh remote isha.buzz 8080
Restart=on-failure
RestartSec=10
Environment="GPU_MODE=remote"
Environment="GPU_HOST=isha.buzz"
Environment="GPU_PORT=8080"

[Install]
WantedBy=multi-user.target
```

### PM2
```bash
pm2 start /home/ubuntu/Mediczy/scribe_service/start.sh \
  --name medical-scribe \
  -- remote isha.buzz 8080
pm2 save
pm2 startup
```

---

## 🔌 API Endpoints

### Abbreviation (Local - Fast)
```
POST /api/scribe/expand-abbreviations
Input:  { "text": "HTN patient" }
Output: { "expanded_text": "Hypertension patient", ... }
Time:   <100ms
```

### Templates (Local - Fast)
```
GET /api/scribe/specialties
GET /api/scribe/template/{specialty}
Time: <50ms
```

### Transcription (Remote - GPU)
```
POST /api/scribe/transcribe
Input:  audio file
Output: { "transcription": "..." }
Time:   2-5s per 10s audio
```

### Medical Enhancement (Remote - GPU)
```
POST /api/scribe/process-medical-text
Input:  { "text": "clinical note" }
Output: { "enhanced_text": "..." }
Time:   3-8s
```

### Health Check
```
GET /api/scribe/health
Shows: GPU mode, remote/local status, memory usage
```

---

## 📈 Performance Expectations

| Operation | Time | Mode |
|-----------|------|------|
| Abbreviation expansion | <100ms | Local |
| Template loading | <50ms | Local |
| Specialty list | <50ms | Local |
| Text analysis | 200-500ms | Local |
| Whisper transcription | 2-5s | Remote GPU |
| Bimedix enhancement | 3-8s | Remote GPU |
| **Full pipeline** | **10-30s** | **Hybrid** |

---

## ⚠️ Troubleshooting

### "Cannot reach remote GPU at isha.buzz:8080"
```bash
# 1. Check connectivity
ping isha.buzz
telnet isha.buzz 8080

# 2. Test remote health
curl http://isha.buzz:8080/api/scribe/health

# 3. Check firewall
sudo ufw allow 8080
```

### "Service starts but times out on transcription"
```bash
# 1. Check if remote GPU is responsive
curl -X GET http://isha.buzz:8080/api/scribe/gpu-stats

# 2. Increase timeout
export REQUEST_TIMEOUT=600
./start.sh remote isha.buzz 8080

# 3. Check remote GPU logs
ssh isha.buzz "docker logs medical-scribe-gpu"
```

### "Local services working but transcription fails"
```bash
# Remote GPU is down - local abbreviation/templates still work
# Service gracefully falls back to local processing

# Abbreviations still expand:
curl -X POST http://localhost:8001/api/scribe/expand-abbreviations

# Only transcription/Bimedix will fail until GPU is back
```

---

## 🔄 Switching Modes

### Switch to Local GPU
```bash
./start.sh local
# Service uses local GPU for Whisper + Bimedix
# Slower but independent
```

### Switch to Remote GPU
```bash
./start.sh remote isha.buzz 8080
# Service uses remote GPU for Whisper + Bimedix
# Faster if GPU is powerful, network dependent
```

---

## 📁 Key Files

```
scribe_service/
├── config.py              ← GPU configuration (local/remote)
├── main.py                ← FastAPI service with remote GPU support
├── start.sh              ← Startup script (executable)
├── requirements.txt      ← Dependencies (includes httpx)
├── services/
│   ├── abbreviation_service.py
│   └── template_service.py
└── medical_db.json       ← Medical terminology database
```

---

## 🎯 Next Steps

1. **Verify connectivity**: `curl http://isha.buzz:8080/api/scribe/health`
2. **Start service**: `cd scribe_service && ./start.sh remote isha.buzz 8080`
3. **Test abbreviations**: `curl -X POST http://localhost:8001/api/scribe/expand-abbreviations ...`
4. **Test transcription**: Upload audio file to test remote GPU
5. **Monitor logs**: `docker logs -f medical-scribe` or `tail -f service.log`

---

## 📞 Support

- **Config**: See `REMOTE_GPU_SETUP.md` for detailed guide
- **API Docs**: `http://localhost:8001/docs` (Swagger UI)
- **Health**: `http://localhost:8001/api/scribe/health`
- **Stats**: `http://localhost:8001/api/scribe/stats`

---

**Status**: ✅ Ready for Production  
**Version**: 2.1.0  
**GPU**: isha.buzz:8080 with Bimedix.gguf
