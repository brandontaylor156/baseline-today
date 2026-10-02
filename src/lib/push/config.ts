import "server-only";

import { SITE_URL } from "@/lib/site";

/** VAPID keys for web push; push is off until both are set (scripts/push-keys.mjs). */
export function pushConfig(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  // Push services may contact the subject about abuse; the site address keeps emails private.
  return { publicKey, privateKey, subject: SITE_URL };
}
