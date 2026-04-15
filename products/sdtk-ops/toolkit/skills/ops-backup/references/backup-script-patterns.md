
# Backup Script Patterns

## Shell Pattern

```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-/backups}"
LOG_FILE="${LOG_FILE:-/var/log/backup.log}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:?Set ENCRYPTION_KEY to a passphrase file or key reference}"
OBJECT_STORE_TARGET="${OBJECT_STORE_TARGET:?Set OBJECT_STORE_TARGET to the remote backup location}"
NOTIFICATION_WEBHOOK="${NOTIFICATION_WEBHOOK:?Set NOTIFICATION_WEBHOOK through the environment}"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

notify_failure() {
  local message="$1"
  curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"Backup failed: $message\"}" \
    "$NOTIFICATION_WEBHOOK"
}

handle_error() {
  local error_message="$1"
  log "ERROR: $error_message"
  notify_failure "$error_message"
  exit 1
}

backup_database() {
  local db_name="$1"
  local backup_file="${BACKUP_ROOT}/db/${db_name}_$(date +%Y%m%d_%H%M%S).sql.gz"

  mkdir -p "$(dirname "$backup_file")"

  if ! pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$db_name" | gzip > "$backup_file"; then
    handle_error "Database backup failed for $db_name"
  fi

  if ! gpg --cipher-algo AES256 --compress-algo 1 --s2k-mode 3 \
    --s2k-digest-algo SHA512 --s2k-count 65536 --symmetric \
    --passphrase-file "$ENCRYPTION_KEY" "$backup_file"; then
    handle_error "Database backup encryption failed for $db_name"
  fi

  rm "$backup_file"
  log "Database backup completed for $db_name"
}

backup_files() {
  local source_dir="$1"
  local backup_name="$2"
  local backup_file="${BACKUP_ROOT}/files/${backup_name}_$(date +%Y%m%d_%H%M%S).tar.gz.gpg"

  mkdir -p "$(dirname "$backup_file")"

  if ! tar -czf - -C "$source_dir" . | \
    gpg --cipher-algo AES256 --compress-algo 0 --s2k-mode 3 \
      --s2k-digest-algo SHA512 --s2k-count 65536 --symmetric \
      --passphrase-file "$ENCRYPTION_KEY" \
      --output "$backup_file"; then
    handle_error "File backup failed for $source_dir"
  fi

  log "File backup completed for $source_dir"
}

verify_backup() {
  local backup_file="$1"

  if ! gpg --quiet --batch --passphrase-file "$ENCRYPTION_KEY" \
    --decrypt "$backup_file" > /dev/null 2>&1; then
    handle_error "Backup integrity check failed for $backup_file"
  fi

  log "Backup integrity verified for $backup_file"
}

upload_backup() {
  local local_file="$1"
  local remote_path="$2"

  if ! cloud-storage-copy "$local_file" "${OBJECT_STORE_TARGET}/${remote_path}"; then
    handle_error "Remote upload failed for $local_file"
  fi

  log "Remote upload completed for $local_file"
}

cleanup_old_backups() {
  find "$BACKUP_ROOT" -name "*.gpg" -mtime +"$RETENTION_DAYS" -delete
  log "Cleanup completed"
}
```

## Pattern Notes

- keep notification endpoints in environment variables, never in version control
- replace `cloud-storage-copy` with the provider-specific upload command used by your platform
- verify every backup after encryption and before declaring success
- keep restore testing separate from production systems
