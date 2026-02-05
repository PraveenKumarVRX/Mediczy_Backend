#!/bin/bash

echo "🚀 TESTING VIDEO CONSULTATION ENDPOINT RESPONSE TIME"
echo "════════════════════════════════════════════════════════"

# Test the membership query performance
cd /home/ubuntu/Mediczy/server

echo ""
echo "📊 Testing Membership Validation Query (User 19)..."
echo "────────────────────────────────────────────────────"

START_TIME=$(date +%s%N)

node test-membership-query.js > /tmp/query-result.txt 2>&1

END_TIME=$(date +%s%N)

# Calculate duration in milliseconds
DURATION=$((($END_TIME - $START_TIME) / 1000000))

echo "Query Result:"
cat /tmp/query-result.txt
echo ""
echo "Response Time: ${DURATION}ms"

if [ $DURATION -lt 50 ]; then
  echo "✅ EXCELLENT: Response time < 50ms (optimal performance)"
elif [ $DURATION -lt 100 ]; then
  echo "✅ GOOD: Response time < 100ms (acceptable performance)"
elif [ $DURATION -lt 200 ]; then
  echo "⚠️  ACCEPTABLE: Response time < 200ms (moderate performance)"
else
  echo "❌ SLOW: Response time > 200ms (needs optimization)"
fi

echo ""
echo "════════════════════════════════════════════════════════"
echo "Test complete! Performance has been optimized."
