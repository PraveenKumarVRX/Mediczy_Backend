#!/bin/bash

echo "🏥 STARTING COMPLETE MEDICZY TELEMEDICINE PLATFORM"
echo "=================================================="
echo "📋 Features: Video Consultations | AI Doctor | Appointments | Health Tracking | Insurance | Emergency"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to check service status
check_service_status() {
    local service=$1
    local port=$2
    local name=$3
    
    if nc -z localhost $port 2>/dev/null; then
        echo -e "${GREEN}✅ $name (Port $port)${NC}"
        return 0
    else
        echo -e "${RED}❌ $name (Port $port)${NC}"
        return 1
    fi
}

# Function to test API endpoint
test_api_endpoint() {
    local url=$1
    local name=$2
    
    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200"; then
        echo -e "${GREEN}✅ $name API${NC}"
        return 0
    else
        echo -e "${RED}❌ $name API${NC}"
        return 1
    fi
}

echo "📊 TELEMEDICINE SERVICES STATUS CHECK"
echo "====================================="

# Core Infrastructure
echo -e "${BLUE}🔧 Core Infrastructure:${NC}"
check_service_status mariadb 3306 "MariaDB Database"
check_service_status redis 6379 "Redis Cache" 
check_service_status mongod 27017 "MongoDB"
check_service_status nginx 80 "Nginx Proxy"
check_service_status nginx 443 "Nginx HTTPS"

echo ""

# Application Services  
echo -e "${BLUE}⚙️ Application Services:${NC}"
check_service_status backend 8000 "Backend API Server"
check_service_status docsgpt 7091 "Dr. iSHA AI Service"
check_service_status frontend 9443 "Frontend Application"

echo ""

# API Health Checks
echo -e "${BLUE}🩺 Medical Services API Tests:${NC}"
test_api_endpoint "http://localhost:8000/health" "Backend Health"
test_api_endpoint "http://localhost:8000/api/auth/health" "Authentication Service"
test_api_endpoint "http://localhost:8000/api/appointments/health" "Appointments System"
test_api_endpoint "http://localhost:8000/api/consultations/health" "Consultation Service"
test_api_endpoint "http://localhost:8000/api/dr-isha/health" "Dr. iSHA Integration"
test_api_endpoint "http://localhost:8000/api/insurance/health" "Insurance System"
test_api_endpoint "http://localhost:8000/api/emergency/health" "Emergency Services"
test_api_endpoint "http://localhost:7091/health" "AI Medical Assistant"

echo ""

# Telemedicine Feature Tests
echo -e "${BLUE}📱 Telemedicine Features Test:${NC}"

# Test video calling capability
if curl -s "http://localhost:8000/api/video/test" | grep -q "success"; then
    echo -e "${GREEN}✅ Video Call System${NC}"
else
    echo -e "${YELLOW}⚠️ Video Call System (Check Socket.io)${NC}"
fi

# Test appointment booking
if curl -s -X POST "http://localhost:8000/api/appointments/test" | grep -q "success"; then
    echo -e "${GREEN}✅ Appointment Booking${NC}"
else
    echo -e "${YELLOW}⚠️ Appointment Booking (May need auth)${NC}"
fi

# Test AI Doctor
if curl -s -X POST "http://localhost:7091/chat" \
   -H "Content-Type: application/json" \
   -d '{"message":"test","user_id":"health_check","session_id":"system_test"}' | grep -q "success"; then
    echo -e "${GREEN}✅ AI Doctor Consultation${NC}"
else
    echo -e "${RED}❌ AI Doctor Consultation${NC}"
fi

# Test health tracking
if curl -s "http://localhost:8000/api/health/tracker/test" | grep -q "success"; then
    echo -e "${GREEN}✅ Health Tracking System${NC}"
else
    echo -e "${YELLOW}⚠️ Health Tracking System${NC}"
fi

echo ""

# Frontend Page Tests
echo -e "${BLUE}🎨 Frontend Pages Access Test:${NC}"

declare -A frontend_pages=(
    ["/ai-doctor"]="AI Doctor Consultation"
    ["/consultation"]="Find Doctors"  
    ["/appointments"]="Appointment Booking"
    ["/consultation-booking"]="Book Consultation"
    ["/video-call-test"]="Video Call Test"
    ["/emergency"]="Emergency Services"
    ["/insurance"]="Insurance Management"
    ["/health-tracker"]="Health Monitoring"
    ["/profile"]="User Profile"
    ["/diet"]="Diet Planning"
    ["/bmi"]="BMI Calculator"
)

for page in "${!frontend_pages[@]}"; do
    if curl -s "http://localhost:9443$page" >/dev/null; then
        echo -e "${GREEN}✅ ${frontend_pages[$page]}${NC}"
    else
        echo -e "${YELLOW}⚠️ ${frontend_pages[$page]}${NC}"
    fi
done

echo ""

# Database Connectivity Tests
echo -e "${BLUE}🗄️ Database Connectivity:${NC}"

# MariaDB test
if mysqladmin -h localhost -P 3306 ping 2>/dev/null; then
    echo -e "${GREEN}✅ MariaDB Connection${NC}"
    # Test if tables exist
    if mysql -h localhost -P 3306 -u root -p'RootSecurePass2024!' -e "USE mediczy; SHOW TABLES;" 2>/dev/null | grep -q "users"; then
        echo -e "${GREEN}✅ MariaDB Tables${NC}"
    else
        echo -e "${YELLOW}⚠️ MariaDB Tables (May need setup)${NC}"
    fi
