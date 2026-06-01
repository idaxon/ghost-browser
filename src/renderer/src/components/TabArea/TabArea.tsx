import { useBrowser } from '../../context/BrowserContext'

const quickLinks = [
  { name: 'Google', url: 'https://www.google.com', emoji: '🔍', color: '#4285f4' },
  { name: 'YouTube', url: 'https://www.youtube.com', emoji: '▶️', color: '#ff0000' },
  { name: 'GitHub', url: 'https://github.com', emoji: '🐙', color: '#8b5cf6' },
  { name: 'Reddit', url: 'https://www.reddit.com', emoji: '🟠', color: '#ff4500' },
  { name: 'Twitter', url: 'https://x.com', emoji: '𝕏', color: '#1d9bf0' },
  { name: 'Stack Overflow', url: 'https://stackoverflow.com', emoji: '📚', color: '#f48024' }
]

export default function TabArea() {
  const { state, createNewTab } = useBrowser()
  const hasTabs = state.tabs.length > 0

  if (hasTabs) {
    return <div className="flex-1" style={{ background: 'transparent' }} />
  }

  return (
    <div
      className="flex-1 flex items-center justify-center animate-fade-in"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <div className="flex flex-col items-center gap-8" style={{ maxWidth: 480 }}>
        {/* Floating Logo */}
        <div className="animate-float">
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: 'linear-gradient(145deg, #222228 0%, #18181c 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.02)'
            }}
          >
            <svg width="30" height="30" viewBox="0 0 36 36" fill="none">
              <path
                d="M8 8h6v20H8V8zm8 0h6l6 20h-6L16 8z"
                fill="url(#hero-grad)"
                fillRule="evenodd"
              />
              <defs>
                <linearGradient id="hero-grad" x1="8" y1="8" x2="26" y2="28" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#d4d4d8" />
                  <stop offset="1" stopColor="#71717a" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Greeting */}
        <div className="flex flex-col items-center gap-2">
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em'
            }}
          >
            Welcome to Flux
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', textAlign: 'center' }}>
            A fast, clean browser. Open a tab to start browsing.
          </p>
        </div>

        {/* Quick Links Grid */}
        <div className="grid grid-cols-3 gap-2 w-full" style={{ maxWidth: 360 }}>
          {quickLinks.map((link) => (
            <button
              key={link.name}
              onClick={() => createNewTab(link.url)}
              className="btn-ghost flex flex-col items-center gap-2 py-4 px-3 rounded-xl"
              style={{
                background: 'var(--color-bg-card)',
                border: '1px solid var(--color-border-subtle)'
              }}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>{link.emoji}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontWeight: 450 }}>
                {link.name}
              </span>
            </button>
          ))}
        </div>

        {/* Search prompt */}
        <button
          onClick={() => {
            const input = document.querySelector(
              'input[placeholder="Search or enter URL…"]'
            ) as HTMLInputElement
            if (input) { input.focus(); input.select() }
          }}
          className="btn-ghost flex items-center gap-2.5 px-4 py-2.5 rounded-xl"
          style={{
            background: 'var(--color-bg-input)',
            border: '1px solid var(--color-border-subtle)',
            width: '100%',
            maxWidth: 360
          }}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ opacity: 0.35 }}>
            <circle cx="5.5" cy="5.5" r="3.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M8.5 8.5l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)', fontWeight: 400 }}>
            Search or enter a URL…
          </span>
          <span className="kbd ml-auto">Ctrl+L</span>
        </button>

        {/* Keyboard hints */}
        <div className="flex items-center gap-5">
          {[
            { keys: 'Ctrl+K', label: 'Commands' },
            { keys: 'Ctrl+T', label: 'New Tab' },
            { keys: 'Ctrl+B', label: 'Sidebar' }
          ].map(({ keys, label }) => (
            <div key={keys} className="flex items-center gap-1.5">
              <span className="kbd">{keys}</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
