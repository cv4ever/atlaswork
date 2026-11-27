// Sends push notifications (agents-design D55): the routines function for what a run posted, the agent function for
// a reply it landed after its page had gone (D72). `rpc` calls Postgres with the service role.
import * as webpush from "jsr:@negrel/webpush@0.5.0";
import { inQuietHours, payloadOf } from "./push.ts";
import type { Post } from "./run.ts";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Subscription = { endpoint: string; p256dh: string; auth: string; quiet_from: number; quiet_to: number };
export type Pushed = Omit<Post, "kind"> & Partial<Pick<Post, "kind">> & { title?: string };

/** `vapidKeys` is the function secret VAPID_KEYS (the JWK pair); without it nothing is sent. */
export function createPushes(rpc: Rpc, vapidKeys: string) {
  let pushServer: Promise<webpush.ApplicationServer> | undefined;
  const server = () => pushServer ??= webpush.importVapidKeys(JSON.parse(vapidKeys), { extractable: false })
    .then((keys) => webpush.ApplicationServer.new({ contactInformation: "mailto:hello@atlaswork.app", vapidKeys: keys }));
  /**
   * One push per post to each of the account's devices, outside quiet hours on `timeZone`'s clock; a device the push
   * service has forgotten is dropped. Returns how many went out.
   */
  return async function notify(user: string, timeZone: string, posts: Pushed[]) {
    const devices = await rpc("pushes_of", { p_user: user }) as Subscription[];
    if (!devices.length || !vapidKeys || inQuietHours(timeZone, new Date(), devices[0].quiet_from, devices[0].quiet_to)) return 0;
    let sent = 0;
    for (const device of devices) {
      const subscriber = (await server()).subscribe({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } });
      for (const post of posts) {
        try {
          // Twelve hours: a phone that was off still hears about this morning's check-in, not last week's.
          await subscriber.pushTextMessage(JSON.stringify(payloadOf(post)), { ttl: 12 * 3600 });
          sent++;
        } catch (cause) {
          if (cause instanceof webpush.PushMessageError && cause.isGone()) {
            await rpc("drop_push", { p_endpoint: device.endpoint });
            break;
          }
          console.warn(`a push failed: ${cause instanceof Error ? cause.message.slice(0, 120) : "unexpected error"}`);
        }
      }
    }
    return sent;
  };
}
