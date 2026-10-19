// Credentials for migrations/recovery must never be injected into an HTTP/worker runtime.
export const isPrivilegedDatabaseSecret = key => /^(RDS_MASTER_|POSTGRES_BACKUP_|POSTGRES_MIGRATOR_|DB_ADMIN_)/.test(key);
