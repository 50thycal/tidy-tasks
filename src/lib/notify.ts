/**
 * Browser notification utilities for Tidy Tasks
 * Client-side only, no server/push
 */

export type PermissionStatus = "default" | "granted" | "denied";

/**
 * Get current notification permission status
 */
export function getPermission(): PermissionStatus {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }
  return Notification.permission as PermissionStatus;
}

/**
 * Request notification permission from user
 */
export async function requestPermission(): Promise<PermissionStatus> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "denied";
  }

  try {
    const permission = await Notification.requestPermission();
    return permission as PermissionStatus;
  } catch (error) {
    console.error("Error requesting notification permission:", error);
    return "denied";
  }
}

/**
 * Show a browser notification
 */
export function notify(
  title: string,
  body: string,
  options?: NotificationOptions
): void {
  if (typeof window === "undefined" || !("Notification" in window)) {
    console.warn("Notifications not supported");
    return;
  }

  if (Notification.permission !== "granted") {
    console.warn("Notification permission not granted");
    return;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      ...options,
    });

    // Focus tab when notification clicked
    notification.onclick = () => {
      window.focus();
      if (options?.data?.url) {
        window.location.href = options.data.url;
      }
    };
  } catch (error) {
    console.error("Error showing notification:", error);
  }
}

/**
 * Show in-app digest toast (fallback when notifications are disabled)
 */
export function showInAppToast(message: string, duration: number = 5000): void {
  if (typeof window === "undefined") return;

  // Create toast element
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 2rem;
    right: 2rem;
    background: var(--accent);
    color: white;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    z-index: 10000;
    max-width: 400px;
    font-size: 0.9rem;
    animation: slideIn 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  // Auto remove after duration
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 0.3s ease-out";
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, duration);
}

/**
 * Check if notification banner should be shown
 */
export function shouldShowBanner(): boolean {
  if (typeof window === "undefined") return false;

  // Don't show if dismissed
  const dismissed = localStorage.getItem("tidy.notify.dismissed");
  if (dismissed === "true") return false;

  // Don't show if permission already granted or denied
  const permission = getPermission();
  if (permission === "granted" || permission === "denied") return false;

  return true;
}

/**
 * Dismiss the notification banner
 */
export function dismissBanner(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("tidy.notify.dismissed", "true");
}

/**
 * Clear dismissed flag (called when user enables notifications in settings)
 */
export function clearDismissed(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("tidy.notify.dismissed");
}
