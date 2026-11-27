// This device's push notifications for what routines post while the app is closed (agents-design D55). Turning them on
// asks the browser's permission, subscribes the installed app's service worker with the VAPID public key and stores
// the subscription in the account (`save_push`); turning them off unsubscribes and forgets it. iPhones offer push only
// to the app added to the home screen, so elsewhere `pushState` says why it can't.
import type { Backend } from "./cloud.ts";

const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushState = "on" | "off" | "blocked" | "unsupported";

export function pushSupported() {
  return !!publicKey && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** On when this device has a subscription and permission; blocked when the browser refuses to ask again. */
export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

/** The URL-safe base64 key as the bytes PushManager wants. */
function keyBytes(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

/** Asks, subscribes and stores. Returns the state it ended in; throws when the account refuses the subscription. */
export async function enablePush(backend: Pick<Backend, "rpc">): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (await Notification.requestPermission() !== "granted") return Notification.permission === "denied" ? "blocked" : "off";
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription()
    ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey!) });
  const { endpoint, keys } = subscription.toJSON();
  await backend.rpc("save_push", { p_endpoint: endpoint, p_p256dh: keys?.p256dh, p_auth: keys?.auth });
  return "on";
}

export async function disablePush(backend: Pick<Backend, "rpc">): Promise<PushState> {
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await backend.rpc("forget_push", { p_endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return "off";
}
