export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container nav-wrap">
        <a className="brand" href="/" aria-label="CareerDev Global home">
          <span className="brand-logo-mark" aria-hidden="true">CD</span>
          <span className="brand-logo-text">CareerDev Global</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="/#services">Services</a>
          <a href="/#coaching">Coaching</a>
          <a href="/pricing">Pricing</a>
          <a href="/#about">About</a>
          <a className="nav-cta" href="/account">Get Started</a>
        </nav>
      </div>
    </header>
  );
}
