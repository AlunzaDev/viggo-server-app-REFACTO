import { Schema, model } from "mongoose";

const paymentMethodSchema = new Schema(
  {
    brand: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    last4: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const paymentReferenceSchema = new Schema(
  {
    type: {
      type: String,
      enum: ["ticket", "pension", "renewal"],
      required: true,
    },
    id: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false },
);

const paymentParkingSchema = new Schema(
  {
    id: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    name: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
    city: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
  },
  { _id: false },
);

const paymentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "Usuario",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["ticket", "pension", "renewal"],
      required: true,
      index: true,
    },
    concept: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["succeeded", "pending", "failed", "refunded"],
      required: true,
      index: true,
    },
    paidAt: {
      type: Number,
      required: true,
      index: true,
    },
    stripePaymentIntentId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      trim: true,
    },
    paymentMethod: {
      type: paymentMethodSchema,
      required: false,
    },
    reference: {
      type: paymentReferenceSchema,
      required: true,
    },
    parking: {
      type: paymentParkingSchema,
      required: false,
    },
    rawProviderStatus: {
      type: String,
      required: false,
      default: "",
      trim: true,
    },
  },
  {
    versionKey: false,
    timestamps: true,
    toJSON: {
      transform: (_doc, ret) => {
        const serialized = ret as Record<string, unknown>;
        serialized.id = String(serialized._id);
        delete serialized._id;
        delete serialized.user;
        delete serialized.stripePaymentIntentId;
        delete serialized.rawProviderStatus;
        delete serialized.createdAt;
        delete serialized.updatedAt;
        return serialized;
      },
    },
  },
);

paymentSchema.index({ user: 1, paidAt: -1 });

export const PaymentModel = model("Payment", paymentSchema);
