import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import "./responsive.css";
import "./site-pages.css";
import NavigationEnhancements from "./navigation-enhancements";
import SiteHeader from "./components/site-header";
import SiteFooter from "./components/site-footer";
import PwaInstallPrompt from "./pwa-install-prompt";

export const metadata: Metadata = {
  metadataBase: new URL("https://careerdevglobal-nine.vercel.app"),
  title: "CareerDev Global | Unleashing Your Potential",
  description: "Career development, leadership development, and global talent mobility powered by human expertise and AI-enabled career intelligence.",
  icons: {
    icon: [{ url: "/S1.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/S1.svg", type: "image/svg+xml" }],
    apple: [{ url: "/S1.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    type: "website",
    url: "https://careerdevglobal-nine.vercel.app",
    siteName: "CareerDev Global",
    title: "CareerDev Global | Unleashing Your Potential",
    description: "Career development, leadership development, and global talent mobility powered by human expertise and AI-enabled career intelligence.",
    images: [{ url: "/cdg-favicon-social.png", width: 192, height: 192, type: "image/png", alt: "CareerDev Global symbol logo" }],
  },
  twitter: {
    card: "summary",
    title: "CareerDev Global | Unleashing Your Potential",
    description: "Career development, leadership development, and global talent mobility powered by human expertise and AI-enabled career intelligence.",
    images: ["/cdg-favicon-social.png"],
  },
  appleWebApp: { capable: true, title: "CareerDev Global", statusBarStyle: "black-translucent" },
  manifest: "/manifest.webmanifest",
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://careerdevglobal-nine.vercel.app/#organization",
      "name": "CareerDev Global",
      "url": "https://careerdevglobal-nine.vercel.app",
      "logo": {
        "@type": "ImageObject",
        "url": "https://careerdevglobal-nine.vercel.app/S1.svg"
      },
      "slogan": "Unleashing Your Potential",
      "description": "Career development, leadership development, and global talent mobility powered by human expertise and AI-enabled career intelligence."
    },
    {
      "@type": "WebSite",
      "@id": "https://careerdevglobal-nine.vercel.app/#website",
      "url": "https://careerdevglobal-nine.vercel.app",
      "name": "CareerDev Global",
      "description": "Career development, leadership development, and global talent mobility powered by human expertise and AI-enabled career intelligence.",
      "publisher": {
        "@id": "https://careerdevglobal-nine.vercel.app/#organization"
      }
    }
  ]
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
      </head>
      <body>
        <a className="skip-link" href="#services">Skip to content</a>
        <SiteHeader />
        <NavigationEnhancements />
        <PwaInstallPrompt />
        {children}
        <SiteFooter />
        <a className="ai-career-intelligence-fab" href="/career-intelligence" style={{position:"fixed",right:20,bottom:20,zIndex:50,padding:"13px 17px",borderRadius:999,background:"#0879ad",color:"#fff",textDecoration:"none",fontWeight:800,fontSize:13,boxShadow:"0 10px 30px rgba(0,70,110,.25)"}}>✦ AI Career Intelligence</a>
      </body>
    </html>
  );
}
