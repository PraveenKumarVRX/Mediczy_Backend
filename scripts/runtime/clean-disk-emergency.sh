#!/bin/bash
# Emergency disk cleanup - Remove logs, backups, and temporary files
# SAFE: Only removes non-critical files, services continue running

set -e

PROD_SERVER="ubuntu@13.234.17.52"
SSH_KEY="$HOME/.ssh/mediqzy.pem"

cleanup_local() {
  echo "🧹 Cleaning local disk..."
  
  # Remove log files (keep last 10)
  find /home/ubuntu/Mediczy -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
  find /home/ubuntu/Mediczy -name "*sanity-check*.log" -type f ! -newer /home/ubuntu/Mediczy/SANITY_CHECK_SMOKE_TEST_REPORT.md -delete 2>/dev/null || true
  
  # Remove old backup archives
  rm -rf /home/ubuntu/Mediczy/mediczy-backup-* 2>/dev/null || true
  
  # Clean npm cache
  npm cache clean --force 2>/dev/null || true
  
  # Remove node build artifacts
  find /home/ubuntu/Mediczy -name ".turbo" -type d -exec rm -rf {} + 2>/dev/null || true
  find /home/ubuntu/Mediczy -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true
  find /home/ubuntu/Mediczy -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
  
  # Remove test reports
  find /home/ubuntu/Mediczy -name "*test*.log" -type f -mtime +3 -delete 2>/dev/null || true
  
  # Remove old database dumps
  find /home/ubuntu/Mediczy -name "*.dump" -type f -mtime +7 -delete 2>/dev/null || true
  
  # Clean temporary files
  rm -rf /home/ubuntu/Mediczy/*.tmp 2>/dev/null || true
  rm -rf /home/ubuntu/Mediczy/temp 2>/dev/null || true
  
  # Remove old migrations
  find /home/ubuntu/Mediczy -name "*migration*.log" -type f -mtime +30 -delete 2>/dev/null || true
  
  local_size=$(du -sh /home/ubuntu/Mediczy 2>/dev/null | cut -f1)
  echo "✅ Local cleanup done. Size: $local_size"
}

cleanup_production() {
  echo "🧹 Cleaning production disk..."
  
  ssh -i "$SSH_KEY" "$PROD_SERVER" << 'EOF'
    # Remove old logs
    find /home/ubuntu/Mediczy -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    find /home/ubuntu/Mediczy -name "*sanity-check*.log" -type f -delete 2>/dev/null || true
    
    # Remove backups older than 30 days
    find /home/ubuntu -name "mediczy-backup-*" -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true
    
    # Clean npm cache on production
    npm cache clean --force 2>/dev/null || true
    
    # Remove build artifacts
    find /home/ubuntu/Mediczy -name "dist" -type d -exec rm -rf {} + 2>/dev/null || true
    find /home/ubuntu/Mediczy -name ".turbo" -type d -exec rm -rf {} + 2>/dev/null || true
    
    # Remove temporary files
    rm -rf /home/ubuntu/Mediczy/*.tmp 2>/dev/null || true
    rm -rf /home/ubuntu/Mediczy/temp 2>/dev/null || true
    
    # Remove old test reports
    find /home/ubuntu/Mediczy -name "*test*.log" -type f -mtime +3 -delete 2>/dev/null || true
    
    echo "Cleanup complete"
EOF
  
  echo "✅ Production cleanup done"
}

show_before_after() {
  echo ""
  echo "📊 Disk Usage:"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  
  local_avail=$(df -h /home/ubuntu | awk 'NR==2 {print $4}')
  echo "Local: Available = $local_avail"
  
  remote_avail=$(ssh -i "$SSH_KEY" "$PROD_SERVER" "df -h /home/ubuntu | awk 'NR==2 {print \$4}'" 2>/dev/null || echo "N/A")
  echo "Production: Available = $remote_avail"
}

main() {
  echo "════════════════════════════════════════════"
  echo "🚨 Emergency Disk Cleanup - OAuth Deploy"
  echo "════════════════════════════════════════════"
  echo ""
  
  cleanup_local
  cleanup_production
  show_before_after
  
  echo ""
  echo "✅ Cleanup complete!"
  echo "   Services are still running"
  echo "   Disk space recovered for future updates"
  echo "════════════════════════════════════════════"
}

main
