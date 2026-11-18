import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type SecurityAction =
  | 'REGISTER'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILURE'
  | 'LOGOUT'
  | 'KEY_PUBLISH'
  | 'CONVERSATION_CREATE'
  | 'MESSAGE_SENT'
  | 'UNAUTHORIZED_ACCESS'
  | 'SIGNATURE_WARNING';

export type SecurityResult = 'SUCCESS' | 'FAILURE' | 'BLOCKED';

export interface ISecurityLog extends Document {
  userId: Types.ObjectId | null;
  action: SecurityAction;
  result: SecurityResult;
  detail: string;
  timestamp: Date;
}

const securityLogSchema = new Schema<ISecurityLog>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  action: {
    type: String,
    required: true,
  },
  result: {
    type: String,
    required: true,
  },
  detail: {
    type: String,
    default: '',
    maxlength: 256,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

securityLogSchema.index({ userId: 1, timestamp: -1 });
securityLogSchema.index({ action: 1, timestamp: -1 });

export const SecurityLog =
  (mongoose.models.SecurityLog as mongoose.Model<ISecurityLog>) ||
  mongoose.model<ISecurityLog>('SecurityLog', securityLogSchema);
