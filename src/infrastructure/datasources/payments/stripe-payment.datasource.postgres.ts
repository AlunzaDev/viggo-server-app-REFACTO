import { PostgresDatabase } from "../../../data/postgres";
import { StripePaymentDatasource } from "../../../domain/datasources/payments/stripe-payment.datasource";
import { isUuid } from "../postgres/prisma-errors";

export class StripePaymentPostgresDatasource implements StripePaymentDatasource {
  /** Name and email of the payer, used to find or create the Stripe customer. */
  async findUserById(usuarioId: string) {
    if (!isUuid(usuarioId)) return null;
    return PostgresDatabase.client.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, nombre: true, apellido: true, correo: true },
    });
  }
}
