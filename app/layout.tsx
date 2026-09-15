import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareerDev Global | Unleashing Your Potential",
  description:
    "Career development, leadership development, and global talent mobility powered by human expertise and AI-enabled career intelligence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
