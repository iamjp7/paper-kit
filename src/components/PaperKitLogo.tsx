type PaperKitLogoProps = {
  size?: number
  showWordmark?: boolean
  className?: string
}

export default function PaperKitLogo({
  size = 32,
  showWordmark = false,
  className = '',
}: PaperKitLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        width={size}
        height={size}
        fill="none"
        aria-hidden={showWordmark ? undefined : true}
        role={showWordmark ? 'img' : undefined}
        aria-label={showWordmark ? 'PaperKit' : undefined}
        className="shrink-0"
      >
        <defs>
          <linearGradient id="pk-mark-bg" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop stopColor="#0f766e" />
            <stop offset="1" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="8" fill="url(#pk-mark-bg)" />
        <rect x="8" y="7" width="13" height="17" rx="1.5" fill="#fff" fillOpacity="0.22" />
        <path
          d="M10 9h8.5L20 10.5V22a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 22V10.5A1.5 1.5 0 0 1 10 9Z"
          fill="#fff"
        />
        <path d="M18.5 9v2H20.5" stroke="#0f766e" strokeWidth="1.2" strokeLinecap="round" />
        <path
          d="M11 14h8M11 17h6M11 20h4"
          stroke="#0f766e"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="22.5" cy="20.5" r="4.5" fill="#fff" />
        <path
          d="M20.8 20.5 22 21.7l2.7-2.8"
          stroke="#0f766e"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span className="font-semibold tracking-tight text-slate-900">PaperKit</span>
      )}
    </span>
  )
}
