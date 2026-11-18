import mongoose, { Schema, type Document, type Types } from 'mongoose';

export interface IMessage extends Document {
  messageId: string;
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  recipientId: Types.ObjectId;
  ciphertext: string;
  nonce: string;
  ephemeralPublicKey: string;
  signature: string;
  keyVersion: number;
  senderKeyVersion: number;
  recipientKeyVersion: number;
  clientTimestamp: string;
  deliveredAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 64,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ciphertext: {
      type: String,
      required: true,
      maxlength: 65536,
    },
    nonce: {
      type: String,
      required: true,
      maxlength: 128,
    },
    ephemeralPublicKey: {
      type: String,
      required: true,
      maxlength: 256,
    },
    signature: {
      type: String,
      required: true,
      maxlength: 256,
    },
    keyVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    senderKeyVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    recipientKeyVersion: {
      type: Number,
      required: true,
      min: 1,
    },
    clientTimestamp: {
      type: String,
      required: true,
      maxlength: 64,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ recipientId: 1, readAt: 1 });

export const Message =
  (mongoose.models.Message as mongoose.Model<IMessage>) ||
  mongoose.model<IMessage>('Message', messageSchema);
