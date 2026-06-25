import React, { useState } from 'react'
import { identityService } from '../services/IdentityService'
import { Identity } from '../types'

interface GhostIdSetupProps {
  onClose?: () => void
}

export function GhostIdSetup({ onClose }: GhostIdSetupProps): React.ReactNode {
  const [identity, setIdentity] = useState<Identity | null>(() => identityService.getIdentity())
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const [copyText, setCopyText] = useState('Copy')
  const [copyKeyText, setCopyKeyText] = useState('Copy Key')

  const handleCopyId = (): void => {
    if (!identity) return
    navigator.clipboard.writeText(identity.ghostId).then(() => {
      setCopyText('Copied!')
      setTimeout(() => setCopyText('Copy'), 1500)
    })
  }

  const handleCopyPubKey = (): void => {
    if (!identity) return
    navigator.clipboard.writeText(identity.pubKey).then(() => {
      setCopyKeyText('Copied Key!')
      setTimeout(() => setCopyKeyText('Copy Key'), 1500)
    })
  }

  const handleReset = (): void => {
    const newId = identityService.resetIdentity()
    setIdentity(newId)
    setShowConfirmReset(false)
    alert('Cryptographic identity has been reset. Old keys destroyed.')
  }

  if (!identity) {
    return <div style={{ padding: 20 }}>Loading identity keys...</div>
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: 24,
        background: 'var(--dr-bg-primary)',
        color: 'var(--dr-text-primary)',
        maxWidth: 600,
        margin: '0 auto',
        gap: 20
      }}
      className="darkroom-container"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--dr-border-subtle)',
          paddingBottom: 12
        }}
      >
        <h2 className="font-heading text-lg font-bold tracking-wide">GHOST ID IDENTITY SYSTEM</h2>
        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--dr-text-secondary)',
              cursor: 'pointer',
              fontSize: 16
            }}
          >
            ✕
          </button>
        )}
      </div>

      <div
        style={{
          padding: '16px 20px',
          background: 'var(--dr-bg-secondary)',
          border: '1px solid var(--dr-border-subtle)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: 'var(--dr-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 1
          }}
          className="font-mono"
        >
          Local Identity Descriptor
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10
          }}
        >
          <span
            style={{ fontSize: 20, color: 'var(--dr-color-accent)', fontWeight: 700 }}
            className="font-mono"
          >
            {identity.ghostId}
          </span>
          <button
            onClick={handleCopyId}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              background: 'transparent',
              border: '1px solid var(--dr-border-subtle)',
              color: 'var(--dr-text-secondary)',
              fontSize: 11,
              cursor: 'pointer'
            }}
            className="font-mono"
          >
            {copyText}
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--dr-text-secondary)', margin: 0, lineHeight: 1.4 }}>
          This identifier is derived strictly from your local public key. No server-side registries,
          email, or telephone lookups are performed.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label
          style={{
            fontSize: 11,
            color: 'var(--dr-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: 1
          }}
          className="font-mono"
        >
          Curve25519 Public Key Fingerprint
        </label>
        <div
          style={{
            padding: 12,
            background: 'var(--dr-bg-secondary)',
            border: '1px solid var(--dr-border-subtle)',
            borderRadius: 6,
            wordBreak: 'break-all',
            fontSize: 11,
            color: 'var(--dr-text-primary)',
            lineHeight: 1.5
          }}
          className="font-mono"
        >
          {identity.pubKey}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button
            onClick={handleCopyPubKey}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--dr-border-subtle)',
              color: 'var(--dr-text-secondary)',
              fontSize: 11,
              cursor: 'pointer'
            }}
            className="font-mono"
          >
            {copyKeyText}
          </button>
        </div>
      </div>

      <div
        style={{
          borderTop: '1px solid var(--dr-border-subtle)',
          paddingTop: 20,
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <h4 style={{ margin: 0, fontSize: 12, fontWeight: 600 }} className="font-heading">
          DANGER ZONE
        </h4>
        <p style={{ fontSize: 11, color: 'var(--dr-text-secondary)', margin: 0, lineHeight: 1.4 }}>
          Resetting your identity generates a new cryptographic keypair. You will immediately lose
          access to all existing rooms, and other participants will see your old ID as permanently
          offline.
        </p>

        {showConfirmReset ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={handleReset}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: 6,
                background: 'var(--dr-color-accent)',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600
              }}
              className="font-mono"
            >
              CONFIRM RESET KEYS
            </button>
            <button
              onClick={() => setShowConfirmReset(false)}
              style={{
                padding: '10px 16px',
                borderRadius: 6,
                background: 'transparent',
                border: '1px solid var(--dr-border-subtle)',
                color: 'var(--dr-text-secondary)',
                cursor: 'pointer'
              }}
              className="font-mono"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowConfirmReset(true)}
            style={{
              padding: '10px 16px',
              borderRadius: 6,
              background: 'transparent',
              border: '1px solid var(--dr-color-accent)',
              color: 'var(--dr-color-accent)',
              cursor: 'pointer',
              fontWeight: 600
            }}
            className="font-mono"
          >
            RESET LOCAL KEYPAIR
          </button>
        )}
      </div>
    </div>
  )
}
export default GhostIdSetup
