export default function WorkspaceIcon({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="no-drag flex items-center gap-3 cursor-default select-none">
      <div
        style={{
          width: collapsed ? 32 : 30,
          height: collapsed ? 32 : 30,
          borderRadius: 9,
          background: 'linear-gradient(145deg, #27272d 0%, #1c1c22 100%)',
          border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.04)'
        }}
      >
        <svg width="15" height="15" viewBox="0 0 36 36" fill="none">
          <path
            d="M8 8h6v20H8V8zm8 0h6l6 20h-6L16 8z"
            fill="url(#ws-icon-grad)"
            fillRule="evenodd"
          />
          <defs>
            <linearGradient id="ws-icon-grad" x1="8" y1="8" x2="26" y2="28" gradientUnits="userSpaceOnUse">
              <stop stopColor="#d4d4d8" />
              <stop offset="1" stopColor="#71717a" />
            </linearGradient>
          </defs>
        </svg>
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              letterSpacing: '0.01em',
              lineHeight: 1.2
            }}
          >
            Flux
          </span>
          <span
            style={{
              fontSize: 10,
              fontWeight: 400,
              color: 'var(--color-text-muted)',
              letterSpacing: '0.02em',
              lineHeight: 1.2
            }}
          >
            Personal
          </span>
        </div>
      )}
    </div>
  )
}
