"use client";
import { useEffect, useState } from "react";
import { BellRinging, BellSlash, DeviceMobile } from "@phosphor-icons/react";
import { removePushSubscriptionAction, savePushSubscriptionAction, testPushAction } from "@/app/actions/conflicts.ts";

type State = "loading" | "unsupported" | "ios-home" | "blocked" | "off" | "on";

const toKey = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const deviceName = () => {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Computer";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "browser";
  return `${os} · ${br}`;
};

/** Turns instant double-booking alerts on or off for this phone or computer. */
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      const ios = /iPhone|iPad/.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState(ios && !standalone ? "ios-home" : "unsupported"); return; }
      if (Notification.permission === "denied") { setState("blocked"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setBusy(true); setNote("");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "blocked" : "off"); return; }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
      const r = await savePushSubscriptionAction(JSON.stringify(sub), deviceName());
      setState(r.ok ? "on" : "off");
      setNote(r.ok ? "Alerts are on for this device." : "This device couldn't be saved. Please try again.");
    } catch {
      setNote("This browser couldn't turn alerts on. Try Chrome, Edge, Firefox or Safari.");
    } finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true); setNote("");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await removePushSubscriptionAction(sub.endpoint); await sub.unsubscribe(); }
      setState("off"); setNote("Alerts are off for this device.");
    } finally { setBusy(false); }
  }
  async function test() {
    setBusy(true);
    try { setNote((await testPushAction()).text); } finally { setBusy(false); }
  }

  return (
    <div className="cf-push" data-state={state}>
      <div className="cf-push-head">
        {state === "on" ? <BellRinging size={22} weight="bold" aria-hidden /> : state === "blocked" || state === "unsupported" ? <BellSlash size={22} weight="bold" aria-hidden /> : <DeviceMobile size={22} weight="bold" aria-hidden />}
        <div>
          <b>Phone and computer alerts</b>
          <p className="hint">
            {state === "loading" && "Checking this device…"}
            {state === "on" && "On for this device. A notification appears the moment a double booking is found."}
            {state === "off" && "Get a notification on this device the moment a double booking is found."}
            {state === "blocked" && "Notifications are blocked for sevgio.com in this browser's settings. Allow them there, then reload this page."}
            {state === "ios-home" && "On iPhone and iPad: tap Share, then Add to Home Screen, open Sevgio from the new icon, and turn alerts on here."}
            {state === "unsupported" && "This browser can't show alerts from websites. Email alerts still arrive."}
          </p>
        </div>
      </div>
      <div className="row">
        {state === "off" && <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={turnOn}>{busy ? "Turning on…" : "Turn on alerts"}</button>}
        {state === "on" && <>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={test}>Send a test</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={turnOff}>Turn off on this device</button>
        </>}
      </div>
      {note && <p className="hint" role="status">{note}</p>}
    </div>
  );
}
