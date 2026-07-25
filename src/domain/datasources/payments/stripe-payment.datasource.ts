export abstract class StripePaymentDatasource {
  abstract findUserById(usuarioId: string): Promise<any>;
}
