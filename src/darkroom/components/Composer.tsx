import React, { useState, useRef, useEffect } from 'react'

interface ComposerProps {
  onSend: (text: string) => void
  placeholder?: string
  disabled?: boolean
}

export function Composer({
  onSend,
  placeholder = 'Type a message...',
  disabled = false
}: ComposerProps): React.ReactNode {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const submit = (): void => {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  // Auto-resize composer input
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [text])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        padding: '8px 12px',
        background: 'var(--dr-bg-primary)',
        borderTop: '1px solid var(--dr-border-subtle)',
        gap: 8
      }}
    >
      {/* Mock attachment clip */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => alert('Attachments are foundation only for now.')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 6,
          background: 'transparent',
          border: '1px solid var(--dr-border-subtle)',
          color: 'var(--dr-text-secondary)',
          cursor: 'pointer',
          flexShrink: 0
        }}
        title="Attach file (mocked)"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Input textbox */}
      <textarea
        ref={textareaRef}
        rows={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          background: 'var(--dr-bg-secondary)',
          border: '1px solid var(--dr-border-subtle)',
          borderRadius: 6,
          padding: '8px 12px',
          fontSize: 12.5,
          color: 'var(--dr-text-primary)',
          outline: 'none',
          resize: 'none',
          height: 'auto',
          maxHeight: 120,
          fontFamily: 'inherit',
          lineHeight: '1.4'
        }}
      />

      {/* Send button */}
      <button
        type="button"
        onClick={submit}
        disabled={!text.trim() || disabled}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 6,
          background: text.trim() && !disabled ? 'var(--dr-color-accent-subtle)' : 'transparent',
          border:
            text.trim() && !disabled
              ? '1px solid var(--dr-color-accent-muted)'
              : '1px solid var(--dr-border-subtle)',
          color: text.trim() && !disabled ? 'var(--dr-color-accent)' : 'var(--dr-text-secondary)',
          cursor: text.trim() && !disabled ? 'pointer' : 'default',
          flexShrink: 0
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path
            d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  )
}
export default Composer
