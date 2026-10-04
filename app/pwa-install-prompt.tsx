"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "careerdev:pwa-install-dismissed";
const DISMISS_DAYS = 7;

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function wasDismissedRecently() {
  try {
    const value = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return value > Date.now() - DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return;

    const iosDevice = isIOS();
    setIos(iosDevice);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // iOS has no beforeinstallprompt event; show a lightweight installation guide.
    if (iosDevice) {
      const timer = window.setTimeout(() => setVisible(true), 1800);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setVisible(false);
  };

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="pwa-install-overlay" role="dialog" aria-modal="true" aria-labelledby="pwa-install-title">
      <div className="pwa-install-card">
        <button className="pwa-install-close" type="button" onClick={dismiss} aria-label="Close app installation prompt">×</button>
        <div className="pwa-install-icon" aria-hidden="true">CD</div>
        <p className="pwa-install-eyebrow">CAREERDEV GLOBAL APP</p>
        <h2 id="pwa-install-title">Take CareerDev Global with you</h2>
        <p className="pwa-install-copy">Get faster access to Career Intelligence, career tools, coaches and professional development services from your phone or tablet.</p>

        {ios ? (
          <div className="pwa-ios-guide">
            <strong>Install on iPhone or iPad</strong>
            <ol>
              <li>Tap the <b>Share</b> button in Safari.</li>
              <li>Select <b>Add to Home Screen</b>.</li>
              <li>Tap <b>Add</b> to place CareerDev Global on your device.</li>
            </ol>
          </div>
        ) : (
          <button className="pwa-install-button" type="button" onClick={install}>Install CareerDev Global</button>
        )}

        <button className="pwa-later-button" type="button" onClick={dismiss}>Maybe later</button>
        <p className="pwa-install-note">Free to install. Your existing CareerDev Global account and data stay connected to the platform.</p>
      </div>
    </div>
  );
}
