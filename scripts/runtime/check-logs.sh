#!/bin/bash
# Check PM2 logs for errors

echo "=== Checking PM2 Logs for Errors ==="
echo ""

echo "Last 50 lines of error logs:"
pm2 logs mediczy-server --err --lines 50 --nostream

echo ""
echo "=== End of Logs ==="
