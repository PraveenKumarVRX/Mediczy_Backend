#!/bin/bash

# Apply Patient Appointment & Notification Fixes
# This script applies the database migration and restarts the server

echo "🔧 Applying Patient Appointment & Notification Fixes"
echo "===================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Step 1: Run database migration
echo "1️⃣  Running database migration..."
cd /home/ubuntu/Mediczy/server

node migrations/add-usertype-to-notifications.js

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Migration completed successfully${NC}"
else
  echo -e "${RED}❌ Migration failed${NC}"
  exit 1
fi
echo ""

# Step 2: Restart server
echo "2️⃣  Restarting server..."

# Check if PM2 is running
if command -v pm2 &> /dev/null; then
  echo "Using PM2 to restart..."
  pm2 restart all
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Server restarted successfully${NC}"
  else
    echo -e "${YELLOW}⚠️  PM2 restart encountered issues${NC}"
  fi
else
  echo -e "${YELLOW}⚠️  PM2 not found. Please manually restart the server:${NC}"
  echo "   cd /home/ubuntu/Mediczy/server"
  echo "   npm restart"
fi
echo ""

# Step 3: Verify migration
echo "3️⃣  Verifying migration..."
echo -e "${YELLOW}Run this SQL query to verify the userType column exists:${NC}"
echo ""
echo "psql -U your_db_user -d your_db_name -c \\"
echo "  \"SELECT column_name, data_type, column_default"
echo "   FROM information_schema.columns"
echo "   WHERE table_name = 'notifications' AND column_name = 'userType';\""
echo ""

# Summary
echo "===================================================="
echo -e "${GREEN}✅ Fixes Applied Successfully!${NC}"
echo "===================================================="
echo ""
echo "📋 What was fixed:"
echo "  ✓ Added userType column to notifications table"
echo "  ✓ Updated notification service to use userType"
echo "  ✓ Fixed notification routes to map user roles correctly"
echo "  ✓ Server restarted with new code"
echo ""
echo "🧪 Next Steps - Testing:"
echo "  1. Run the test script:"
echo "     ./test-patient-appointments.sh"
echo ""
echo "  2. Manual testing:"
echo "     - Login as a patient"
echo "     - Book an appointment"
echo "     - Check notifications (bell icon)"
echo "     - Verify appointment appears in 'My Appointments'"
echo ""
echo "📚 Documentation:"
echo "  See PATIENT_APPOINTMENT_NOTIFICATION_FIX.md for details"
echo ""
