import type { PushProject, PushSubscriptionInput, PushTarget } from "../../datasources/push/push.datasource";

export abstract class PushRepository {
  abstract saveSubscription(input: PushSubscriptionInput): Promise<void>;
  abstract deleteSubscription(usuarioId: string, endpoint: string): Promise<boolean>;
  abstract countSubscriptions(usuarioId: string): Promise<number>;
  abstract listProjects(projectIds: string[] | null): Promise<PushProject[]>;
  abstract mutedProjects(usuarioId: string): Promise<string[]>;
  abstract setMuted(usuarioId: string, proyectoId: string, muted: boolean): Promise<void>;
  abstract targetsForProject(proyectoId: string): Promise<PushTarget[]>;
  abstract markDelivered(endpoints: string[], at: number): Promise<void>;
  abstract removeEndpoints(endpoints: string[]): Promise<void>;
}

/** What a notice carries to the browser's service worker. */
export interface PushPayload {
  title: string;
  body: string;
  /** Page opened when the notice is clicked. */
  url: string;
  /** Notices with the same tag replace each other on the device. */
  tag: string;
}

/** Sends one notice; "gone" when the browser's subscription no longer exists. */
export abstract class PushSender {
  abstract readonly enabled: boolean;
  abstract readonly publicKey: string;
  abstract send(target: PushTarget, payload: PushPayload): Promise<"ok" | "gone" | "failed">;
}
