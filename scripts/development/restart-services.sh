#!/bin/bash

# Restart Mediczy Services after Domain Configuration
echo "🔄 Restarting Mediczy Services for Domain Configuration"
echo "====================================================="

# Restart Nginx with new domain configuration
echo "🔄 Restarting Nginx..."
sudo systemctl restart nginx
sudo systemctl status nginx --no-pager -l

# Restart PM2 backend processes
echo "🔄 Restarting PM2 backend..."
cd /root/Mediczy
pm2 restart all

# Check service status
echo "📊 Service Status:"
echo "==================="

# Check Nginx
if systemctl is-active --quiet nginx; then
    echo "✅ Nginx: Running"
else
    echo "❌ Nginx: Not Running"
fi

# Check PM2
PM2_STATUS=$(pm2 list | grep "online" | wc -l)
echo "✅ PM2 Processes: $PM2_STATUS online"

# Check port availability
echo ""
echo "🔍 Port Status:"
echo "==============="
echo "Port 80:   $(ss -tlnp | grep :80 | wc -l) listeners"
echo "Port 443:  $(ss -tlnp | grep :443 | wc -l) listeners"
echo "Port 8000: $(ss -tlnp | grep :8000 | wc -l) listeners (Node.js)"
echo "Port 8001: $(ss -tlnp | grep :8001 | wc -l) listeners (SIB FastAPI)"

# Test local access
echo ""
echo "🧪 Testing Local Access:"
echo "========================="

# Test HTTPS
if curl -k -s -o /dev/null -w "%{http_code}" https://192.168.1.72 | grep -q "200"; then
    echo "✅ HTTPS Local Access: Working"
else
    echo "❌ HTTPS Local Access: Failed"
fi

# Test API
if curl -k -s -o /dev/null -w "%{http_code}" https://192.168.1.72/api/health | grep -q "200"; then
    echo "✅ API Health Check: Working"
else
    echo "❌ API Health Check: Failed"
fi

echo ""
echo "🌐 Ready for Domain Access!"
echo "Once DNS propagates, your app will be available at:"
echo "   https://isha-inc.com"
echo "   https://www.isha-inc.com"
echo ""
echo "Run './setup-ssl.sh' after DNS propagation to configure SSL certificates."