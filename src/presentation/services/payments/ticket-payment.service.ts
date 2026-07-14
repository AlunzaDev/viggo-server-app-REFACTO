import Stripe from "stripe";
import { envs } from "../../../config";
import { PaymentModel } from "../../../data/mongo/models/payments/payment.schema";
import { ProyectoModel } from "../../../data/mongo/models/parking/proyecto.schema";
import { StripePlugin } from "../../../config/plugins/stripe.plugin";
import { CustomError } from "../../../domain/errors/custom.error";
import { TicketRepository } from "../../../domain/repository/parking/ticket.repository";

export class TicketPaymentService {
  constructor(private readonly ticketRepository: TicketRepository) {}

  async createPaymentIntent(ticketId: string) {
    const ticket = await this.ticketRepository.findById(ticketId);

    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    if (ticket.pagado) {
      throw CustomError.badRequest("El ticket ya esta pagado");
    }

    if (ticket.monto <= 0) {
      throw CustomError.badRequest("El ticket no tiene monto por cobrar");
    }

    if (this.useMockStripe()) {
      return this.createMockPaymentIntent(ticket.id, ticket.monto);
    }

    const paymentIntent = await StripePlugin.client.paymentIntents.create({
      amount: this.toStripeAmount(ticket.monto),
      currency: envs.STRIPE_CURRENCY,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        type: "ticket",
        ticketId: ticket.id,
        usuario: ticket.usuario,
        proyecto: ticket.proyecto,
      },
    });

    return this.toPaymentIntentResponse(paymentIntent);
  }

  async confirmTicketPayment(ticketId: string, paymentIntentId: string) {
    const ticket = await this.ticketRepository.findById(ticketId);

    if (!ticket) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    if (this.useMockStripe()) {
      if (!paymentIntentId.startsWith("pi_mock_")) {
        throw CustomError.badRequest("El pago mock no es valido");
      }

      const ticketUpdated = await this.ticketRepository.update(ticket.id, {
        pagado: true,
        horaCobro: Date.now(),
      });

      if (!ticketUpdated) {
        throw CustomError.notFound("Ticket no encontrado");
      }

      await this.recordTicketPayment({
        ticketId: ticket.id,
        userId: ticket.usuario,
        projectId: ticket.proyecto,
        amount: ticket.monto,
        paidAt: ticketUpdated.horaCobro,
        paymentIntentId,
        providerStatus: "succeeded",
      });

      return {
        paymentIntent: {
          id: paymentIntentId,
          clientSecret: `${paymentIntentId}_secret_mock`,
          amount: this.toStripeAmount(ticket.monto),
          currency: envs.STRIPE_CURRENCY,
          status: "succeeded",
        },
        ticket: ticketUpdated,
      };
    }

    const paymentIntent =
      await StripePlugin.client.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.metadata.ticketId !== ticket.id) {
      throw CustomError.badRequest("El pago no pertenece a este ticket");
    }

    if (paymentIntent.status !== "succeeded") {
      throw CustomError.badRequest("El pago aun no esta confirmado", {
        status: paymentIntent.status,
      });
    }

    const ticketUpdated = await this.ticketRepository.update(ticket.id, {
      pagado: true,
      horaCobro: Date.now(),
    });

    if (!ticketUpdated) {
      throw CustomError.notFound("Ticket no encontrado");
    }

    await this.recordTicketPayment({
      ticketId: ticket.id,
      userId: ticket.usuario,
      projectId: ticket.proyecto,
      amount: ticket.monto,
      paidAt: ticketUpdated.horaCobro,
      paymentIntentId: paymentIntent.id,
      providerStatus: paymentIntent.status,
      paymentMethod: await this.resolvePaymentMethod(paymentIntent),
    });

    return {
      paymentIntent: this.toPaymentIntentResponse(paymentIntent),
      ticket: ticketUpdated,
    };
  }

  private toStripeAmount(amount: number): number {
    return Math.round(amount * 100);
  }

  private useMockStripe(): boolean {
    return envs.STRIPE_MOCK_ENABLED || !envs.STRIPE_ENABLED;
  }

  private createMockPaymentIntent(ticketId: string, amount: number) {
    const id = `pi_mock_${ticketId}_${Date.now()}`;

    return {
      id,
      clientSecret: `${id}_secret_mock`,
      amount: this.toStripeAmount(amount),
      currency: envs.STRIPE_CURRENCY,
      status: "requires_payment_method",
      mock: true,
    };
  }

  private toPaymentIntentResponse(paymentIntent: Stripe.PaymentIntent) {
    return {
      id: paymentIntent.id,
      clientSecret: paymentIntent.client_secret,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    };
  }

  private async recordTicketPayment(options: {
    ticketId: string;
    userId: string;
    projectId: string;
    amount: number;
    paidAt: number;
    paymentIntentId: string;
    providerStatus: string;
    paymentMethod?: {
      brand?: string;
      last4?: string;
    };
  }) {
    const project = await ProyectoModel.findById(options.projectId);

    await PaymentModel.findOneAndUpdate(
      { stripePaymentIntentId: options.paymentIntentId },
      {
        $setOnInsert: {
          user: options.userId,
          type: "ticket",
          concept: "Pago de ticket",
          amount: options.amount,
          currency: envs.STRIPE_CURRENCY.toUpperCase(),
          status: "succeeded",
          paidAt: options.paidAt,
          stripePaymentIntentId: options.paymentIntentId,
          paymentMethod: options.paymentMethod,
          reference: {
            type: "ticket",
            id: options.ticketId,
          },
          parking: project
            ? {
                id: String(project._id),
                name: String(project.get("nombre") ?? ""),
                city: String(project.get("ciudad") ?? ""),
              }
            : undefined,
          rawProviderStatus: options.providerStatus,
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
  }

  private async resolvePaymentMethod(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<{ brand?: string; last4?: string } | undefined> {
    const latestCharge = paymentIntent.latest_charge;

    if (!latestCharge || typeof latestCharge !== "string") {
      return undefined;
    }

    const charge = await StripePlugin.client.charges.retrieve(latestCharge);
    const card = charge.payment_method_details?.card;

    if (!card) return undefined;

    return {
      brand: card.brand ?? undefined,
      last4: card.last4 ?? undefined,
    };
  }
}
