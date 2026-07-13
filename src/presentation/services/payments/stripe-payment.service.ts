import { envs } from "../../../config";
import { UsuarioModel } from "../../../data/mongo/models/auth/usuario.schema";
import { CustomError } from "../../../domain/errors/custom.error";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";

export class StripePaymentService {
  async createPaymentIntent(usuarioId: string, monto: number) {
    if (!Number.isFinite(monto) || monto <= 0) {
      throw CustomError.badRequest("El monto debe ser mayor a 0");
    }

    if (this.useMockStripe()) {
      return {
        paymentIntent: `pi_mock_generic_${Date.now()}_secret_mock`,
        ephemeralKey: "ephkey_mock",
        customer: "cus_mock",
        success: true,
        mock: true,
      };
    }

    const usuario = await UsuarioModel.findById(usuarioId);

    if (!usuario) {
      throw CustomError.notFound("Usuario no encontrado");
    }

    let customerId: string;
    const customerList = await StripePlugin.client.customers.list({
      email: usuario.correo,
      limit: 1,
    });

    if (customerList.data.length > 0) {
      customerId = customerList.data[0].id;
    } else {
      const customer = await StripePlugin.client.customers.create({
        name: `${usuario.nombre} ${usuario.apellido}`,
        email: usuario.correo,
      });
      customerId = customer.id;
    }

    const ephemeralKey = await StripePlugin.client.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2022-08-01" },
    );

    const paymentIntent = await StripePlugin.client.paymentIntents.create({
      amount: Math.round(monto * 100),
      currency: envs.STRIPE_CURRENCY,
      customer: customerId,
      receipt_email: usuario.correo,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        type: "generic",
        usuario: usuarioId,
      },
    });

    return {
      paymentIntent: paymentIntent.client_secret,
      ephemeralKey: ephemeralKey.secret,
      customer: customerId,
      success: true,
    };
  }

  private useMockStripe(): boolean {
    return envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED;
  }
}
