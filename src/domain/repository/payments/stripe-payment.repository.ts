export abstract class StripePaymentRepository {
  abstract findUserById(usuarioId: string): Promise<any>;
}
