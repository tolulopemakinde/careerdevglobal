import type { Metadata } from "next";
import "./globals.css";
import "./auth.css";
import "./responsive.css";
import "./site-pages.css";
import NavigationEnhancements from "./navigation-enhancements";
import ProfessionalStandardsCarousel from "./professional-standards-carousel";
import SiteFooter from "./components/site-footer";

export const metadata: Metadata = {
  title: "CareerDev Global | Unleashing Your Potential",
  description:
    "Career development, leadership development, and global talent mobility powered by human expertise and AI-enabled career intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#services">Skip to content</a>
        <NavigationEnhancements />
        {children}
        <ProfessionalStandardsCarousel />
        <SiteFooter />
        <a
          className="ai-career-intelligence-fab"
          href="/career-intelligence"
          style={{position:"fixed",right:20,bottom:20,zIndex:50,padding:"13px 17px",borderRadius:999,background:"#0879ad",color:"#fff",textDecoration:"none",fontWeight:800,fontSize:13,boxShadow:"0 10px 30px rgba(0,70,110,.25)"}}
        >
          ✦ AI Career Intelligence
        </a>
      </body>
    </html>
  );
}
