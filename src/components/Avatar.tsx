interface AvatarProps {
  username?: string;
  isOnline?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const PALETTES = [
  'bg-gradient-to-br from-teal-600 to-emerald-600 text-white',
  'bg-gradient-to-br from-sky-600 to-indigo-600 text-white',
  'bg-gradient-to-br from-indigo-600 to-violet-600 text-white',
  'bg-gradient-to-br from-cyan-600 to-teal-700 text-white',
  'bg-gradient-to-br from-emerald-600 to-teal-700 text-white',
  'bg-gradient-to-br from-amber-500 to-orange-600 text-white',
];

function getPaletteIndex(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  }
  return hash % PALETTES.length;
}

export function Avatar({ username = 'user', isOnline, size = 'md' }: AvatarProps) {
  const safeName = username || 'user';
  const initials = safeName.slice(0, 2).toUpperCase();
  const paletteClass = PALETTES[getPaletteIndex(safeName)];

  const sizeClass =
    size === 'sm'
      ? 'w-8 h-8 text-xs'
      : size === 'lg'
      ? 'w-12 h-12 text-base'
      : 'w-10 h-10 text-sm';

  return (
    <div className="relative inline-flex shrink-0">
      <div
        className={`${sizeClass} ${paletteClass} rounded-lg font-display font-semibold flex items-center justify-center select-none`}
        aria-hidden="true"
      >
        {initials}
      </div>
      {typeof isOnline === 'boolean' && (
        <span
          title={isOnline ? 'Online' : 'Offline'}
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
            isOnline ? 'bg-emerald-600' : 'bg-slate-300'
          }`}
        />
      )}
    </div>
  );
}
