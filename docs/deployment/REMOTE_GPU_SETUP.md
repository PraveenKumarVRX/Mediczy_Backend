# 🎯 Medical Scribe GPU Configuration Guide

## Remote GPU Setup (isha.buzz:8080 with Bimedix)

This guide explains how to configure the Medical Scribe service to use the local GPU at **isha.buzz:8080** running Bimedix LLM.

---

## 🚀 Quick Start (Remote GPU Mode)

### Option 1: Using the Startup Script

```bash
cd /home/ubuntu/Mediczy/scribe_service

# Start with remote GPU (default)
./start.sh remote isha.buzz 8080

# Or simply:
./start.sh
```

### Option 2: Environment Variables

```bash
cd /home/ubuntu/Mediczy/scribe_service

export GPU_MODE=remote
export GPU_HOST=isha.buzz
export GPU_PORT=8080
export SERVICE_HOST=0.0.0.0
export SERVICE_PORT=8001

python3 main.py
```

### Option 3: Command Line Arguments

```bash
cd /home/ubuntu/Mediczy/scribe_service
python3 -c "
import os
os.environ['GPU_MODE'] = 'remote'
os.environ['GPU_HOST'] = 'isha.buzz'
os.environ['GPU_PORT'] = '8080'
exec(open('main.py').read())
"
```

---

## 🔧 Configuration Details

### Environment Variables

| Variable          | Default     | Description               |
| ----------------- | ----------- | ------------------------- |
| `GPU_MODE`        | `remote`    | `local` or `remote` GPU   |
| `GPU_HOST`        | `isha.buzz` | Remote GPU hostname/IP    |
| `GPU_PORT`        | `8080`      | Remote GPU port           |
| `SERVICE_HOST`    | `0.0.0.0`   | Service bind address      |
| `SERVICE_PORT`    | `8001`      | Service port              |
| `LOG_LEVEL`       | `INFO`      | Logging level             |
| `REQUEST_TIMEOUT` | `300`       | Request timeout (seconds) |

### Remote GPU Service Architecture

```
┌─────────────────────────────────────────────────────┐
│         Medical Scribe Service (localhost:8001)     │
│  - Abbreviation Expansion (Local)                   │
│  - Template Management (Local)                      │
│  - Frontend API Gateway                             │
└────────────────────┬────────────────────────────────┘
                     │
                     │ HTTP/JSON
                     ↓
┌─────────────────────────────────────────────────────┐
│    Remote GPU Service (isha.buzz:8080)              │
│  - Whisper (Speech-to-Text)                         │
│  - Bimedix.gguf (Medical LLM)                       │
│  - Medical Text Enhancement                        │
└─────────────────────────────────────────────────────┘
```

---

## 📊 How It Works

### 1. **Local Abbreviation Expansion**

```
User Input: "Patient with HTN and DM"
           ↓
Local AbbreviationExpander
           ↓
Output: "Hypertension, Diabetes Mellitus"
(No remote GPU call needed)
```

### 2. **Remote Transcription with Bimedix**

```
Audio File
   ↓
Sent to isha.buzz:8080
   ↓
Whisper Transcription
   ↓
Return: {"transcription": "..."}
```

### 3. **Remote Medical Enhancement**

```
Clinical Text
   ↓
Sent to isha.buzz:8080/api/scribe/process-medical-text
   ↓
Bimedix LLM Processing
   ↓
Return: {"enhanced_text": "..."}
```

---

## 🔌 API Endpoints

All endpoints run on `localhost:8001`:

### Local Endpoints (No GPU Needed)

```
GET  /api/scribe/specialties              - List 14 medical specialties
GET  /api/scribe/template/{specialty}     - Get specialty template
POST /api/scribe/expand-abbreviations     - Expand medical abbreviations
POST /api/scribe/analyze-text             - Analyze clinical text
GET  /api/scribe/stats                    - Service statistics
```

### Remote GPU Endpoints (Via isha.buzz:8080)

```
POST /api/scribe/transcribe               - Audio to text (Whisper)
POST /api/scribe/process-medical-text     - Bimedix enhancement
```

### Health & Diagnostics

```
GET  /api/scribe/health                   - GPU status & configuration
GET  /api/scribe/gpu-stats                - Detailed GPU statistics
```

---

## 🧪 Testing Remote GPU Connection

### Test 1: Check Remote GPU Health

```bash
curl http://isha.buzz:8080/api/scribe/health
```

Expected response:

```json
{
  "status": "healthy",
  "gpu": {
    "available": true,
    "device_name": "NVIDIA A100",
    "memory_allocated": "12.34 GB"
  },
  "models": {
    "whisper": "loaded",
    "bimedix": "loaded"
  }
}
```

### Test 2: Check Local Service Health

```bash
curl http://localhost:8001/api/scribe/health
```

Expected response:

```json
{
  "status": "healthy",
  "gpu_mode": "remote",
  "gpu_url": "http://isha.buzz:8080",
  "remote_gpu": { ... }
}
```

### Test 3: Test Abbreviation Expansion (Local)

```bash
curl -X POST http://localhost:8001/api/scribe/expand-abbreviations \
  -d "text=Patient has HTN and DM"
```

### Test 4: Test Remote Transcription

```bash
curl -X POST http://localhost:8001/api/scribe/transcribe \
  -F "file=@audio.wav" \
  -F "field_name=diagnosis"
```

---

