export default function OfflinePage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#022055", color: "#fff", textAlign: "center" }}>
      <div style={{ maxWidth: 520 }}>
        <p style={{ fontWeight: 800, letterSpacing: ".12em", fontSize: 12, opacity: .8 }}>CAREERDEV GLOBAL</p>
        <h1 style={{ color: "#fff", fontSize: "clamp(36px, 8vw, 56px)", lineHeight: 1.05, margin: "12px 0" }}>You’re offline</h1>
        <p style={{ color: "rgba(255,255,255,.86)", lineHeight: 1.7 }}>Reconnect to the internet and try again. Your CareerDev Global app will return you to the platform when connectivity is restored.</p>
        <a href="/" style={{ display: "inline-flex", marginTop: 18, padding: "12px 18px", borderRadius: 999, background: "#fff", color: "#022055", fontWeight: 800 }}>Try again</a>
      </div>
    </main>
  );
}
