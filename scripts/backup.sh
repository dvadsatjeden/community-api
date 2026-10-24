#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# SQLite online backup includes committed WAL data. Use unique names and never copy the live file directly.
BACKUP_NAME="community-$(date -u +%Y%m%dT%H%M%SZ).sqlite"
docker compose exec -T community-api node dist/scripts/backup.js "/app/data/backups/$BACKUP_NAME"
printf 'Created data/backups/%s\n' "$BACKUP_NAME"
