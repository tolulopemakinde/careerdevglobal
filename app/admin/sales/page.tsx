"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "../../../lib/supabase-browser";

type LeadRow = { id: string; status: string | null; source: string | null; interest: string | null; created_at: string };
type OrderRow = { id: string; amount: number | string | null; currency: string | null; status: string; paid_at: string | null; created_at: string; service_id: string | null };

const panel: React.CSSProperties = { background: "#fff", border: "1px solid #d7e2ee", borderRadius: 14, padding: 18, minWidth: 0 };
const label: React.CSSProperties = { color: "#5b6b7b", fontSize: 13, fontWeight: 700 };
const number: React.CSSProperties = { color: "#082c54", fontSize: 28, fontWeight: 850, marginTop: 8, overflowWrap: "anywhere" };

function startOfWindow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

export default function SalesRevenueDashboard() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      window.location.href = "/admin/login";
      return;
    }
    const { data: roleData, error: roleError } = await supabase.rpc("get_my_role");
    if (roleError || !["admin", "staff"].includes(roleData?.role) || (roleData?.status && roleData.status !== "active")) {
      setError("Staff/Admin access is required to view sales reporting.");
      setLoading(false);
      return;
    }

    const since = startOfWindow(windowDays);
    const [leadResult, orderResult] = await Promise.all([
      supabase.from("leads").select("id,status,source,interest,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
      supabase.from("orders").select("id,amount,currency,status,paid_at,created_at,service_id").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    ]);
    if (leadResult.error || orderResult.error) {
      setError("Sales data could not be loaded. Check the current access policies and reporting permissions before launch.");
      setLoading(false);
      return;
    }
    setLeads((leadResult.data || []) as LeadRow[]);
    setOrders((orderResult.data || []) as OrderRow[]);
    setRefreshedAt(new Date().toISOString());
    setLoading(false);
  }, [supabase, windowDays]);

  useEffect(() => { void load(); }, [load]);

  const paidOrders = orders.filter((order) => Boolean(order.paid_at) && !["refunded", "cancelled"].includes(order.status));
  const revenueByCurrency = paidOrders.reduce<Record<string, number>>((acc, order) => {
    const currency = (order.currency || "UNSPECIFIED").toUpperCase();
    acc[currency] = (acc[currency] || 0) + Number(order.amount || 0);
    return acc;
  }, {});
  const leadStatuses = leads.reduce<Record<string, number>>((acc, lead) => {
    const status = (lead.status || "unspecified").replaceAll("_", " ");
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const leadSources = leads.reduce<Record<string, number>>((acc, lead) => {
    const source = (lead.source || "unattributed").trim() || "unattributed";
    acc[source] = (acc[source] || 0) + 1;
    return acc;
  }, {});
  const orderStatuses = orders.reduce<Record<string, number>>((acc, order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});
  const money = (currency: string, amount: number) => {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount); }
    catch { return currency + " " + amount.toLocaleString(); }
  };

  return (
    <main style={{ minHeight: "100vh", background: "#f4f7fb", padding: "clamp(16px, 3vw, 32px)", color: "#17324d" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <header style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div>
            <p style={{ ...label, textTransform: "uppercase", letterSpacing: 1.2, margin: "0 0 7px" }}>CareerDev Global · Staff/Admin</p>
            <h1 style={{ color: "#022055", fontSize: "clamp(25px, 4vw, 36px)", lineHeight: 1.15, margin: 0 }}>Sales &amp; Revenue</h1>
            <p style={{ color: "#536779", margin: "9px 0 0", maxWidth: 720 }}>A read-only view of existing lead and order records. Revenue is shown separately by currency and is not a profit figure.</p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            <label htmlFor="sales-window" style={label}>Reporting window</label>
            <select id="sales-window" value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))} style={{ minHeight: 42, borderRadius: 9, border: "1px solid #b8c9d9", padding: "8px 10px", background: "#fff", color: "#17324d" }}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button type="button" onClick={() => void load()} disabled={loading} style={{ minHeight: 42, borderRadius: 9, border: 0, padding: "9px 14px", background: "#022055", color: "#fff", fontWeight: 800, cursor: loading ? "wait" : "pointer" }}>{loading ? "Loading…" : "Refresh"}</button>
          </div>
        </header>

        {error && <div role="alert" style={{ ...panel, borderColor: "#dca7a7", color: "#8a2424", marginBottom: 16 }}>{error}</div>}
        {loading && <p role="status" style={{ color: "#536779" }}>Loading authorized sales records…</p>}

        {!loading && !error && <>
          <section aria-label="Sales metrics" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: 14 }}>
            <div style={panel}><div style={label}>Leads created</div><div style={number}>{leads.length.toLocaleString()}</div><p style={{ color: "#687a8b", fontSize: 12, marginBottom: 0 }}>In selected window</p></div>
            <div style={panel}><div style={label}>Orders created</div><div style={number}>{orders.length.toLocaleString()}</div><p style={{ color: "#687a8b", fontSize: 12, marginBottom: 0 }}>Includes pending and cancelled</p></div>
            <div style={panel}><div style={label}>Orders with paid timestamp</div><div style={number}>{paidOrders.length.toLocaleString()}</div><p style={{ color: "#687a8b", fontSize: 12, marginBottom: 0 }}>Refunded/cancelled excluded</p></div>
            <div style={panel}><div style={label}>Lead-to-paid proxy</div><div style={number}>{leads.length ? (Math.min(100, paidOrders.length / leads.length * 100).toFixed(1) + "%") : "—"}</div><p style={{ color: "#687a8b", fontSize: 12, marginBottom: 0 }}>Directional only; not cohort-attributed</p></div>
          </section>

          <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, marginTop: 14 }}>
            <div style={panel}>
              <h2 style={{ margin: "0 0 12px", color: "#022055", fontSize: 19 }}>Collected-order value by currency</h2>
              {Object.keys(revenueByCurrency).length ? Object.entries(revenueByCurrency).sort(([a],[b]) => a.localeCompare(b)).map(([currency, amount]) => <div key={currency} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid #e6edf4", padding: "12px 0" }}><span>{currency}</span><strong>{money(currency, amount)}</strong></div>) : <p style={{ color: "#687a8b" }}>No qualifying paid orders found in this window.</p>}
              <p style={{ color: "#687a8b", fontSize: 12, marginBottom: 0 }}>Uses existing order amount/currency and paid_at fields. Verify payment reconciliation and refunds before launch.</p>
            </div>
            <div style={panel}>
              <h2 style={{ margin: "0 0 12px", color: "#022055", fontSize: 19 }}>Lead status breakdown</h2>
              {Object.entries(leadStatuses).sort((a,b) => b[1] - a[1]).map(([status, count]) => <div key={status} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid #e6edf4", padding: "10px 0", textTransform: "capitalize" }}><span>{status}</span><strong>{count}</strong></div>)}
              {!leads.length && <p style={{ color: "#687a8b" }}>No leads found in this window.</p>}
            </div>
            <div style={panel}>
              <h2 style={{ margin: "0 0 12px", color: "#022055", fontSize: 19 }}>Lead source attribution</h2>
              {Object.entries(leadSources).sort((a,b) => b[1] - a[1]).map(([source, count]) => <div key={source} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid #e6edf4", padding: "10px 0" }}><span style={{ overflowWrap: "anywhere" }}>{source}</span><strong>{count}</strong></div>)}
              {!leads.length && <p style={{ color: "#687a8b" }}>No lead-source records found.</p>}
            </div>
            <div style={panel}>
              <h2 style={{ margin: "0 0 12px", color: "#022055", fontSize: 19 }}>Order status breakdown</h2>
              {Object.entries(orderStatuses).sort((a,b) => b[1] - a[1]).map(([status, count]) => <div key={status} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid #e6edf4", padding: "10px 0", textTransform: "capitalize" }}><span>{status.replaceAll("_", " ")}</span><strong>{count}</strong></div>)}
              {!orders.length && <p style={{ color: "#687a8b" }}>No orders found in this window.</p>}
            </div>
          </section>

          <div style={{ ...panel, marginTop: 14 }}>
            <h2 style={{ margin: "0 0 8px", color: "#022055", fontSize: 18 }}>Data quality and launch notes</h2>
            <ul style={{ paddingLeft: 21, lineHeight: 1.7, marginBottom: 0 }}>
              <li>This page does not create, edit, export, or message any lead or customer.</li>
              <li>The lead-to-paid figure is a directional comparison of counts, not a true cohort conversion rate until lead-to-order attribution is connected.</li>
              <li>Revenue is separated by currency; currencies are not combined into one total.</li>
              <li>Payment settlement, refunds/chargebacks, delivery costs, and ad spend are not all represented in this first view, so this is not a profit dashboard.</li>
              <li>If access policies prevent authorized staff from reading records, fix and test policies through a reviewed change; do not weaken security to make the page load.</li>
            </ul>
          </div>
        </>}

        <footer style={{ color: "#687a8b", fontSize: 12, marginTop: 16 }}>
          {refreshedAt ? "Last refreshed " + new Date(refreshedAt).toLocaleString() : "Waiting for first refresh"} · Launch activation remains separate from this reporting view.
        </footer>
      </div>
    </main>
  );
}
