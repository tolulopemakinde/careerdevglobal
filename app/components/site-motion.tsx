"use client";

import { useEffect } from "react";

const MOTION_TARGETS = [
  ".card",
  ".feature-card",
  ".audience-card",
  ".service-card",
  ".pricing-card",
  ".career-insight-card",
  ".cdg-account-card",
  ".blog-card",
  ".blog-featured",
  ".article-wrap",
  ".notice-card",
  ".conditions-grid > *",
  ".journey-steps > div",
  ".status-grid > div",
  ".booking-card",
  ".offering-card",
  ".dash-card",
  ".admin-kpi-card",
  ".admin-insight-grid > section",
  ".admin-bottom-grid > section",
  ".admin-content-list",
  ".admin-alert-list",
  "#profile .profile-item",
  ".workflow .workflow-step",
  ".systems-grid .system-card",
  ".ci-page .ci-card",
  ".ci-page .control-panel",
  ".ci-page .ci-result",
  ".motion-reveal",
  '[data-cdg-motion="agent-card"]',
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
