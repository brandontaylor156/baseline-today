"use client";

import { useEffect, useState } from "react";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on" | "busy";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const save = (sub: PushSubscription) =>
  fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });

/** Opt-in for result notifications about the signed-in user's favorites. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: State;
      if (!supported) {
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
        next = ios && !window.matchMedia("(display-mode: standalone)").matches ? "ios-install" : "unsupported";
      } else if (Notification.permission === "denied") {
        next = "denied";
      } else {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        // Keep the server copy in step (e.g. after signing in with another account here).
        if (sub) void save(sub);
        next = sub ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })().catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setState("busy");
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const res = await save(sub);
      if (!res.ok) {
        await sub.unsubscribe();
        throw new Error();
      }
      setState("on");
    } catch {
      setError("Couldn’t turn on notifications. Try again.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("busy");
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError("Couldn’t turn off notifications. Try again.");
      setState("on");
    }
  }

  if (state === "loading") return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-surface p-4">
      <div className="min-w-0 flex-1 basis-60">
        <p className="font-medium">Result notifications</p>
        <p className="text-sm text-muted">
          {state === "ios-install"
            ? "On iPhone or iPad, add Baseline Today to your Home Screen first (Share → Add to Home Screen), then open it from there."
            : state === "unsupported"
              ? "This browser can’t show notifications."
              : state === "denied"
                ? "Notifications are blocked for this site. Allow them in your browser’s site settings."
                : state === "on"
                  ? "On for this device: you’ll hear when your favorites finish a match."
                  : "Get a notification on this device when your favorites finish a match."}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
      {(state === "off" || state === "on" || state === "busy") && (
        <button
          type="button"
          onClick={state === "on" ? turnOff : turnOn}
          disabled={state === "busy"}
          className={`rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-60 ${state === "on" ? "border-border bg-surface hover:bg-surface-muted" : "border-accent bg-accent text-background"}`}
        >
          {state === "busy" ? "Working…" : state === "on" ? "Turn off" : "Turn on"}
        </button>
      )}
    </div>
  );
}
