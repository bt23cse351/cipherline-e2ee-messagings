import mongoose, { Schema, type Document } from 'mongoose';

export interface IRevokedToken extends Document {
  jti: string;
  expiresAt: Date;
}

const revokedTokenSchema = new Schema<IRevokedToken>({
  jti: {
    type: String,
    required: true,
    unique: true,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
});

revokedTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RevokedToken =
  (mongoose.models.RevokedToken as mongoose.Model<IRevokedToken>) ||
  mongoose.model<IRevokedToken>('RevokedToken', revokedTokenSchema);