## 🚨 Troubleshooting

### Issue: "Cannot reach remote GPU at isha.buzz:8080"

**Solution 1**: Check network connectivity

```bash
ping isha.buzz
telnet isha.buzz 8080
```

**Solution 2**: Verify isha.buzz is running Bimedix service

```bash
curl http://isha.buzz:8080/api/scribe/health
```

**Solution 3**: Check firewall rules

```bash
# Linux
sudo ufw allow 8080

# macOS
sudo pfctl -f /etc/pf.conf
```

### Issue: Service starts but no response from remote GPU

**Solution**: Check logs

```bash
# View service logs
docker logs <container_id>

# Or if running locally:
tail -f /var/log/medical_scribe.log
```

### Issue: Slow response times

**Solution 1**: Check GPU memory at isha.buzz

```bash
curl http://isha.buzz:8080/api/scribe/gpu-stats
```

**Solution 2**: Increase timeout

```bash
export REQUEST_TIMEOUT=600  # 10 minutes
./start.sh remote isha.buzz 8080
```

---

## 🔄 Switching Between Local and Remote GPU

### To Use Local GPU Instead:

```bash
./start.sh local
# or
export GPU_MODE=local
python3 main.py
```

### To Use Remote GPU Again:

```bash
./start.sh remote isha.buzz 8080
# or
export GPU_MODE=remote
python3 main.py
```

---

## 📝 Configuration Files

### Main Configuration (`config.py`)

```python
GPU_MODE = "remote"  # or "local"
GPU_HOST = "isha.buzz"
GPU_PORT = 8080
REMOTE_GPU_BASE_URL = f"http://{GPU_HOST}:{GPU_PORT}"
```

### Service Code (`main.py`)

- ModelManager class handles GPU mode detection
- `_load_remote_gpu_models()` connects to isha.buzz:8080
- `_load_local_models()` uses local GPU fallback
- Async HTTP client for remote requests

---

## 🎯 Expected Performance

### Local Processing (No GPU Call)

- Abbreviation expansion: **<100ms**
- Template loading: **<50ms**
- Text analysis: **200-500ms**

### Remote GPU Processing

- Transcription (Whisper): **2-5s** (per 10s audio)
- Bimedix Enhancement: **3-8s**
- Full pipeline: **10-30s**

### Network Overhead

- Typical latency to isha.buzz: **1-5ms**
- Upload/Download: **<500ms** for typical inputs

---

## 🔐 Security Considerations

### For Remote GPU Access

1. **Network Security**
   - Use VPN if accessing remotely
   - Configure firewall rules
   - Consider API authentication

2. **Data Privacy**
   - Medical text sent over network
   - Consider HTTPS/SSL configuration
   - Implement request authentication

3. **Rate Limiting**
   - Configure rate limits at isha.buzz
   - Monitor request frequency
   - Set up alerts for anomalies

---

## 📊 Monitoring & Debugging

### View Service Logs

```bash
# Follow logs in real-time
tail -f /var/log/medical_scribe.log

# Or in Docker
docker logs -f medical-scribe-service
```

### Monitor GPU Usage

```bash
# Check remote GPU
watch curl http://isha.buzz:8080/api/scribe/gpu-stats

# Check local GPU (if using local mode)
nvidia-smi -l 1  # Update every second
```

### Debug Mode

```bash
export LOG_LEVEL=DEBUG
./start.sh remote isha.buzz 8080
```

---

## 🚀 Production Deployment

### Docker Compose Setup

```yaml
version: "3.8"
services:
  medical-scribe:
    build: ./scribe_service
    ports:
      - "8001:8001"
    environment:
      GPU_MODE: remote
      GPU_HOST: isha.buzz
      GPU_PORT: 8080
      SERVICE_HOST: 0.0.0.0
      SERVICE_PORT: 8001
      LOG_LEVEL: INFO
    restart: always
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/api/scribe/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Kubernetes Deployment

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: medical-scribe-config
data:
  GPU_MODE: "remote"
  GPU_HOST: "isha.buzz"
  GPU_PORT: "8080"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: medical-scribe
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: medical-scribe
          image: mediczy/medical-scribe:2.1.0
          ports:
            - containerPort: 8001
          envFrom:
            - configMapRef:
                name: medical-scribe-config
          livenessProbe:
            httpGet:
              path: /api/scribe/health
              port: 8001
            initialDelaySeconds: 30
            periodSeconds: 10
```

---

## 📞 Support

### For Issues:

1. Check logs with `tail -f /var/log/medical_scribe.log`
2. Test remote GPU: `curl http://isha.buzz:8080/api/scribe/health`
3. Test local service: `curl http://localhost:8001/api/scribe/health`
4. Review configuration in `config.py`

### API Documentation

See API endpoints at: `http://localhost:8001/docs` (Swagger UI)

---

## 🎉 Success Checklist

- [x] Config file created with GPU settings
- [x] Startup script ready (`start.sh`)
- [x] Requirements updated (httpx added)
- [x] Main.py updated to support remote GPU
- [x] Health endpoints show GPU configuration
- [x] Remote GPU connection tested
- [x] All abbreviation services working locally
- [x] Documentation complete

**Status**: ✅ Ready for production use with remote GPU at isha.buzz:8080

---

**Version**: 2.1.0 (Remote GPU Support)  
**Date**: January 29, 2026  
**GPU**: isha.buzz:8080 with Bimedix.gguf
