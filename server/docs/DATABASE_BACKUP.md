# Mediczy Production Database Backup Strategy

## Automated Backups

### MariaDB (Leader Database)
```bash
#!/bin/bash
# /root/mediczy-backups/backup-mariadb.sh

BACKUP_DIR="/root/mediczy-backups/mariadb"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="mediczy"
DB_USER="mediczy_user"
DB_PASS="your-password"

mkdir -p "$BACKUP_DIR"

# Full backup
mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  | gzip > "$BACKUP_DIR/mediczy_$DATE.sql.gz"

# Keep only last 7 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete

echo "Backup completed: mediczy_$DATE.sql.gz"
```

### MongoDB (Helper Database)
```bash
#!/bin/bash
# /root/mediczy-backups/backup-mongodb.sh

BACKUP_DIR="/root/mediczy-backups/mongodb"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

mongodump --uri="mongodb://localhost:27017/mediczy" \
  --out="$BACKUP_DIR/mongo_$DATE" \
  --gzip

# Keep only last 7 days
find "$BACKUP_DIR" -name "mongo_*" -mtime +7 -exec rm -rf {} \;

echo "Backup completed: mongo_$DATE"
```

### Cron Setup
```bash
# Add to crontab: crontab -e
# Daily backup at 2 AM
0 2 * * * /root/mediczy-backups/backup-mariadb.sh >> /var/log/mediczy-backup.log 2>&1
0 3 * * * /root/mediczy-backups/backup-mongodb.sh >> /var/log/mediczy-backup.log 2>&1
```

## Database Indexes

### Critical Indexes for Performance

```sql
-- Users table
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_active ON users(isActive);
CREATE INDEX idx_users_created ON users(createdAt);

-- Nurses table
CREATE INDEX idx_nurses_email ON nurses(email);
CREATE INDEX idx_nurses_department ON nurses(department);

-- Doctors table  
CREATE INDEX idx_doctors_email ON doctors(email);
CREATE INDEX idx_doctors_specialization ON doctors(specialization);

-- Appointments table
CREATE INDEX idx_appointments_user ON appointments(userId);
CREATE INDEX idx_appointments_doctor ON appointments(doctorId);
CREATE INDEX idx_appointments_date ON appointments(appointmentDate);
CREATE INDEX idx_appointments_status ON appointments(status);

-- Composite indexes
CREATE INDEX idx_appointments_user_date ON appointments(userId, appointmentDate);
CREATE INDEX idx_appointments_doctor_date ON appointments(doctorId, appointmentDate);
```

## Monitoring Queries

```sql
-- Check table sizes
SELECT 
  table_name,
  ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
FROM information_schema.TABLES
WHERE table_schema = 'mediczy'
ORDER BY size_mb DESC;

-- Check slow queries
SHOW FULL PROCESSLIST;

-- Connection pool status
SHOW STATUS LIKE 'Threads_connected';
SHOW STATUS LIKE 'Max_used_connections';
```

## Disaster Recovery

### Restore from Backup

```bash
# MariaDB restore
gunzip < /root/mediczy-backups/mariadb/mediczy_20251126_020000.sql.gz | \
  mysql -u mediczy_user -p mediczy

# MongoDB restore
mongorestore --uri="mongodb://localhost:27017" \
  --gzip \
  /root/mediczy-backups/mongodb/mongo_20251126_030000
```

## Replication Setup (Optional)

For high availability, set up MariaDB replication:

```sql
-- On Master
CREATE USER 'repl'@'%' IDENTIFIED BY 'strong-password';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';
FLUSH PRIVILEGES;
SHOW MASTER STATUS;

-- On Slave
CHANGE MASTER TO
  MASTER_HOST='master-ip',
  MASTER_USER='repl',
  MASTER_PASSWORD='strong-password',
  MASTER_LOG_FILE='recorded-log-file',
  MASTER_LOG_POS=recorded-position;
START SLAVE;
SHOW SLAVE STATUS\G
```
