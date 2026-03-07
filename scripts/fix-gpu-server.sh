#!/bin/bash
# ============================================================
# GPU Rack Server Recovery Script
# Run this ON the GPU rack server (isha.buzz) via SSH
# ============================================================

set -e
echo "🔧 GPU Server Recovery - $(date)"
echo "============================================"

# Step 1: Check cloudflared tunnel
echo ""
echo "📡 Step 1: Cloudflare Tunnel Status"
echo "------------------------------------"
if systemctl is-active --quiet cloudflared 2>/dev/null; then
    echo "✅ cloudflared is running"
    systemctl status cloudflared --no-pager | head -10
else
    echo "❌ cloudflared is NOT running"
    echo "   Restarting cloudflared..."
    sudo systemctl restart cloudflared
    sleep 3
    if systemctl is-active --quiet cloudflared 2>/dev/null; then
        echo "✅ cloudflared restarted successfully"
    else
        echo "⚠️  cloudflared failed to start. Check: journalctl -u cloudflared -n 20"
        # Try PM2 or manual cloudflared
        if command -v pm2 &>/dev/null; then
            echo "   Checking PM2 for cloudflared..."
            pm2 list 2>/dev/null | grep -i cloud || echo "   Not in PM2 either"
        fi
    fi
fi

# Step 2: Check BiMediX2 LLM service on port 8080
echo ""
echo "🤖 Step 2: BiMediX2 LLM Service (port 8080)"
echo "------------------------------------"
if ss -tlnp | grep -q ":8080"; then
    echo "✅ Port 8080 is listening"
    ss -tlnp | grep ":8080"
else
    echo "❌ Nothing listening on port 8080"
    echo "   Checking for BiMediX2 processes..."
    
    # Check various service managers
    if command -v pm2 &>/dev/null; then
        echo ""
        echo "   PM2 processes:"
        pm2 list 2>/dev/null || true
    fi
    
    if command -v docker &>/dev/null; then
        echo ""
        echo "   Docker containers:"
        docker ps -a 2>/dev/null | head -10 || true
    fi
    
    # Check systemd for anything bimedix/llm related
    echo ""
    echo "   Systemd services (bimedix/llm/ollama):"
    systemctl list-units --type=service --all 2>/dev/null | grep -iE "bimedix|llm|ollama|vllm|gpu|inference" || echo "   No matching services found"
fi

# Step 3: Check GPU status
echo ""
echo "🎮 Step 3: GPU Status"
echo "------------------------------------"
if command -v nvidia-smi &>/dev/null; then
    nvidia-smi --query-gpu=name,memory.used,memory.total,utilization.gpu --format=csv,noheader 2>/dev/null || echo "GPU query failed"
else
    echo "nvidia-smi not found"
fi

# Step 4: Test the LLM API locally
echo ""
echo "🧪 Step 4: Testing LLM API"
echo "------------------------------------"
echo "Testing /healthz..."
HEALTH=$(curl -s --connect-timeout 3 http://localhost:8080/healthz 2>&1) || true
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ /healthz: $HEALTH"
else
    echo "❌ /healthz failed: $HEALTH"
fi

echo ""
echo "Testing /v1/chat/completions..."
CHAT=$(curl -s --connect-timeout 10 http://localhost:8080/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
        "model": "bi-medix2",
        "messages": [{"role": "user", "content": "hello"}],
        "agent_type": "Clinical",
        "model_port": 8080,
        "max_tokens": 50
    }' 2>&1) || true

if echo "$CHAT" | grep -q "choices"; then
    echo "✅ LLM API responding!"
    echo "$CHAT" | head -3
else
    echo "❌ LLM API not responding: $CHAT"
fi

# Step 5: Test from outside via Cloudflare
echo ""
echo "🌐 Step 5: External Access Test"
echo "------------------------------------"
EXT=$(curl -s --connect-timeout 5 https://ai.isha.buzz/healthz 2>&1) || true
if echo "$EXT" | grep -q "ok"; then
    echo "✅ ai.isha.buzz is accessible externally!"
else
    echo "❌ ai.isha.buzz still failing: $EXT"
    echo "   If cloudflared is running but this fails, check Cloudflare Dashboard → Tunnels"
fi

echo ""
echo "============================================"
echo "📋 Summary: If services are down, restart them:"
echo "   sudo systemctl restart cloudflared"
echo "   # Then restart your BiMediX2 service (check pm2/docker/systemd)"
echo "============================================"
