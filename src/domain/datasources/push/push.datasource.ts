/** Where a push notice goes: one browser of one user. */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionInput extends PushTarget {
  usuarioId: string;
  userAgent: string;
}

export interface PushProject {
  proyectoId: string;
  nombre: string;
  zonaHoraria: string;
}

export abstract class PushDatasource {
  /** Saves a browser's subscription; an endpoint already saved moves to this user. */
  abstract saveSubscription(input: PushSubscriptionInput): Promise<void>;
  /** Removes one of the user's subscriptions; false when it was not theirs. */
  abstract deleteSubscription(usuarioId: string, endpoint: string): Promise<boolean>;
  abstract countSubscriptions(usuarioId: string): Promise<number>;
  abstract listProjects(projectIds: string[] | null): Promise<PushProject[]>;
  abstract mutedProjects(usuarioId: string): Promise<string[]>;
  abstract setMuted(usuarioId: string, proyectoId: string, muted: boolean): Promise<void>;
  /**
   * The browsers to notify about a parking: active users of ADMIN web who can see it (super
   * users, or assigned with the projects or installations module) and did not mute it.
   */
  abstract targetsForProject(proyectoId: string): Promise<PushTarget[]>;
  abstract markDelivered(endpoints: string[], at: number): Promise<void>;
  /** Subscriptions the push service said no longer exist. */
  abstract removeEndpoints(endpoints: string[]): Promise<void>;
}
