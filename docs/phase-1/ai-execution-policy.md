# AI Execution Policy — Phase 1 Design Contract

## Principle

> **AI prepares; humans decide.**

Prompts, UI copy, and agent names are not authorization controls. The execution state machine and server-side authorization must enforce the policy.

## Proposed states

| State | Meaning | Who may transition into it |
|---|---|---|
| `requested` | User or authorized workflow requested work | Authenticated user or approved system workflow |
| `authorized` | Role, entitlement, ownership, and credit checks passed | Server-side runtime/RPC |
| `processing` | Agent execution is running | Server-side runtime |
| `awaiting_information` | Required user evidence or answers are missing | Runtime/quality gate |
| `awaiting_human_review` | Draft exists but a human must review it | Runtime/quality gate |
| `approved` | Human reviewer approved the output for the allowed use | Authorized staff/coach reviewer |
| `delivered` | Approved output was delivered to the intended user | Server-side delivery workflow |
| `rejected` | Reviewer rejected the output | Authorized staff/coach reviewer |
| `failed` | Execution failed without a deliverable | Server-side runtime |
| `cancelled` | User or authorized operator cancelled the work | Owner or authorized operator |

## Review classes

| Class | Examples | Human review |
|---|---|---|
| `low_risk_assistive` | Formatting, brainstorming, question generation | Optional; output must be labelled AI-assisted |
| `professional_draft` | CV, cover letter, LinkedIn, action plan | Required before client-facing delivery |
| `high_impact_guidance` | Immigration, licensing, regulated-profession, compensation, admission or employer claims | Required; authoritative sources and uncertainty required |
| `marketplace_recommendation` | Coach matching and service suggestions | User retains final choice; explain ranking factors |
| `external_action` | Payment, application submission, publication, role/status change | Never autonomous; explicit authorized action plus audit log |

## Invariants

1. A user cannot execute an agent they are not entitled to use.
2. A client cannot read or mutate another client’s execution, profile, documents, credits, or outputs.
3. A coach can access client data only for an authorized relationship and agreed service scope.
4. A draft cannot become `delivered` unless its review class has satisfied its required review condition.
5. High-impact claims must carry source references, retrieval time, uncertainty, and review status.
6. Retries must be idempotent and must not double-charge credits or duplicate external actions.
7. Every state transition records actor, reason, timestamp, execution id, and request correlation id.
8. A failed external provider call must not be represented as successful delivery.
9. System and user content remain separated; user-provided text is data, not executable instruction.
10. Human approval is an authorization event, not merely a UI acknowledgement.

## Required implementation review

Before changing Supabase functions or policies, compare the deployed state transitions against this contract. The owner must decide whether the current direct non-service runtime path is permitted to mark outputs as completed without human review. This document does not change runtime behavior.
