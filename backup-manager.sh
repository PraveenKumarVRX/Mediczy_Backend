#!/bin/bash

# Backup Manager - Creates backup and auto-deletes old ones
# Usage: ./backup-manager.sh [backup_path] [retention_count]

BACKUP_DIR="${1:-.}"
RETENTION="${2:-1}"

# Find project directory (case-insensitive)
if [ -d "${BACKUP_DIR}/Mediczy" ]; then
  PROJECT_DIR="Mediczy"
  PROJECT_NAME="mediczy"
elif [ -d "${BACKUP_DIR}/mediczy" ]; then
  PROJECT_DIR="mediczy"
  PROJECT_NAME="mediczy"
else
  echo -e "${RED}❌ Source directory not found: Mediczy or mediczy${NC}"
  exit 1
fi

# Get timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="${PROJECT_NAME}-backup-${TIMESTAMP}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Backup Manager v1.0${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""

# Step 1: Create backup
echo -e "${YELLOW}[1/3] Creating backup: ${BACKUP_NAME}${NC}"
if [ -d "${BACKUP_DIR}/${PROJECT_DIR}" ]; then
  cd "${BACKUP_DIR}" 2>/dev/null || exit 1
  
  # Create the backup
  cp -r "${PROJECT_DIR}" "${BACKUP_NAME}" 2>/dev/null
  if [ $? -eq 0 ]; then
    SIZE=$(du -sh "${BACKUP_NAME}" 2>/dev/null | cut -f1)
    echo -e "${GREEN}✅ Backup created: ${BACKUP_NAME} (${SIZE})${NC}"
  else
    echo -e "${RED}❌ Failed to create backup${NC}"
    exit 1
  fi
else
  echo -e "${RED}❌ Source directory not found: ${BACKUP_DIR}/${PROJECT_DIR}${NC}"
  exit 1
fi

# Step 2: List current backups
echo ""
echo -e "${YELLOW}[2/3] Listing backups (keeping last ${RETENTION}):${NC}"
cd "${BACKUP_DIR}" 2>/dev/null || exit 1

# Get all backups sorted by modification time (newest first)
mapfile -t BACKUPS < <(ls -td ${PROJECT_NAME}-backup-* 2>/dev/null)

echo -e "${GREEN}Total backups: ${#BACKUPS[@]}${NC}"
for i in "${!BACKUPS[@]}"; do
  SIZE=$(du -sh "${BACKUPS[$i]}" 2>/dev/null | cut -f1)
  if [ $i -lt "$RETENTION" ]; then
    echo -e "${GREEN}  ✓ ${BACKUPS[$i]} (${SIZE}) - KEEPING${NC}"
  else
    echo -e "${YELLOW}  ✗ ${BACKUPS[$i]} (${SIZE}) - TO DELETE${NC}"
  fi
done

# Step 3: Delete old backups
echo ""
echo -e "${YELLOW}[3/3] Removing old backups...${NC}"

DELETED_COUNT=0
FREED_SPACE=0

for ((i=RETENTION; i<${#BACKUPS[@]}; i++)); do
  BACKUP_PATH="${BACKUPS[$i]}"
  BACKUP_SIZE=$(du -sh "${BACKUP_PATH}" 2>/dev/null | cut -f1 | sed 's/[^0-9]*//g')
  
  if rm -rf "${BACKUP_PATH}" 2>/dev/null; then
    echo -e "${GREEN}✅ Deleted: ${BACKUP_PATH}${NC}"
    ((DELETED_COUNT++))
    FREED_SPACE=$((FREED_SPACE + BACKUP_SIZE))
  else
    echo -e "${RED}⚠️  Could not delete: ${BACKUP_PATH}${NC}"
  fi
done

# Summary
echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Backup Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo -e "📊 Summary:"
echo -e "  ✅ Backup created: ${BACKUP_NAME}"
echo -e "  🗑️  Old backups deleted: ${DELETED_COUNT}"
echo -e "  💾 Retention policy: Keep ${RETENTION} backup(s)"
echo ""

# Show disk space
if command -v df &> /dev/null; then
  echo -e "📈 Disk space:"
  df -h "${BACKUP_DIR}" | tail -1 | awk '{print "  Used: " $3 " / Available: " $4 " (" $5 ")"}'
fi

echo ""
echo -e "${GREEN}✨ Done!${NC}"
