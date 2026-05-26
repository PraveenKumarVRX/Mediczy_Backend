#!/bin/bash

# Backup Cleanup - Removes old backups, keeps only latest N

BACKUP_DIR="${1:-.}"
RETENTION="${2:-1}"

echo "🧹 Backup Cleanup v1.0"
echo "Directory: $BACKUP_DIR"
echo "Retention Policy: Keep $RETENTION backup(s)"
echo ""

cd "$BACKUP_DIR" 2>/dev/null || exit 1

# Get all backups sorted by modification time (newest first)
mapfile -t BACKUPS < <(ls -td mediczy-backup-* 2>/dev/null)

TOTAL=${#BACKUPS[@]}
echo "📊 Total backups found: $TOTAL"
echo ""

if [ "$TOTAL" -le "$RETENTION" ]; then
  echo "✅ Already compliant with retention policy"
  exit 0
fi

# Show which ones will be deleted
echo "🗑️  Backups to delete:"
DELETED_SIZE=0
for ((i=RETENTION; i<TOTAL; i++)); do
  BACKUP="${BACKUPS[$i]}"
  SIZE=$(du -sh "$BACKUP" 2>/dev/null | cut -f1)
  SIZE_BYTES=$(du -s "$BACKUP" 2>/dev/null | cut -f1)
  echo "  • $BACKUP ($SIZE)"
  DELETED_SIZE=$((DELETED_SIZE + SIZE_BYTES))
done

echo ""
echo "🗑️  Deleting old backups..."
DELETED_COUNT=0

for ((i=RETENTION; i<TOTAL; i++)); do
  BACKUP="${BACKUPS[$i]}"
  
  if rm -rf "$BACKUP" 2>/dev/null; then
    echo "  ✅ Deleted: $BACKUP"
    ((DELETED_COUNT++))
  else
    echo "  ❌ Failed to delete: $BACKUP"
  fi
done

echo ""
echo "✅ Cleanup Complete!"
echo ""
echo "📊 Summary:"
echo "  • Total backups: $TOTAL"
echo "  • Deleted: $DELETED_COUNT"
echo "  • Remaining: $RETENTION"
echo "  • Space freed: $(( DELETED_SIZE / 1024 / 1024 ))MB"
echo ""

# Show disk space
if command -v df &> /dev/null; then
  echo "💾 Disk space:"
  df -h "$BACKUP_DIR" | tail -1 | awk '{print "   " $1 ": " $3 " used / " $4 " available (" $5 ")"}'
fi
