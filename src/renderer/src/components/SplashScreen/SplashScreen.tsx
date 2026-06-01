import { useState, useEffect } from 'react'

export default function SplashScreen({ onFinished }: { onFinished: () => void }) {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('hold'), 500)
    const t2 = setTimeout(() => setPhase('out'), 2000)
    const t3 = setTimeout(onFinished, 2400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [onFinished])

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center ${
        phase === 'out' ? 'animate-splash-out' : 'animate-splash-in'
      }`}
      style={{ background: '#111113' }}
    >
      <div className="flex flex-col items-center gap-7">
        {/* Logo */}
        <div className="animate-logo-breathe">
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 22,
              background: 'linear-gradient(145deg, #222228 0%, #18181c 100%)',
              border: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)'
            }}
          >
            <svg width="38" height="38" viewBox="0 0 36 36" fill="none">
              <path
                d="M8 8h6v20H8V8zm8 0h6l6 20h-6L16 8z"
                fill="url(#splash-grad)"
                fillRule="evenodd"
              />
              <defs>
                <linearGradient id="splash-grad" x1="8" y1="8" x2="26" y2="28" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#d4d4d8" />
                  <stop offset="1" stopColor="#71717a" />
                </linearGradient>
              </defs>
            </svg>
          </div>
        </div>

        {/* Brand */}
        <div className="flex flex-col items-center gap-1.5">
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: '#e4e4e7',
              letterSpacing: '0.1em'
            }}
          >
            FLUX
          </h1>
          <span
            style={{
              fontSize: 11,
              color: '#52525b',
              letterSpacing: '0.2em',
              fontWeight: 400
            }}
          >
            BROWSER
          </span>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: 120,
            height: 2,
            borderRadius: 1,
            background: 'rgba(255,255,255,0.04)',
            overflow: 'hidden',
            marginTop: 4
          }}
        >
          <div
            className="animate-loading-progress"
            style={{
              height: '100%',
              borderRadius: 1,
              background: 'linear-gradient(90deg, var(--color-accent-muted), var(--color-accent))'
            }}
          />
        </div>
      </div>
    </div>
  )
}
