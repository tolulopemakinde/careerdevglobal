# Career Intelligence pilot access

## Scope

The pilot access change covers the five `works_without_ai` agents and six `ai_optional` agents in the Client/Coach registry. The six `ai_required` agents remain excluded. The pilot does not create a subscription, billing record, or customer AI credits.

## Activation and expiry

The migration creates one pilot settings row with access disabled. An active admin can enable the pilot for a bounded period of up to three months and an explicit list of 1–200 participant profile UUIDs:

```sql
select public.configure_ai_agent_pilot(
  true,
  now() + interval '3 months',
  array['<client-or-coach-profile-uuid>']::uuid[]
);
```

Use `false` to pause pilot access immediately:

```sql
select public.configure_ai_agent_pilot(false, null, '{}'::uuid[]);
```

Expiry also closes access automatically. Only active Client/Coach profiles on the participant list receive pilot entitlement. Agent keys are fixed to the 11 pilot agents; the settings table is not directly accessible to browser roles. The configuration RPC is admin-only.

## Runtime behavior

- No-AI agents return and save their deterministic structured baseline without making a provider request or reserving credits.
- AI-optional agents can use the AI path only when a normal subscription credit reservation succeeds. When the account has no eligible credits, the provider key is missing, a provider request fails, or the provider returns an error, the runtime saves a structured baseline and keeps coach/human review enabled.
- AI-required agents are never included by pilot access and continue to require their normal entitlement and provider configuration.
- The standalone Career Research entry point uses the same entitlement RPC. When pilot credits are unavailable, it saves a source-free structured baseline for coach/human review and makes no Groq request.
- Agent and certification statuses are not changed by this migration; they remain in testing until the required evidence is independently completed.

## Deployment verification still required

The SQL migration has not been applied to production or to the protected populated test project. Validate the migration and RPC behavior against a disposable database before applying it. Production remains unchanged.

The current tests are source-contract and synthetic workflow tests. They do not prove live database policy behavior, Groq/OpenAI credentials, provider quotas, external research source quality, or complete browser flows.
