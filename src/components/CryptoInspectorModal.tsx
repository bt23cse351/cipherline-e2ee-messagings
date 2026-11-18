import { Check, Copy, ShieldCheck, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import type { DecryptedMessage } from '../types/messaging';

interface CryptoInspectorModalProps {
  message: DecryptedMessage;
  senderUsername: string;
  recipientUsername: string;
  onClose: () => void;
}

export function CryptoInspectorModal({
  message,
  senderUsername,
  recipientUsername,
  onClose,
}: CryptoInspectorModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const env = message.envelope;

  async function copyValue(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 1600);
    } catch {
      // Ignore clipboard failures
    }
  }

  const fields = [
    { label: 'Message ID', value: env.messageId },
    { label: 'Cipher Suite', value: 'X25519 + HKDF-SHA256 + XChaCha20-Poly1305 + Ed25519' },
    { label: 'Client Timestamp (ISO-8601)', value: env.clientTimestamp },
    { label: 'HKDF Salt Context', value: env.ephemeralPublicKey },
    { label: '24-Byte Nonce (Base64)', value: env.nonce },
    { label: 'AEAD Ciphertext + Poly1305 Tag (Base64)', value: env.ciphertext },
    { label: 'Ed25519 Detached Signature (Base64)', value: env.signature },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inspector-title"
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 min-w-0">
            {message.status === 'VERIFIED' ? (
              <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0" />
            )}
            <div className="min-w-0">
              <h2 id="inspector-title" className="text-base font-semibold text-slate-900 truncate">
                Cryptographic Envelope Inspector
              </h2>
              <p className="text-xs text-slate-500 truncate">
                @{senderUsername} to @{recipientUsername} · Key v{env.keyVersion} (Sender v
                {env.senderKeyVersion} / Recipient v{env.recipientKeyVersion})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close cryptographic inspector"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4">
          <div
            className={`px-4 py-3 rounded-lg border text-xs ${
              message.status === 'VERIFIED'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <p className="font-semibold">
              {message.status === 'VERIFIED'
                ? 'Verification Passed: Ed25519 signature & Poly1305 authentication tag valid'
                : `Verification Failed (${message.status}): ${message.errorReason || 'Integrity check failed'}`}
            </p>
            <p className="mt-1 opacity-90">
              MongoDB stores only the Base64 ciphertext, 24-byte nonce, HKDF salt reference, and
              Ed25519 signature shown below. Plaintext never crosses the wire or database.
            </p>
          </div>

          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {fields.map((field) => (
              <div key={field.label} className="p-3.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600">{field.label}</span>
                  <button
                    type="button"
                    onClick={() => void copyValue(field.label, field.value)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 whitespace-nowrap"
                  >
                    {copiedField === field.label ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-700" />
                        <span className="text-emerald-700">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <pre className="text-xs font-mono text-slate-900 bg-slate-50 px-2.5 py-2 rounded border border-slate-200/80 overflow-x-auto break-all whitespace-pre-wrap">
                  {field.value}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
