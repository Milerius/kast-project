import type { CSSProperties } from 'react';

export function Icon({
  name,
  filled,
  className,
}: {
  name: string;
  filled?: boolean;
  className?: string;
}) {
  const style: CSSProperties = {
    fontVariationSettings: filled
      ? "'FILL' 1, 'wght' 500, 'GRAD' 0, 'opsz' 24"
      : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
  };
  return (
    <span className={`material-symbols-outlined ${className ?? ''}`} style={style} aria-hidden>
      {name}
    </span>
  );
}
