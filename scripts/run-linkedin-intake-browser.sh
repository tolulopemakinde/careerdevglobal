#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(pwd)"
fixture_dir="$(mktemp -d)"
next_pid=
cleanup() {
  if [[ -n "${next_pid}" ]]; then kill "${next_pid}" 2>/dev/null || true; fi
  (cd "${fixture_dir}" && supabase stop --no-backup >/dev/null 2>&1) || true
  rm -rf "${fixture_dir}"
}
trap cleanup EXIT

(
  cd "${fixture_dir}"
  supabase init >/dev/null
  sed -i -E 's/^enable_confirmations = true/enable_confirmations = false/' supabase/config.toml
  mkdir -p supabase/migrations
  cp "${repo_dir}/tests/fixtures/linkedin-intake-browser.sql" supabase/migrations/20261125000000_linkedin_fixture.sql
  supabase start >/dev/null 2>&1
  supabase status -o env 2>/dev/null | sed -n -E '/^(API_URL|PUBLISHABLE_KEY|ANON_KEY)=/p' > "${fixture_dir}/local-status.env"
)
local_api="$(sed -n 's/^API_URL="\(.*\)"$/\1/p' "${fixture_dir}/local-status.env")"
local_public_key="$(sed -n 's/^PUBLISHABLE_KEY="\(.*\)"$/\1/p' "${fixture_dir}/local-status.env")"
if [[ -z "${local_public_key}" ]]; then
  local_public_key="$(sed -n 's/^ANON_KEY="\(.*\)"$/\1/p' "${fixture_dir}/local-status.env")"
fi
[[ "${local_api}" == "http://127.0.0.1:"* && -n "${local_public_key}" ]]

NEXT_PUBLIC_SUPABASE_URL="${local_api}" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${local_public_key}" \
  npm run dev -- --webpack --hostname 127.0.0.1 > "${fixture_dir}/next.log" 2>&1 &
next_pid=$!
for i in $(seq 1 90); do
  if curl --silent --fail --max-time 10 http://127.0.0.1:3000/career-intelligence >/dev/null; then break; fi
  if [[ "${i}" == "90" ]]; then echo "Local Career Intelligence did not start."; exit 1; fi
  sleep 2
done
python scripts/test-linkedin-intake-browser.py
