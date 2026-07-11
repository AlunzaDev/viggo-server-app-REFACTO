import Stripe from "stripe";
import { envs } from "./envs.plugin";

export class StripePlugin {
  private static stripe?: Stripe;

  static get client(): Stripe {
    if (!envs.SECRET_STRIPE_KEY) {
      throw new Error("SECRET_STRIPE_KEY is required to use StripePlugin.");
    }

    if (!this.stripe) {
      this.stripe = new Stripe(envs.SECRET_STRIPE_KEY);
    }

    return this.stripe;
  }
}
