import React, { useEffect, useState } from 'react'
import { roomService } from '../services/RoomService'
import { DCNetTransport } from '../transports/DCNetTransport'

interface DCNetViewProps {
  roomId: string
  onClose?: () => void
}

export function DCNetView({ roomId, onClose }: DCNetViewProps): React.ReactNode {
  const [round, setRound] = useState<number>(() => {
    const transport = roomService.getTransport(roomId)
    if (transport && transport instanceof DCNetTransport) {
      return transport.getRound()
    }
    return 0
  })
  const [phase, setPhase] = useState<'reservation' | 'message'>('reservation')
  const [activePeersCount, setActivePeersCount] = useState(1)
  const [myReservedSlot, setMyReservedSlot] = useState<number | null>(() => {
    const transport = roomService.getTransport(roomId)
    if (transport && transport instanceof DCNetTransport) {
      return transport.getMyReservedSlot()
    }
    return null
  })
  const [vectorResult, setVectorResult] = useState<number[] | null>(null)

  useEffect(() => {
    // Find transport
    const transport = roomService.getTransport(roomId)

    // Listen to round result directly from the local transport instance to update UI in real-time
    if (transport && transport instanceof DCNetTransport) {
      const unsubscribe = transport.onRoundResult(
        (data: {
          roomId: string
          round: number
          phase: 'reservation' | 'message'
          result: number[]
          activePeersCount?: number
        }) => {
          if (data.roomId === roomId) {
            setRound(data.round)
            setPhase(data.phase)
            if (data.activePeersCount !== undefined) {
              setActivePeersCount(data.activePeersCount)
            }
            setVectorResult(data.result)
            setMyReservedSlot(transport.getMyReservedSlot())
          }
        }
      )
      return unsubscribe
    }
    return undefined
  }, [roomId])

  // Generate slot data dynamically based on actual vector results
  const slots = Array.from({ length: 20 }, (_, i) => {
    let state: 'empty' | 'own' | 'occupied' | 'collision' = 'empty'
    if (i === myReservedSlot) {
      state = 'own'
    } else if (vectorResult) {
      const val = phase === 'message' ? vectorResult[i * 128] : vectorResult[i]
      if (val !== 0) {
        state = 'occupied'
      }
    }
    return { index: i, state: state as 'empty' | 'own' | 'occupied' | 'collision' }
  })

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
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 className="font-heading text-lg font-bold tracking-wide">
            DC-NET ENGINE DIAGNOSTICS
          </h2>
          <span style={{ fontSize: 10, color: 'var(--dr-text-secondary)' }} className="font-mono">
            ROOM: {roomId}
          </span>
        </div>
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

      {/* Experimental warning banner */}
      <div
        style={{
          border: '1px solid var(--dr-color-accent)',
          background: 'var(--dr-color-accent-subtle)',
          padding: '12px 16px',
          borderRadius: 6,
          color: 'var(--dr-color-accent)',
          fontSize: 12,
          fontWeight: 600,
          lineHeight: 1.45
        }}
        className="font-mono"
      >
        [WARNING] DC-Net mode is EXPERIMENTAL. Hard cap: 20 participants per room. Message broadcast
        is guaranteed to be anonymous via slot exchange but throughput is limited.
      </div>

      {/* Rounds and stats panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          padding: 16,
          background: 'var(--dr-bg-secondary)',
          border: '1px solid var(--dr-border-subtle)',
          borderRadius: 8
        }}
        className="font-mono text-center"
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 10, color: 'var(--dr-text-secondary)' }}>ROUND</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--dr-text-primary)' }}>
            {round}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 10, color: 'var(--dr-text-secondary)' }}>PHASE</span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: phase === 'message' ? '#10b981' : 'var(--dr-color-accent)',
              textTransform: 'uppercase',
              marginTop: 3
            }}
          >
            {phase}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 10, color: 'var(--dr-text-secondary)' }}>ACTIVE PEERS</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--dr-text-primary)' }}>
            {activePeersCount} / 20
          </span>
        </div>
      </div>

      {/* Slots grid representation */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 600 }} className="font-heading">
          ANONYMOUS SLOT ALLOCATION
        </h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
            padding: 12,
            background: 'var(--dr-bg-secondary)',
            border: '1px solid var(--dr-border-subtle)',
            borderRadius: 8
          }}
          className="font-mono"
        >
          {slots.map((s) => {
            let bg = 'rgba(255,255,255,0.02)'
            let borderColor = 'var(--dr-border-subtle)'
            let textColor = 'var(--dr-text-secondary)'
            let label = 'EMPTY'

            if (s.state === 'own') {
              bg = 'rgba(192,57,43,0.1)'
              borderColor = 'var(--dr-color-accent)'
              textColor = 'var(--dr-color-accent)'
              label = 'MY SLOT'
            } else if (s.state === 'occupied') {
              bg = 'rgba(255,255,255,0.05)'
              borderColor = 'var(--dr-text-secondary)'
              textColor = 'var(--dr-text-primary)'
              label = 'RESERVED'
            } else if (s.state === 'collision') {
              bg = 'rgba(239, 68, 68, 0.1)'
              borderColor = '#ef4444'
              textColor = '#ef4444'
              label = 'COLLIDE'
            }

            return (
              <div
                key={s.index}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '8px 4px',
                  background: bg,
                  border: `1px solid ${borderColor}`,
                  borderRadius: 6,
                  fontSize: 10,
                  color: textColor
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 12, marginBottom: 2 }}>
                  {s.index.toString().padStart(2, '0')}
                </span>
                <span>{label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ fontSize: 11, color: 'var(--dr-text-secondary)', lineHeight: 1.45 }}>
        <strong>DC-Net Mechanism:</strong> In each round, peers choose random slots and submit
        blinded XOR vectors. When slot reservation completes with zero collisions, the system starts
        the message phase. Plaintext messages are reconstructed by the untrusted aggregator, but
        sender identity remains hidden.
      </div>
    </div>
  )
}
export default DCNetView
