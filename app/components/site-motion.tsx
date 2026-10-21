"use client";

import { useEffect } from "react";

const MOTION_TARGETS = [
  "main .card",
  "main .feature-card",
  "main .audience-card",
  "main .service-card",
  "main .pricing-card",
  "main .career-insight-card",
  "main .cdg-account-card",
  "main .blog-card",
  "main .blog-featured",
  "main .article-wrap",
  "main .notice-card",
  "main .conditions-grid > *",
  "main .journey-steps > div",
  "main .status-grid > div",
  "main .booking-card",
  "main .offering-card",
  "main .dash-card",
  "main .admin-kpi-card",
  "main .admin-insight-grid > section",
  "main .admin-bottom-grid > section",
  "main .admin-content-list",
  "main .admin-alert-list",
  ".ci-page #profile .profile-item",
  ".ci-page #workflow .workflow-step",
  ".ci-page #systems .system-card",
  ".ci-page .ci-card",
  ".ci-page .control-panel",
  ".ci-page .ci-result",
  "main .motion-reveal",
].join(",");

export default function SiteMotion() {
  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>(MOTION_TARGETS);

    if (!("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("cdg-scroll-motion", "cdg-scroll-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("cdg-scroll-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" },
    );

    const observed = new WeakSet<Element>();
    const observeTargets = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(MOTION_TARGETS).forEach((target) => {
        if (observed.has(target)) return;
        observed.add(target);
        target.classList.add("cdg-scroll-motion");
        observer.observe(target);
      });
    };

    observeTargets(document);

    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            if (node.matches(MOTION_TARGETS)) {
              node.classList.add("cdg-scroll-motion");
              observed.add(node);
              observer.observe(node);
            }
            observeTargets(node);
          }
        });
      });
    });

    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, []);

  return null;
}
