import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { StripePaymentDatasource } from "../../../domain/datasources/payments/stripe-payment.datasource";

export class StripePaymentMongoDatasource implements StripePaymentDatasource {
  findUserById(usuarioId: string) {
    return UsuarioModel.findById(usuarioId);
  }
}
