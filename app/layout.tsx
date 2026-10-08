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
  title: "CareerDev Global | Unleashing Your Potential",
  description: "Career development, leadership development, and global talent mobility powered by human expertise and AI-enabled career intelligence.",
  icons: {
    icon: [{ url: "/S1.svg", type: "image/svg+xml" }],
    shortcut: [{ url: "/S1.svg", type: "image/svg+xml" }],
    apple: [{ url: "/S1.svg", type: "image/svg+xml" }],
  },
  appleWebApp: { capable: true, title: "CareerDev Global", statusBarStyle: "black-translucent" },
  manifest: "/manifest.webmanifest",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (<html lang="en"><body><a className="skip-link" href="#services">Skip to content</a><SiteHeader /><NavigationEnhancements /><PwaInstallPrompt />{children}<SiteFooter /><a className="ai-career-intelligence-fab" href="/career-intelligence" style={{position:"fixed",right:20,bottom:20,zIndex:50,padding:"13px 17px",borderRadius:999,background:"#0879ad",color:"#fff",textDecoration:"none",fontWeight:800,fontSize:13,boxShadow:"0 10px 30px rgba(0,70,110,.25)"}}>✦ AI Career Intelligence</a></body></html>);
}