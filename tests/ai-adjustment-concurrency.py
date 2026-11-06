"""Exercise both orderings of full refund and credit settlement on disposable PostgreSQL."""

import json
import os
import subprocess
import time


COMMAND = ["psql", "-X", "-Aqt", "-v", "ON_ERROR_STOP=1"]
DATABASE = "synthetic_ai_adjustment_fixture"


def query(sql):
    return subprocess.run(COMMAND, input=sql, text=True, check=True,
                          capture_output=True, timeout=12).stdout.strip()


def wait_until(condition):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if query(condition) == "t":
            return
        time.sleep(0.1)
    raise AssertionError("Expected PostgreSQL session state was not observed")


def start(name):
    return subprocess.Popen(
        COMMAND, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, text=True,
        env={**os.environ, "PGAPPNAME": name},
    )


def send(process, sql):
    process.stdin.write(sql + "\n")
    process.stdin.flush()


def race(first, second, second_error=None):
    with start("adjustment-holder") as holder, start("adjustment-waiter") as waiter:
        try:
            send(holder, "BEGIN; SET LOCAL statement_timeout = '12s'; " + first)
            wait_until("""
              SELECT EXISTS (SELECT 1 FROM pg_stat_activity
                WHERE application_name = 'adjustment-holder' AND state = 'idle in transaction');
            """)
            send(waiter, "SET statement_timeout = '12s'; " + second)
            wait_until("""
              SELECT EXISTS (
                SELECT 1 FROM pg_stat_activity w
                JOIN pg_stat_activity h ON h.pid = ANY(pg_blocking_pids(w.pid))
                WHERE w.application_name = 'adjustment-waiter'
                  AND h.application_name = 'adjustment-holder'
                  AND w.wait_event_type = 'Lock' AND w.wait_event = 'advisory'
              );
            """)
            send(holder, "COMMIT;")
            _, error = holder.communicate(timeout=12)
            assert holder.returncode == 0, error
            _, error = waiter.communicate(timeout=12)
            if second_error is None:
                assert waiter.returncode == 0, error
            else:
                assert waiter.returncode != 0 and second_error in error, error
        finally:
            for process in (holder, waiter):
                if process.poll() is None:
                    process.kill()
                    process.communicate(timeout=5)


def scenario(number, refund_first):
    suffix = f"{number:012d}"
    owner = f"10000000-0000-0000-0000-{suffix}"
    subscription = f"20000000-0000-0000-0000-{suffix}"
    reference = f"synthetic-refund-{number}"
    query(f"""
      SET request.jwt.claim.role = 'service_role';
      INSERT INTO public.ai_subscription_payments
        SELECT '{reference}', id, '{reference}-tx', 750000, 'NGN',
               current_period_start, current_period_end
        FROM public.ai_agent_subscriptions WHERE id = '{subscription}';
      INSERT INTO public.ai_credit_ledger
        (user_id, subscription_id, plan_key, period_start, period_end,
         operation_key, credits, status, idempotency_key)
      VALUES ('{owner}', '{subscription}', 'fresher', date_trunc('month', now()),
              date_trunc('month', now()) + interval '1 month',
              'fictional-operation', 3, 'reserved', '{reference}');
    """)
    evidence = json.dumps({
        "action": "refund", "provider_object_id": f"refund:{reference}",
        "reference": reference, "transaction_id": f"{reference}-tx",
        "currency": "NGN", "amount_minor": 750000, "verification_source": "provider_api",
    })
    refund = f"""
      SET request.jwt.claim.role = 'service_role';
      SELECT public.apply_ai_payment_adjustment(
        '10000000-0000-0000-0000-000000000001', 'Synthetic race audit', '{evidence}'::jsonb);
    """
    settle = f"""
      UPDATE public.ai_credit_ledger SET status = 'consumed' WHERE idempotency_key = '{reference}';
    """
    if refund_first:
        race(refund, settle, "Payment credits unavailable")
    else:
        race(settle, refund)
    expected = "reserved" if refund_first else "consumed"
    assert query(f"""
      SET request.jwt.claim.role = 'service_role';
      SELECT l.status = '{expected}' AND l.credits = 3 AND lot.revoked
        AND NOT public.ai_payment_access_allowed(l.subscription_id)
        AND (SELECT count(*) FROM public.ai_payment_adjustments
             WHERE payment_reference = '{reference}' AND action = 'refund') = 1
      FROM public.ai_credit_ledger l
      JOIN public.ai_payment_credit_lots lot ON lot.id = l.payment_credit_lot_id
      WHERE l.idempotency_key = '{reference}';
    """) == "t", "Refund, immutable usage, and entitlement did not agree"
    if refund_first:
        assert query(f"""
          UPDATE public.ai_credit_ledger SET status = 'released'
          WHERE idempotency_key = '{reference}' RETURNING status;
        """) == "released", "A blocked settlement could not release its reservation"
    print("PASS:", "refund first blocks consumption" if refund_first
          else "settlement first preserves consumed history", flush=True)


if __name__ == "__main__":
    assert os.environ.get("PGHOST") == "127.0.0.1" and os.environ.get("PGDATABASE") == DATABASE
    assert query("SELECT current_database();") == DATABASE
    query("UPDATE public.ai_refund_policy_config SET enabled = true WHERE id;")
    scenario(2, refund_first=True)
    scenario(3, refund_first=False)
