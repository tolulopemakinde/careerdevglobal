#!/usr/bin/env bash
set -euo pipefail

# Require a CI-local database whose name is unique to this suite.
export PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGDATABASE=careerdev_scheduling_fixture
: "${PGPASSWORD:?Set the synthetic Postgres service password}"
sql() { psql -XqAt -v ON_ERROR_STOP=1 "$@"; }
candidate=docs/scheduling/rehearsal
sql -f tests/calendly-rehearsal-fixtures.sql -f "$candidate/booking-request.sql" -f "$candidate/calendly-operations.sql" \
  -f "$candidate/marketplace-transaction.sql" -f "$candidate/public-directory.sql"

coach=00000000-0000-0000-0000-000000000001
client=00000000-0000-0000-0000-000000000002
outsider=00000000-0000-0000-0000-000000000003
booking=00000000-0000-0000-0000-000000000051
overlap=00000000-0000-0000-0000-000000000052
event=https://api.calendly.com/scheduled_events/event-1
invitee="$event/invitees/invitee-1"
snapshot='{"provider_user_uri":"https://api.calendly.com/users/coach","provider_type_uri":"https://api.calendly.com/event_types/type-1","starts_at":"2090-01-01T10:00:00Z","ends_at":"2090-01-01T10:30:00Z"}'

expect_error() {
  local output
  if output=$(sql -c "$1" 2>&1); then
    echo "Expected failure: $2" >&2
    return 1
  fi
  [[ "$output" == *"$2"* ]] || { echo "$output" >&2; return 1; }
}

[[ $(sql -c 'set role anon; select get_public_coach_directory(), get_public_service_directory()') == '1|1' ]]
expect_error 'set role anon; select * from calendly_connections' 'permission denied'
expect_error "set role authenticated; select begin_calendly_operation('$booking','$coach','confirm',null)" 'permission denied'
expect_error "set role service_role; select begin_calendly_operation('$booking','$outsider','confirm',null)" 'Booking unavailable'
expect_error "set role service_role; select begin_calendly_operation('$booking','$coach','confirm',jsonb_set('$snapshot','{provider_type_uri}','\"other\"'))" 'changed during verification'

request="select create_marketplace_booking_request('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000041',null,'2090-01-02T10:00Z','2090-01-02T10:30Z','UTC',null)->>'id'"
requested_id=$(sql -c "set role authenticated; set request.jwt.claim.sub='$client'; $request")
[[ $(sql -c "select event_type, actor_type, actor_id from marketplace_booking_events where booking_id='$requested_id'") == "requested|client|$client" ]]

scratch=$(mktemp -d)
trap 'rm -f -- "$scratch/one" "$scratch/two"; rmdir -- "$scratch"' EXIT
claim="select begin_calendly_operation('$booking','$coach','confirm','$snapshot')->>'dispatch'"
# Hold the first transaction open to test real contention from another session.
sql -c "begin; set role service_role; $claim; select pg_sleep(1); commit" >"$scratch/one" &
one=$!
sql -c "set role service_role; $claim" >"$scratch/two" &
two=$!
wait "$one"; wait "$two"
[[ $(cat "$scratch/one" "$scratch/two" | sed '/^$/d' | sort) == $'false\ntrue' ]]
expect_error "set role service_role; select begin_calendly_operation('$overlap','$coach','confirm','$snapshot')" 'exclusion constraint'

op=$(sql -c "set role service_role; select begin_calendly_operation('$booking','$coach','confirm',null)->>'id'")
sql -c "set role service_role; select flag_calendly_operation('$op')" >/dev/null
[[ $(sql -c "set role service_role; select begin_calendly_operation('$booking','$coach','confirm','$snapshot')->>'state'") == 'reconciliation_required' ]]
expect_error "set role service_role; select finish_calendly_operation('$booking','$op','$event','https://api.calendly.com/scheduled_events/wrong/invitees/i')" 'Invalid provider identifiers'
finish="set role service_role; select finish_calendly_operation('$booking','$op','$event','$invitee')"
sql -c "$finish" >/dev/null
sql -c "$finish" >/dev/null
[[ $(sql -c "select booking_status, (select count(*) from marketplace_booking_events where event_type='confirmed') from marketplace_booking_requests where id='$booking'") == 'confirmed|1' ]]

init_tx="set role authenticated; set request.jwt.claim.sub='$client'; select create_marketplace_transaction('$booking')"
sql -c "$init_tx" >"$scratch/one" &
one=$!
sql -c "$init_tx" >"$scratch/two" &
two=$!
wait "$one"; wait "$two"
[[ -s "$scratch/one" ]]
cmp "$scratch/one" "$scratch/two"
[[ $(sql -c 'select gross_amount, platform_fee, coach_earnings, (select count(*) from marketplace_transaction_events) from marketplace_transactions') == '101.55|20.31|81.24|1' ]]
expect_error "set role authenticated; set request.jwt.claim.sub='$outsider'; select create_marketplace_transaction('$booking')" 'Booking unavailable'

cancel_snapshot=$(sql -c "select '$snapshot'::jsonb || jsonb_build_object('provider_event_uri','$event','provider_invitee_uri','$invitee')")
cancel="select begin_calendly_operation('$booking','$client','cancel','$cancel_snapshot')"
cancel_id=$(sql -c "set role service_role; $cancel->>'id'")
[[ $(sql -c "set role service_role; $cancel->>'dispatch'") == 'false' ]]
sql -c "set role service_role; select finish_calendly_operation('$booking','$cancel_id','$event','$invitee')" >/dev/null
[[ $(sql -c "select booking_status, (select count(*) from marketplace_transactions), (select count(*) from marketplace_booking_slots where status='cancelled') from marketplace_booking_requests where id='$booking'") == 'cancelled|1|1' ]]
echo 'Calendly database contract checks passed.'