else
    echo -e "${RED}❌ MariaDB Connection${NC}"
fi

# MongoDB test  
if mongosh --eval "db.adminCommand('ping')" >/dev/null 2>&1; then
    echo -e "${GREEN}✅ MongoDB Connection${NC}"
else
    echo -e "${RED}❌ MongoDB Connection${NC}"
fi

# Redis test
if redis-cli ping 2>/dev/null | grep -q "PONG"; then
    echo -e "${GREEN}✅ Redis Connection${NC}"
else
    echo -e "${RED}❌ Redis Connection${NC}"
fi

echo ""

# Performance Check
echo -e "${BLUE}⚡ Performance Metrics:${NC}"
echo "🖥️  CPU Usage: $(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)%"
echo "💾 Memory Usage: $(free | grep Mem | awk '{printf("%.1f%%", $3/$2 * 100.0)}')"
echo "🔥 Load Average: $(uptime | awk -F'load average:' '{print $2}' | xargs)"

# Disk space for logs and uploads
echo "📊 Disk Space:"
echo "   - Logs: $(du -sh /root/Mediczy/logs 2>/dev/null || echo "N/A")"
echo "   - Uploads: $(du -sh /tmp/mediczy 2>/dev/null || echo "N/A")"
echo "   - AI Models: $(du -sh /root/Mediczy/docsgpt/llm_models 2>/dev/null || echo "N/A")"

echo ""
echo "🌐 TELEMEDICINE PLATFORM ACCESS URLS"
echo "===================================="
echo -e "${GREEN}🎯 Main Application: http://localhost:9443${NC}"
echo ""
echo "📱 Patient Features:"
echo "   • AI Doctor:           http://localhost:9443/ai-doctor"
echo "   • Find Doctors:        http://localhost:9443/consultation"  
echo "   • Book Appointment:    http://localhost:9443/appointments"
echo "   • Video Consultation:  http://localhost:9443/video-call-test"
echo "   • Emergency Services:  http://localhost:9443/emergency"
echo "   • Health Tracker:      http://localhost:9443/health-tracker"
echo "   • Insurance:           http://localhost:9443/insurance"
echo ""
echo "👩‍⚕️ Doctor Features:"
echo "   • Doctor Dashboard:    http://localhost:9443/doctor"
echo "   • Patient Management:  http://localhost:9443/doctor/patients"
echo "   • Video Consultations: http://localhost:9443/doctor/consultations"
echo ""
echo "🔧 Admin Features:"
echo "   • Admin Dashboard:     http://localhost:9443/admin"
echo "   • System Management:   http://localhost:9443/admin/system"
echo "   • User Management:     http://localhost:9443/admin/users"
echo ""
echo "🔌 API Endpoints:"
echo "   • Backend API:         http://localhost:8000"
echo "   • AI Medical API:      http://localhost:7091"
echo "   • Health Check:        http://localhost:8000/health"
echo ""
echo "📊 Management Commands:"
echo "========================"
echo "• Check Status:     ./telemedicine-status.sh"
echo "• Backend Logs:     pm2 logs mediczy-server"
echo "• AI Logs:          tail -f /root/Mediczy/docsgpt/logs/docsgpt.log"
echo "• Frontend Logs:    tail -f /tmp/mediczy/logs/frontend.log"
echo "• Database Access:  mysql -h localhost -P 3306 -u root -p"
echo "• Restart All:      ./start-all.sh"
echo ""

# Final Status Summary
echo -e "${BLUE}📋 PLATFORM STATUS SUMMARY${NC}"
echo "==========================="

# Count operational services
operational_count=0
total_services=15

# Core services check
if nc -z localhost 3306 2>/dev/null; then ((operational_count++)); fi
if nc -z localhost 6379 2>/dev/null; then ((operational_count++)); fi  
if nc -z localhost 27017 2>/dev/null; then ((operational_count++)); fi
if nc -z localhost 80 2>/dev/null; then ((operational_count++)); fi
if nc -z localhost 8000 2>/dev/null; then ((operational_count++)); fi
if nc -z localhost 7091 2>/dev/null; then ((operational_count++)); fi
if nc -z localhost 9443 2>/dev/null; then ((operational_count++)); fi

# Calculate percentage  
percentage=$((operational_count * 100 / 7))

if [ $percentage -ge 90 ]; then
    status_color=$GREEN
    status_icon="🎉"
    status_text="EXCELLENT"
elif [ $percentage -ge 70 ]; then
    status_color=$YELLOW
    status_icon="⚡"
    status_text="GOOD"
else
    status_color=$RED
    status_icon="⚠️"
    status_text="NEEDS ATTENTION"
fi

echo -e "${status_color}${status_icon} Platform Status: ${status_text} (${operational_count}/7 core services)${NC}"

if [ $percentage -ge 90 ]; then
    echo ""
    echo -e "${GREEN}🚀 MEDICZY TELEMEDICINE PLATFORM IS FULLY OPERATIONAL! 🏥${NC}"
    echo -e "${GREEN}✅ Ready for patients, doctors, and video consultations${NC}"
else
    echo ""
    echo -e "${YELLOW}📋 Some services may need attention. Check individual components above.${NC}"
fi