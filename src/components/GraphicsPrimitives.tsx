import { useMemo } from 'react';

export function EncryptedHandshakeGraphic() {
  return (
    <svg
      viewBox="0 0 280 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-64 h-auto mx-auto"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="handshakeLink" x1="72" y1="48" x2="208" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D9488" />
          <stop offset="50%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <rect x="16" y="20" width="56" height="56" rx="12" fill="#F0FDFA" stroke="#5EEAD4" strokeWidth="1.5" />
      <rect x="208" y="20" width="56" height="56" rx="12" fill="#EEF2FF" stroke="#A5B4FC" strokeWidth="1.5" />
      <path
        d="M72 48H116M164 48H208"
        stroke="url(#handshakeLink)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
      <circle cx="140" cy="48" r="22" fill="#E0F2FE" stroke="#0284C7" strokeWidth="1.6" />
      <path
        d="M133 47V43.5C133 39.634 136.134 36.5 140 36.5C143.866 36.5 147 39.634 147 43.5V47M131.5 47H148.5C149.328 47 150 47.672 150 48.5V56.5C150 57.328 149.328 58 148.5 58H131.5C130.672 58 130 57.328 130 56.5V48.5C130 47.672 130.672 47 131.5 47Z"
        stroke="#0369A1"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="42" r="7" fill="#CCFBF1" stroke="#0D9488" strokeWidth="1.5" />
      <path d="M32 60C34.5 55.5 39 53 44 53C49 53 53.5 55.5 56 60" stroke="#0D9488" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="236" cy="42" r="7" fill="#E0E7FF" stroke="#4F46E5" strokeWidth="1.5" />
      <path d="M224 60C226.5 55.5 231 53 236 53C241 53 245.5 55.5 248 60" stroke="#4F46E5" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function CryptoPipelineDiagram() {
  const steps = [
    {
      num: '01',
      title: 'X25519 ECDH',
      subtitle: 'Shared secret in browser',
      cardClass: 'bg-teal-50/80 border-teal-200',
      numClass: 'text-teal-700',
      arrowClass: 'text-teal-500',
    },
    {
      num: '02',
      title: 'HKDF-SHA256',
      subtitle: '16-byte per-message salt',
      cardClass: 'bg-sky-50/80 border-sky-200',
      numClass: 'text-sky-700',
      arrowClass: 'text-sky-500',
    },
    {
      num: '03',
      title: 'XChaCha20-Poly1305',
      subtitle: '24-byte nonce + AEAD tag',
      cardClass: 'bg-indigo-50/80 border-indigo-200',
      numClass: 'text-indigo-700',
      arrowClass: 'text-indigo-500',
    },
    {
      num: '04',
      title: 'Ed25519 Signature',
      subtitle: 'Verify before decrypt',
      cardClass: 'bg-emerald-50/80 border-emerald-200',
      numClass: 'text-emerald-700',
      arrowClass: 'text-emerald-500',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {steps.map((step, index) => (
        <div
          key={step.num}
          className={`relative rounded-xl border p-4 flex flex-col justify-between gap-2 ${step.cardClass}`}
        >
          <div className="flex items-center justify-between">
            <span className={`text-xs font-mono font-bold tabular-nums ${step.numClass}`}>
              {step.num}
            </span>
            {index < steps.length - 1 && (
              <svg
                viewBox="0 0 20 12"
                className={`hidden lg:block w-5 h-3 ${step.arrowClass}`}
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M1 6H18M18 6L13.5 1.5M18 6L13.5 10.5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{step.title}</p>
            <p className="text-xs text-slate-600 mt-0.5">{step.subtitle}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

const IDENTICON_TONES = ['bg-teal-600', 'bg-sky-600', 'bg-indigo-600', 'bg-emerald-600'];

export function FingerprintIdenticon({ fingerprint }: { fingerprint: string }) {
  const cells = useMemo(() => {
    const clean = (fingerprint || '').replace(/[^0-9A-Fa-f]/g, '');
    const grid: Array<{ filled: boolean; tone: string }> = [];
    for (let row = 0; row < 5; row++) {
      const rowBits: Array<{ filled: boolean; tone: string }> = [];
      for (let col = 0; col < 3; col++) {
        const idx = (row * 3 + col) % Math.max(clean.length, 1);
        const val = clean ? parseInt(clean[idx], 16) : (row + col) % 2;
        rowBits.push({
          filled: val % 2 === 0,
          tone: IDENTICON_TONES[val % IDENTICON_TONES.length],
        });
      }
      grid.push(rowBits[0], rowBits[1], rowBits[2], rowBits[1], rowBits[0]);
    }
    return grid;
  }, [fingerprint]);

  return (
    <div
      className="w-14 h-14 rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50 to-sky-50 p-2 shrink-0 grid grid-cols-5 gap-0.5"
      title="Deterministic color glyph derived from your SHA-256 public key fingerprint"
    >
      {cells.map((cell, idx) => (
        <span
          key={idx}
          className={`rounded-[2px] ${cell.filled ? cell.tone : 'bg-white/80'}`}
        />
      ))}
    </div>
  );
}
