// Requests of the mobile app that become commands for a parking's OPERATIVO.

/** The app's Idempotency-Key: the same key always gets the same answer. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{16,128}$/;
const text = (value: unknown) => String(value ?? "").trim();
const isKey = (value: string) => IDEMPOTENCY_KEY.test(value);

/** Entry: the scanned entry QR and the parking the app detected by GPS. */
export class CreateMobileTicketDto {
  private constructor(
    public readonly idempotencyKey: string,
    public readonly moduleToken: string,
    public readonly projectId: string,
  ) {}

  static create(idempotencyKey: unknown, body: Record<string, unknown> = {}): [string?, CreateMobileTicketDto?] {
    const key = text(idempotencyKey), moduleToken = text(body.moduleToken), projectId = text(body.projectId);
    if (!isKey(key)) return ["Idempotency-Key invalida"];
    if (!moduleToken) return ["moduleToken es requerido"];
    if (!projectId) return ["projectId es requerido"];
    return [undefined, new CreateMobileTicketDto(key, moduleToken, projectId)];
  }
}

/** Opening an entry or exit with the user's Pension Pass. */
export class PensionPassAccessDto {
  private constructor(
    public readonly idempotencyKey: string,
    public readonly pensionPassId: string,
    public readonly moduleToken: string,
    public readonly projectId: string,
  ) {}

  static create(idempotencyKey: unknown, pensionPassId: unknown, body: Record<string, unknown> = {}): [string?, PensionPassAccessDto?] {
    const key = text(idempotencyKey), moduleToken = text(body.moduleToken), projectId = text(body.projectId);
    if (!isKey(key)) return ["Idempotency-Key invalida"];
    if (!moduleToken || !projectId) return ["projectId y moduleToken son requeridos"];
    return [undefined, new PensionPassAccessDto(key, text(pensionPassId), moduleToken, projectId)];
  }
}

/** Exit: the scanned exit QR and the detected parking. */
export class ExitMobileTicketDto {
  private constructor(
    public readonly idempotencyKey: string,
    public readonly moduleToken: string,
    public readonly projectId: string,
  ) {}

  static create(idempotencyKey: unknown, body: Record<string, unknown> = {}): [string?, ExitMobileTicketDto?] {
    const key = text(idempotencyKey), moduleToken = text(body.moduleToken), projectId = text(body.projectId);
    if (!isKey(key) || !moduleToken || !projectId) return ["Idempotency-Key, projectId y moduleToken son requeridos"];
    return [undefined, new ExitMobileTicketDto(key, moduleToken, projectId)];
  }
}

/** A card payment for a ticket. */
export class TicketPaymentIntentDto {
  private constructor(
    public readonly idempotencyKey: string,
    public readonly ticketId: string,
  ) {}

  static create(idempotencyKey: unknown, ticketId: unknown): [string?, TicketPaymentIntentDto?] {
    const key = text(idempotencyKey);
    if (!isKey(key)) return ["Idempotency-Key invalida"];
    return [undefined, new TicketPaymentIntentDto(key, text(ticketId))];
  }
}

/** A page of the user's history, optionally between two instants (ms). */
export class MobileHistoryQueryDto {
  private constructor(
    public readonly page: number,
    public readonly limit: number,
    public readonly from?: number,
    public readonly to?: number,
  ) {}

  static create(query: Record<string, unknown>): MobileHistoryQueryDto {
    const finite = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : undefined);
    return new MobileHistoryQueryDto(
      Math.max(1, Number(query.page) || 1),
      Math.min(100, Math.max(1, Number(query.limit) || 10)),
      finite(query.from),
      finite(query.to),
    );
  }
}
