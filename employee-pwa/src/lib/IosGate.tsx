import { useEffect, useState, type ReactNode } from "react";
import { subscribeToPush } from "./push";
import { reportAlarmStatus } from "./supabase";
import { Share, SquarePlus, Bell } from "lucide-react";

function isIOS(): boolean {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  // iPadOS 13+ reports as "MacIntel" but is touch-capable — a real Mac isn't.
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches
  );
}

function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

/**
 * iOS-only gate: employees cannot disable reminders (PLAN.md). Blocks until the
 * PWA is installed to the home screen and notification permission is granted.
 * Non-iOS browsers (desktop dev, Android via the native app) pass straight through.
 */
export default function IosGate({
  employeeId,
  children,
}: {
  employeeId: string;
  children: ReactNode;
}) {
  const [ios] = useState(isIOS);
  const [standalone] = useState(isStandalone);
  const [permission, setPermission] = useState(notificationPermission);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!ios) return;
    reportAlarmStatus(employeeId, standalone && permission === "granted").catch(() => {
      // Reporting is best-effort — never block the gate on it.
    });
  }, [ios, standalone, permission, employeeId]);

  if (!ios) return <>{children}</>;

  if (!standalone) {
    return (
      <div className="screen-center gate-screen">
        <SquarePlus size={48} className="icon-muted" />
        <h2>Add to Home Screen</h2>
        <p>Reminders only work when this app is installed. Please:</p>
        <ol className="gate-steps">
          <li>
            Tap <Share size={14} className="inline-icon" /> Share in Safari
          </li>
          <li>Choose "Add to Home Screen"</li>
          <li>Open Sales Tracker from your Home Screen icon</li>
        </ol>
      </div>
    );
  }

  if (permission !== "granted") {
    return (
      <div className="screen-center gate-screen">
        <Bell size={48} className="icon-muted" />
        <h2>Allow Notifications</h2>
        <p>
          Reminders are required so you never miss a goal or achievement deadline.
          {permission === "denied" && " Enable Notifications for this app in iOS Settings, then reopen it."}
        </p>
        {permission !== "denied" && (
          <button
            className="btn-primary"
            disabled={requesting}
            onClick={async () => {
              setRequesting(true);
              await subscribeToPush(employeeId);
              setPermission(notificationPermission());
              setRequesting(false);
            }}
          >
            {requesting ? "Requesting..." : "Allow Notifications"}
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
