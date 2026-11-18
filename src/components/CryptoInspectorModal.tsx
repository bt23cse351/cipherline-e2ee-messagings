import { ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { buildCanonicalSignatureString } from '../crypto/e2ee';
import type { DecryptedMessageItem } from '../types/messaging';

interface CryptoInspectorModalProps {
  item: DecryptedMessageItem | null;
  onClose: () => void;
}

export function CryptoInspectorModal({ item, onClose }: CryptoInspectorModalProps) {
  if (!item) return null;

  const { envelope, signatureValid, decryptionOk, securityError } = item;
  const canonicalPayload = buildCanonicalSignatureString(envelope);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {signatureValid && decryptionOk ? (
              <ShieldCheck className="h-5 w-5 text-teal-700" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-red-700" />
            )}
            <h3 className="font-display text-base font-semibold text-slate-900">
              Cryptographic Message Envelope
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            aria-label="Close envelope inspector"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <div>
              <div className="text-slate-500">Ed25519 Signature Status</div>
              <div
                className={`mt-0.5 font-medium ${
                  signatureValid ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {signatureValid ? 'Verified Valid' : 'Invalid / Tampered'}
              </div>
            </div>
            <div>
              <div className="text-slate-500">AEAD Cipher & KDF</div>
              <div className="mt-0.5 font-medium text-slate-900">
                XChaCha20-Poly1305 · HKDF-SHA256
              </div>
            </div>
            <div>
              <div className="text-slate-500">Message ID</div>
              <div className="mt-0.5 font-mono text-slate-800 break-all">
                {envelope.messageId}
              </div>
            </div>
            <div>
              <div className="text-slate-500">Key Versions (Sender / Recipient)</div>
              <div className="mt-0.5 font-mono tabular-nums text-slate-800">
                v{envelope.senderKeyVersion} / v{envelope.recipientKeyVersion}
              </div>
            </div>
          </div>

          {securityError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800">
              {securityError}
            </div>
          )}

          <div>
            <div className="font-medium text-slate-700 mb-1">
              Ciphertext stored in MongoDB (Base64)
            </div>
            <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg font-mono text-[11px] overflow-x-auto break-all whitespace-pre-wrap">
              {envelope.ciphertext}
            </pre>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="font-medium text-slate-700 mb-1">24-Byte Random Nonce</div>
              <pre className="p-2.5 bg-slate-100 text-slate-800 rounded-lg font-mono text-[11px] break-all whitespace-pre-wrap">
                {envelope.nonce}
              </pre>
            </div>
            <div>
              <div className="font-medium text-slate-700 mb-1">HKDF Per-Message Salt Ref</div>
              <pre className="p-2.5 bg-slate-100 text-slate-800 rounded-lg font-mono text-[11px] break-all whitespace-pre-wrap">
                {envelope.ephemeralPublicKey}
              </pre>
            </div>
          </div>

          <div>
            <div className="font-medium text-slate-700 mb-1">
              64-Byte Ed25519 Digital Signature
            </div>
            <pre className="p-2.5 bg-slate-100 text-slate-800 rounded-lg font-mono text-[11px] break-all whitespace-pre-wrap">
              {envelope.signature}
            </pre>
          </div>

          <div>
            <div className="font-medium text-slate-700 mb-1">
              Deterministic Canonical Signed Payload
            </div>
            <pre className="p-3 bg-slate-50 border border-slate-200 text-slate-700 rounded-lg font-mono text-[11px] overflow-x-auto whitespace-pre-wrap break-all">
              {canonicalPayload}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
