# AI subscription and Paystack currency audit — 2026-11-24

## Findings

- Production checkout accepted `USD` from the pricing page and immediately tried to create a Paystack plan. It had no merchant currency-availability gate, so Paystack's plan-creation rejection appeared to clients as a generic error.
- Production currently has no USD plan codes saved. Its public plan prices are above Paystack's documented USD and NGN minimum transaction amounts, so the observed USD failure is consistent with merchant currency enablement, not a below-minimum amount.
- The recent production subscription record is `pending` in NGN for the selected annual plan amount. It is not returned by the active-subscription RPC, so a declined checkout does not grant AI access or block a retry. The database does not contain a corresponding recent subscription webhook event.
- “Insufficient funds” is a card/bank issuer decline reported by Paystack Checkout. It is not evidence of an application-side price calculation error. CareerDev Global cannot override the issuer decision; users need a funded payment method.

## Changes in this branch

- Default the pricing page to NGN and hide USD selection unless the public currency setting is enabled.
- Enforce the same USD check inside the authenticated checkout Edge Function. The UI setting alone cannot bypass this server-side guard.
- Add a database setting that starts disabled, can be read by pricing clients, and can be updated only by an active Administrator under RLS. Staff, Coach, and Client roles cannot change it.
- Add a one-click USD enable/disable control in Admin → Payments. The control warns that Paystack merchant approval and settlement documentation must be complete first. Disabling USD blocks new USD checkouts and does not cancel existing subscriptions.
- Preserve a clearer Paystack provider reason in checkout errors; prevent release of a checkout URL if the provider reference cannot be safely stored.
- Explain the insufficient-funds case on pricing and confirm that access is only activated after successful payment verification.

## Provider prerequisite

Paystack's current documentation lists USD as available to Nigerian businesses when USD payments are enabled for the merchant. Paystack support says Nigerian businesses receiving USD payouts need a qualifying Zenith USD domiciliary account; the merchant must also request activation for a non-default currency. Keep the switch off until Paystack confirms the account is enabled and the required documentation is complete.

## Boundaries

This change does not prove a live USD charge, create a live subscription, or change the status of the pending NGN attempt. A bank/card decline must be retried with a funded payment method. USD remains unavailable by default.
