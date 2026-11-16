#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
container=careerdev-phase1-db
[[ $(docker inspect --format '{{index .Config.Labels "careerdev.acceptance"}}' "$container") == phase1-disposable ]]
[[ $(docker inspect --format '{{.HostConfig.NetworkMode}}' "$container") == none ]]
docker exec -i "$container" psql -Xq -U postgres -d careerdev_acceptance -v ON_ERROR_STOP=1 < supabase/baseline/candidates/coach-semantic-invalidation.sql
