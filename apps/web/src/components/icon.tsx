export function Icon({ name, className = 'i' }: { name: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function WordmarkGlyph() {
  return (
    <svg className="wordmark-glyph" viewBox="0 0 32 32" aria-hidden="true" fill="none">
        <path
          d="M8 26.8 16 6.4 24 26.8"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <ellipse
          cx="16"
          cy="18.6"
          rx="8.8"
          ry="3.2"
          transform="rotate(-22 16 18.6)"
          stroke="currentColor"
          strokeWidth="1.35"
        />
        <circle cx="16" cy="18.6" r="2.15" fill="currentColor" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="wordmark">
      <WordmarkGlyph />
      AURA
    </span>
  );
}
