#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
container=careerdev-phase1-db
image=pgvector/pgvector@sha256:b513c48566e4777cd3370451400000c78eda6a08131d68f4c31d4a76f27bd8fd
if docker inspect "$container" >/dev/null 2>&1; then
 echo 'BLOCKED: named fixture already exists; preserve/export it before an explicitly disposable rebuild.' >&2
 exit 1
fi
docker image inspect "$image" >/dev/null 2>&1 || { echo "Pull the pinned image first: $image" >&2; exit 1; }
docker run --detach --name "$container" --label careerdev.acceptance=phase1-disposable --network none \
 --tmpfs /var/lib/postgresql/data:rw,size=512m \
 --env POSTGRES_DB=careerdev_acceptance --env POSTGRES_PASSWORD=synthetic-local-only \
 --mount "type=bind,src=$PWD,dst=/recovery,readonly" "$image" >/dev/null
for attempt in $(seq 1 30); do
 if docker exec "$container" pg_isready -U postgres -d careerdev_acceptance >/dev/null 2>&1; then
  echo 'Local disposable PostgreSQL ready; Auth and Storage are adapters, not running services.'
  exit 0
 fi
 sleep 1
done
echo 'BLOCKED: local database did not become ready' >&2
exit 1
