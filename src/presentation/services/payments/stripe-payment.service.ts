import { envs } from "../../../config";
import { CustomError } from "../../../domain/errors/custom.error";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import { StripePaymentRepository } from "../../../domain/repositories/payments/stripe-payment.repository";
import type { NewPaymentRecord } from "../../../domain/datasources/payments/payment.datasource";
import type { PaymentRepository } from "../../../domain/repositories/payments/payment.repository";
import type { PensionPassRepository } from "../../../domain/repositories/pension/pension-pass.repository";
import type { PensionRepository } from "../../../domain/repositories/pension/pension.repository";

export class StripePaymentService {
  constructor(
    private readonly repository: StripePaymentRepository,
    private readonly payments: PaymentRepository,
    private readonly pensionPasses: PensionPassRepository,
    private readonly pensions: PensionRepository,
  ) {}

  async createPaymentIntent(
    usuarioId: string,
    input: { pensionPassId: string; operation: "contract" | "renew"; contractMonths: number },
    idempotencyKey: string,
  ) {
    const months = input.operation === "contract" ? 1 : input.contractMonths;
    if (!input.pensionPassId || !["contract", "renew"].includes(input.operation) || !Number.isInteger(months) || months < 1 || months > 24) {
      throw CustomError.badRequest("Datos de cobro de pension invalidos");
    }
    const pass = await this.pensionPasses.findActiveByIdAndUsuario(input.pensionPassId, usuarioId);
    if (!pass) throw CustomError.notFound("Pension pass no encontrada");
    const pension = await this.pensions.findById(pass.pension);
    if (!pension || !pension.estado) throw CustomError.notFound("Pension no disponible");
    const monto = Number(pension.precio) * months;
    if (!Number.isFinite(monto) || monto <= 0) throw CustomError.conflict("Precio de pension invalido");

    const previous = await this.payments.findRecordByIdempotencyKey(idempotencyKey);
    if (previous) {
      if (String(previous.user) !== usuarioId || String(previous.reference.id ?? "") !== input.pensionPassId || previous.type !== (input.operation === "renew" ? "renewal" : "pension")) {
        throw CustomError.conflict("La clave ya fue usada para otro cobro");
      }
      if (this.useMockStripe()) return { paymentIntent: `pi_mock_generic_${idempotencyKey}_secret_mock`, paymentIntentId: previous.stripePaymentIntentId, ephemeralKey: "ephkey_mock", customer: "cus_mock", status: previous.status, success: true, mock: true };
      const intent = await StripePlugin.client.paymentIntents.retrieve(String(previous.stripePaymentIntentId));
      const customer = String(intent.customer ?? "");
      const ephemeralKey = customer
        ? await StripePlugin.client.ephemeralKeys.create({ customer }, { apiVersion: "2022-08-01" })
        : null;
      return { paymentIntent: intent.client_secret, paymentIntentId: intent.id, ephemeralKey: ephemeralKey?.secret ?? "", customer, status: intent.status, success: true };
    }

    if (this.useMockStripe()) {
      const paymentIntentId = `mock_${idempotencyKey}`;
      await this.payments.createRecord(this.buildPensionPayment(usuarioId, input, monto, months, idempotencyKey, paymentIntentId, "requires_payment_method"));
      return {
        paymentIntent: `pi_mock_generic_${idempotencyKey}_secret_mock`,
        paymentIntentId,
        ephemeralKey: "ephkey_mock",
        customer: "cus_mock",
        status: "requires_payment_method",
        success: true,
        mock: true,
      };
    }

    const usuario = await this.repository.findUserById(usuarioId) as {
      correo: string;
      nombre: string;
      apellido: string;
    } | null;

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
        type: input.operation,
        usuario: usuarioId,
        pensionPassId: input.pensionPassId,
        contractMonths: String(months),
      },
    }, { idempotencyKey });

    await this.payments.createRecord(this.buildPensionPayment(usuarioId, input, monto, months, idempotencyKey, paymentIntent.id, paymentIntent.status));

    return {
      paymentIntent: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      ephemeralKey: ephemeralKey.secret,
      customer: customerId,
      status: paymentIntent.status,
      success: true,
    };
  }

  private buildPensionPayment(
    usuarioId: string,
    input: { pensionPassId: string; operation: "contract" | "renew" },
    monto: number,
    months: number,
    idempotencyKey: string,
    stripePaymentIntentId: string,
    rawProviderStatus: string,
  ): NewPaymentRecord {
    const type = input.operation === "renew" ? "renewal" : "pension";
    return {
      user: usuarioId,
      type,
      concept: input.operation === "renew" ? "Renovacion de pension" : "Contratacion de pension",
      amount: monto,
      currency: envs.STRIPE_CURRENCY,
      status: "pending",
      paidAt: Date.now(),
      stripePaymentIntentId,
      idempotencyKey,
      reference: { type, id: input.pensionPassId },
      rawProviderStatus,
      metadata: { operation: input.operation, contractMonths: months },
    };
  }

  private useMockStripe(): boolean {
    return envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED;
  }
}
