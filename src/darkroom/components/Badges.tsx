import React from 'react'

export function E2EProtectedBadge(): React.ReactNode {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 4,
        background: 'rgba(192, 57, 43, 0.08)',
        border: '1px solid rgba(192, 57, 43, 0.2)',
        color: 'var(--dr-color-accent)',
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        userSelect: 'none'
      }}
      className="font-mono"
    >
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
        <path
          d="M6 1.5 L1.5 3.5 v3.5 C1.5 9.5, 6 10.5, 6 10.5 C6 10.5, 10.5 9.5, 10.5 7 v-3.5 L6 1.5 Z"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M4 6.5 l1.5 1.5 l3 -3"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      E2E PROTECTED
    </div>
  )
}

interface VerifiedBadgeProps {
  isVerified: boolean
  onClick?: () => void
}

export function VerifiedBadge({ isVerified, onClick }: VerifiedBadgeProps): React.ReactNode {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px',
        borderRadius: 4,
        background: isVerified ? 'rgba(16, 185, 129, 0.08)' : 'rgba(113, 113, 122, 0.08)',
        border: isVerified
          ? '1px solid rgba(16, 185, 129, 0.2)'
          : '1px solid rgba(113, 113, 122, 0.2)',
        color: isVerified ? '#10b981' : 'var(--dr-text-secondary)',
        fontSize: 9,
        fontWeight: 600,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none'
      }}
      className="font-mono"
    >
      <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.2" />
        {isVerified && (
          <path
            d="M4 6l1.5 1.5L8.5 4"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        )}
      </svg>
      {isVerified ? 'VERIFIED' : 'UNVERIFIED'}
    </div>
  )
}
