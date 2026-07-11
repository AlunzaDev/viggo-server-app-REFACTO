export class ConfirmTicketPaymentDto {
  private constructor(public readonly paymentIntentId: string) {}

  static create(body: Record<string, unknown>): [string?, ConfirmTicketPaymentDto?] {
    const paymentIntentId =
      typeof body.paymentIntentId === "string"
        ? body.paymentIntentId.trim()
        : "";

    if (!paymentIntentId) return ["'paymentIntentId' es requerido"];

    return [undefined, new ConfirmTicketPaymentDto(paymentIntentId)];
  }
}
