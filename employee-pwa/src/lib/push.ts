import { supabase } from "./supabase";
import { vapidPublicKey } from "./config";

// Web Push applicationServerKey must be a Uint8Array, VAPID keys are base64url text.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Requests notification permission and (re-)subscribes to Web Push, saving the
 * subscription against this employee. Called on every login/app-open per
 * PLAN.md — re-registering keeps the subscription alive.
 *
 * Push is a nice-to-have reminder channel, never a blocker: any missing
 * capability (no VAPID key configured, browser doesn't support push, iOS PWA
 * not yet added to the home screen, permission denied) fails silently with a
 * console warning, same as the voice-input fallback pattern elsewhere.
 */
export async function subscribeToPush(employeeId: string): Promise<void> {
  if (!vapidPublicKey) {
    console.warn("[Push] No VAPID public key configured, skipping.");
    return;
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    console.warn("[Push] Web Push not supported in this browser.");
    return;
  }

  try {
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        console.warn("[Push] Notification permission not granted.");
        return;
      }
    } else if (Notification.permission !== "granted") {
      console.warn("[Push] Notification permission previously denied.");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    const raw = subscription.toJSON();
    if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) return;

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        employee_id: employeeId,
        endpoint: raw.endpoint,
        p256dh: raw.keys.p256dh,
        auth: raw.keys.auth,
      },
      { onConflict: "employee_id,endpoint" }
    );
    if (error) throw error;
  } catch (err) {
    console.warn("[Push] Subscription failed:", err);
  }
}
