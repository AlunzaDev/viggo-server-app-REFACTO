import webpush from "web-push";
import type { PushTarget } from "../../domain/datasources/push/push.datasource";
import { PushSender, type PushPayload } from "../../domain/repositories/push/push.repository";

/** Notices expire if the browser has not picked them up within this time. */
const TTL_SECONDS = 60 * 60;

/** Push notices through the browsers' push services, signed with the VAPID keys (REFACTO#65). */
export class WebPushSender extends PushSender {
  readonly enabled: boolean;

  constructor(
    readonly publicKey: string,
    private readonly privateKey: string,
    private readonly subject: string,
  ) {
    super();
    this.enabled = Boolean(publicKey && privateKey && subject);
  }

  async send(target: PushTarget, payload: PushPayload): Promise<"ok" | "gone" | "failed"> {
    if (!this.enabled) return "failed";
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        JSON.stringify(payload),
        { TTL: TTL_SECONDS, urgency: "high", topic: payload.tag.slice(0, 32), vapidDetails: { subject: this.subject, publicKey: this.publicKey, privateKey: this.privateKey } },
      );
      return "ok";
    } catch (error) {
      // 404 / 410: the browser unsubscribed or the subscription expired.
      const status = (error as { statusCode?: number }).statusCode;
      return status === 404 || status === 410 ? "gone" : "failed";
    }
  }
}
