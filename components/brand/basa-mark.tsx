// The Basa mark: a "b" inside crop corners, echoing the region box drawn around text on the
// review screen. Same geometry as app/icon.svg, without the tile, in currentColor so it takes
// the ink of whatever it sits in. Decorative: the "Basa" text beside it carries the name.
export function BasaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M3.5 10V3.5H10M22 3.5H28.5V10M28.5 22V28.5H22M10 28.5H3.5V22"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
      />
      <path d="M8.3 7.6H13.3V24.8H9.8V9.6H8.3Z" fill="currentColor" />
      <circle
        cx={16.6}
        cy={19.2}
        r={4}
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
      />
    </svg>
  );
}
