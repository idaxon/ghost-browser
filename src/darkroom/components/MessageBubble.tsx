import React from 'react'
import { motion } from 'framer-motion'
import { Message } from '../types'

interface MessageBubbleProps {
  message: Message
  isOwn: boolean
  senderName: string
}

export function MessageBubble({ message, isOwn, senderName }: MessageBubbleProps): React.ReactNode {
  const timeStr = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        maxWidth: '75%',
        margin: '4px 0'
      }}
    >
      {/* Sender & Time metadata row */}
      <div
        style={{
          display: 'flex',
          justifyContent: isOwn ? 'flex-end' : 'flex-start',
          alignItems: 'center',
          gap: 8,
          marginBottom: 3,
          padding: '0 4px'
        }}
        className="font-mono text-[10px]"
      >
        <span
          style={{
            color: isOwn ? 'var(--dr-color-accent)' : 'var(--dr-text-primary)',
            fontWeight: 500
          }}
        >
          {senderName}
        </span>
        <span style={{ color: 'var(--dr-text-secondary)', opacity: 0.6 }}>{timeStr}</span>
        {/* Status Badge */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 2,
            color: isOwn ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
            opacity: 0.8
          }}
        >
          <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 6l2 2 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {message.status}
        </span>
      </div>

      {/* Message content box */}
      <div
        style={{
          padding: '8px 12px',
          background: isOwn ? 'var(--dr-color-accent-subtle)' : 'var(--dr-bg-secondary)',
          border: isOwn
            ? '1px solid var(--dr-color-accent-muted)'
            : '1px solid var(--dr-border-subtle)',
          borderRadius: isOwn ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
          color: 'var(--dr-text-primary)',
          fontSize: '12.5px',
          lineHeight: '1.45',
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap'
        }}
      >
        {message.content}
      </div>
    </motion.div>
  )
}
export default MessageBubble
