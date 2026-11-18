interface AvatarProps {
  username: string;
  isOnline?: boolean;
  showPresence?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const PALETTE = [
  'bg-teal-700 text-white',
  'bg-slate-700 text-white',
  'bg-indigo-700 text-white',
  'bg-cyan-800 text-white',
  'bg-emerald-800 text-white',
  'bg-sky-800 text-white',
];

function pickColor(username: string): string {
  let sum = 0;
  for (let i = 0; i < username.length; i++) {
    sum += username.charCodeAt(i);
  }
  return PALETTE[sum % PALETTE.length];
}

export function Avatar({
  username,
  isOnline = false,
  showPresence = false,
  size = 'md',
}: AvatarProps) {
  const initial = (username || '?').slice(0, 2).toUpperCase();
  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 text-xs'
      : size === 'lg'
        ? 'h-12 w-12 text-base'
        : 'h-10 w-10 text-sm';

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`${sizeClass} ${pickColor(username)} flex items-center justify-center rounded-full font-display font-semibold tracking-tight select-none`}
        aria-hidden="true"
      >
        {initial}
      </div>
      {showPresence && isOnline && (
        <span
          className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-600"
          title="Online"
        />
      )}
    </div>
  );
}
