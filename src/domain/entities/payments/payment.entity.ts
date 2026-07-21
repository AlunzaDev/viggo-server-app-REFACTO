import { CustomError } from "../../errors/custom.error";

export const PAYMENT_TYPES = [
  "ticket",
  "pension",
  "renewal",
] as const;

export type PaymentType = (typeof PAYMENT_TYPES)[number];

export const PAYMENT_STATUSES = [
  "succeeded",
  "pending",
  "failed",
  "refunded",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export interface PaymentMethodDetails {
  brand?: string;
  last4?: string;
}

export interface PaymentReference {
  type: PaymentType;
  id: string;
}

export interface PaymentParking {
  id?: string;
  name?: string;
  city?: string;
}

export interface PaymentEntityOptions {
  id: string;
  user: string;
  type: PaymentType;
  concept: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paidAt: number;
  stripePaymentIntentId?: string;
  paymentMethod?: PaymentMethodDetails;
  reference: PaymentReference;
  parking?: PaymentParking;
  rawProviderStatus?: string;
}

export class PaymentEntity {
  public id: string;
  public user: string;
  public type: PaymentType;
  public concept: string;
  public amount: number;
  public currency: string;
  public status: PaymentStatus;
  public paidAt: number;
  public stripePaymentIntentId?: string;
  public paymentMethod?: PaymentMethodDetails;
  public reference: PaymentReference;
  public parking?: PaymentParking;
  public rawProviderStatus?: string;

  constructor(options: PaymentEntityOptions) {
    this.id = options.id;
    this.user = options.user;
    this.type = options.type;
    this.concept = options.concept;
    this.amount = options.amount;
    this.currency = options.currency;
    this.status = options.status;
    this.paidAt = options.paidAt;
    this.stripePaymentIntentId = options.stripePaymentIntentId;
    this.paymentMethod = options.paymentMethod;
    this.reference = options.reference;
    this.parking = options.parking;
    this.rawProviderStatus = options.rawProviderStatus;
  }

  static fromObject(object: { [key: string]: unknown }): PaymentEntity {
    const {
      _id,
      id,
      user,
      type,
      concept,
      amount,
      currency,
      status,
      paidAt,
      stripePaymentIntentId,
      paymentMethod,
      reference,
      parking,
      rawProviderStatus,
    } = object;

    const paymentId = id || (_id ? String(_id) : undefined);

    if (!paymentId) throw CustomError.badRequest("Missing id");
    if (!user) throw CustomError.badRequest("Missing user");
    if (!type) throw CustomError.badRequest("Missing type");
    if (!concept) throw CustomError.badRequest("Missing concept");
    if (amount === undefined || amount === null) {
      throw CustomError.badRequest("Missing amount");
    }
    if (!currency) throw CustomError.badRequest("Missing currency");
    if (!status) throw CustomError.badRequest("Missing status");
    if (paidAt === undefined || paidAt === null) {
      throw CustomError.badRequest("Missing paidAt");
    }
    if (!reference || typeof reference !== "object") {
      throw CustomError.badRequest("Missing reference");
    }

    if (typeof type !== "string" || !PAYMENT_TYPES.includes(type as PaymentType)) {
      throw CustomError.badRequest("Invalid payment type");
    }

    if (
      typeof status !== "string" ||
      !PAYMENT_STATUSES.includes(status as PaymentStatus)
    ) {
      throw CustomError.badRequest("Invalid payment status");
    }

    const normalizedReference = PaymentEntity.mapReference(reference);
    const normalizedPaymentMethod = PaymentEntity.mapPaymentMethod(paymentMethod);
    const normalizedParking = PaymentEntity.mapParking(parking);

    return new PaymentEntity({
      id: String(paymentId),
      user: String(user),
      type: type as PaymentType,
      concept: String(concept).trim(),
      amount: Number(amount),
      currency: String(currency).trim().toUpperCase(),
      status: status as PaymentStatus,
      paidAt: Number(paidAt),
      stripePaymentIntentId: stripePaymentIntentId
        ? String(stripePaymentIntentId).trim()
        : undefined,
      paymentMethod: normalizedPaymentMethod,
      reference: normalizedReference,
      parking: normalizedParking,
      rawProviderStatus: rawProviderStatus
        ? String(rawProviderStatus).trim()
        : undefined,
    });
  }

  private static mapReference(reference: unknown): PaymentReference {
    if (!reference || typeof reference !== "object") {
      throw CustomError.badRequest("Invalid payment reference");
    }

    const { type, id } = reference as {
      type?: unknown;
      id?: unknown;
    };

    if (!type || typeof type !== "string") {
      throw CustomError.badRequest("Missing payment reference type");
    }

    if (!PAYMENT_TYPES.includes(type as PaymentType)) {
      throw CustomError.badRequest("Invalid payment reference type");
    }

    if (!id) {
      throw CustomError.badRequest("Missing payment reference id");
    }

    return {
      type: type as PaymentType,
      id: String(id).trim(),
    };
  }

  private static mapPaymentMethod(
    paymentMethod: unknown,
  ): PaymentMethodDetails | undefined {
    if (!paymentMethod || typeof paymentMethod !== "object") {
      return undefined;
    }

    const { brand, last4 } = paymentMethod as {
      brand?: unknown;
      last4?: unknown;
    };

    return {
      brand: brand ? String(brand).trim() : undefined,
      last4: last4 ? String(last4).trim() : undefined,
    };
  }

  private static mapParking(parking: unknown): PaymentParking | undefined {
    if (!parking || typeof parking !== "object") {
      return undefined;
    }

    const { id, name, city } = parking as {
      id?: unknown;
      name?: unknown;
      city?: unknown;
    };

    return {
      id: id ? String(id).trim() : undefined,
      name: name ? String(name).trim() : undefined,
      city: city ? String(city).trim() : undefined,
    };
  }
}