#!/usr/bin/env bash
# Install DB backup cron on ubuntu user (not root — root cannot read SSM on some setups).
set -euo pipefail
LINE='0 2 * * * /home/ubuntu/Mediczy/scripts/database/daily-backup.sh >> /home/ubuntu/Mediczy/logs/backup.log 2>&1'
(crontab -l 2>/dev/null | grep -v 'daily-backup.sh'; echo "$LINE") | crontab -
echo "Installed ubuntu crontab:"
crontab -l | grep daily-backup
echo ""
echo "Remove from root cron if present: sudo crontab -e"
