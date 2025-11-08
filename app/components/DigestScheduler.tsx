"use client";

import { useEffect } from "react";
import { getWorkSettings } from "@/src/lib/settings";
import { scheduleDaily, needsCatchUp } from "@/src/lib/schedule";
import { buildDigest, formatNotificationTitle, formatNotificationBody } from "@/src/lib/digest";
import { notify } from "@/src/lib/notify";
import { saveDigest, getLastDigestDate } from "@/src/db/digest";
import { getInboxItems } from "@/src/lib/clientStore";
import { getPermission } from "@/src/lib/notify";

/**
 * Component that handles daily digest scheduling
 * Mount this once in the root layout
 */
export default function DigestScheduler() {
  useEffect(() => {
    const settings = getWorkSettings();

    // Only run if notifications are enabled
    if (!settings.notifications?.enabled) {
      console.log("[DigestScheduler] Notifications not enabled, skipping");
      return;
    }

    const digestTime = settings.notifications.digestTime || "09:00";
    const timezone = settings.timezone || "America/Phoenix";

    // Function to generate and send digest
    const sendDigest = () => {
      console.log("[DigestScheduler] Generating digest...");

      const items = getInboxItems();
      const now = new Date();
      const digest = buildDigest(now, settings, items);

      // Save digest
      saveDigest(digest);

      // Send notification if permission granted
      const permission = getPermission();
      if (permission === "granted") {
        const title = formatNotificationTitle(digest);
        const body = formatNotificationBody(digest);
        notify(title, body, {
          data: { url: "/review?digest=today" },
        });
        console.log("[DigestScheduler] Digest notification sent");
      } else {
        console.log("[DigestScheduler] Notification permission not granted, digest saved only");
      }
    };

    // Check if we need a catch-up digest
    const lastDigestDate = getLastDigestDate();
    if (needsCatchUp(lastDigestDate, timezone)) {
      console.log("[DigestScheduler] Running catch-up digest");
      sendDigest();
    }

    // Schedule daily digest
    console.log(`[DigestScheduler] Scheduling daily digest at ${digestTime} in ${timezone}`);
    const handle = scheduleDaily(sendDigest, digestTime, timezone);

    // Cleanup on unmount
    return () => {
      handle.cancel();
    };
  }, []);

  // This component doesn't render anything
  return null;
}
