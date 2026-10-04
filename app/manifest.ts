import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CareerDev Global",
    short_name: "CareerDev",
    description: "Career development, leadership development and global talent mobility powered by human expertise and AI-enabled career intelligence.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#022055",
    theme_color: "#022055",
    lang: "en",
    categories: ["education", "business", "productivity"],
    icons: [
      { src: "/S1.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/S1.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ],
    shortcuts: [
      { name: "Career Intelligence", short_name: "Career Intelligence", url: "/career-intelligence", icons: [{ src: "/S1.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "Find a Coach", short_name: "Find a Coach", url: "/coach-matching", icons: [{ src: "/S1.svg", sizes: "any", type: "image/svg+xml" }] },
      { name: "My Account", short_name: "My Account", url: "/account", icons: [{ src: "/S1.svg", sizes: "any", type: "image/svg+xml" }] }
    ]
  };
}
