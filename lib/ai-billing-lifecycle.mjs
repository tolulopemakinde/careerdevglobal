// Pure lifecycle rules; no provider calls or database writes.
export const VALID_STATUSES = new Set(["pending","active","non_renewing","attention","cancelled","expired"]);
export function nextSubscriptionStatus(current, event, invoiceStatus="", paidThrough=null, now=Date.now()) {
  if (!VALID_STATUSES.has(current)) throw new Error("Invalid subscription status");
  if (current==="cancelled" || current==="expired") return current;
  if (event==="subscription.disable") return paidThrough && Date.parse(paidThrough)>now ? "non_renewing" : "cancelled";
  if (event==="subscription.not_renew") return "non_renewing";
  if (current==="non_renewing") return current;
  if (event==="invoice.payment_failed" || (event==="invoice.update" && invoiceStatus==="failed")) return "attention";
  if (event==="subscription.create" || event==="charge.success" || (event==="invoice.update" && ["paid","success"].includes(invoiceStatus))) return "active";
  return current;
}
export function resolveSubscriptionIdentity(byReference, byCode) {
  if (byReference && byCode && byReference.id!==byCode.id) throw new Error("Conflicting subscription identifiers");
  return byReference ?? byCode ?? null;
}
