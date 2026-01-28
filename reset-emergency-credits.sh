#!/bin/bash

# Quick Emergency Credit Reset for Users
# Use this to reset emergency credits for users who need immediate access

echo "🚨 Emergency Credit Reset Tool"
echo "==============================="
echo ""

# Check if email provided
if [ -z "$1" ]; then
  echo "Usage: ./reset-emergency-credits.sh <user_email>"
  echo ""
  echo "Example:"
  echo "  ./reset-emergency-credits.sh user@mediczy.com"
  echo ""
  exit 1
fi

USER_EMAIL="$1"

echo "Resetting emergency credits for: $USER_EMAIL"
echo ""

# Reset credits
psql -h 127.0.0.1 -U mediczy_helper -d mediczy_ai << EOF
-- Reset emergency credits
UPDATE users 
SET emergency_triage_credits_used = 0,
    emergency_triage_pending_amount = 0,
    emergency_triage_credit_limit = 1
WHERE email = '$USER_EMAIL';

-- Show updated status
SELECT 
  id,
  email,
  emergency_triage_credits_used as credits_used,
  emergency_triage_credit_limit as credit_limit,
  emergency_triage_pending_amount as pending_amount
FROM users 
WHERE email = '$USER_EMAIL';
EOF

echo ""
echo "✅ Emergency credits reset successfully!"
echo ""
echo "User now has:"
echo "  - 1 free emergency consultation"
echo "  - ₹0 pending amount"
echo ""
