#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
container=careerdev-phase1-db
target=${CAREERDEV_RESTORE_TARGET:-careerdev_restore}
[[ "$target" == careerdev_restore || "$target" == careerdev_semantic_restore ]]
report=docs/database/phase1/restore-result.json
[[ "$target" != careerdev_semantic_restore ]] || report=docs/database/phase1/restore-semantic-result.json
[[ $(docker inspect --format '{{index .Config.Labels "careerdev.acceptance"}}' "$container") == phase1-disposable ]]
[[ $(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container") == none ]]
[[ $(docker exec "$container" psql -U postgres -d careerdev_acceptance -Atc 'select count(*) from auth.users') == 6 ]]
# Backup consists solely of the local reconstructed schema and six synthetic identities.
docker exec "$container" pg_dump -U postgres -d careerdev_acceptance --no-owner > /tmp/careerdev-fixture-backup.sql
docker exec "$container" createdb -U postgres "$target"
docker exec -i "$container" psql -Xq -U postgres -d "$target" -v ON_ERROR_STOP=1 < /tmp/careerdev-fixture-backup.sql
for db in careerdev_acceptance "$target"; do
 docker exec -i "$container" psql -XqAt -U postgres -d "$db" -v ON_ERROR_STOP=1 < supabase/diagnostics/current_schema_snapshot.sql > "/tmp/$db-schema.json"
done
python scripts/database/compare-baseline.py /tmp/careerdev_acceptance-schema.json "/tmp/$target-schema.json" "$report"
