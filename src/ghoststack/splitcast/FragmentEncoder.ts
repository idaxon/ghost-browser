/**
 * GhostStack Fragment Encoder
 * Fragments data into N encrypted pieces for TCP segmentation.
 * Each fragment is AES-256-GCM encrypted with a session key.
 * @module FragmentEncoder
 */

import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'

/** Encrypted fragment */
export interface Fragment {
  sequence: number
  data: Buffer
  iv: Buffer
  authTag: Buffer
}

/**
 * Fragment Encoder — splits data into encrypted fragments.
 * Used by SplitCast to segment TLS handshakes and by
 * the carrier system for request splitting.
 */
export class FragmentEncoder {
  private sessionKey: Buffer

  constructor() {
    // Fresh random key per session
    this.sessionKey = randomBytes(32)
  }

  /**
   * Fragment a buffer into N pieces.
   * Each piece is independently usable for TCP segmentation.
   * @param data - Data to fragment
   * @param count - Number of fragments (3, 5, or 7)
   * @returns Array of buffer fragments
   */
  fragment(data: Buffer, count: number): Buffer[] {
    const fragments: Buffer[] = []
    const chunkSize = Math.ceil(data.length / count)

    for (let i = 0; i < count; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, data.length)

      if (start < data.length) {
        fragments.push(data.subarray(start, end))
      }
    }

    return fragments
  }

  /**
   * Encrypt and fragment data into N pieces.
   * Each fragment is AES-256-GCM encrypted.
   * @param data - Data to encrypt and fragment
   * @param count - Number of fragments
   * @returns Array of encrypted fragments
   */
  encryptAndFragment(data: Buffer, count: number): Fragment[] {
    const fragments: Fragment[] = []
    const chunkSize = Math.ceil(data.length / count)

    for (let i = 0; i < count; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, data.length)

      if (start < data.length) {
        const chunk = data.subarray(start, end)
        const encrypted = this.encrypt(chunk)
        fragments.push({
          sequence: i,
          ...encrypted
        })
      }
    }

    return fragments
  }

  /**
   * Decrypt and reassemble fragments.
   * @param fragments - Encrypted fragments sorted by sequence
   * @returns Reassembled original data
   */
  decryptAndReassemble(fragments: Fragment[]): Buffer {
    const sorted = [...fragments].sort((a, b) => a.sequence - b.sequence)
    const decrypted: Buffer[] = []

    for (const fragment of sorted) {
      const plain = this.decrypt(fragment.data, fragment.iv, fragment.authTag)
      decrypted.push(plain)
    }

    return Buffer.concat(decrypted)
  }

  /**
   * Encrypt data with AES-256-GCM.
   * @param data - Plaintext data
   * @returns Encrypted data with IV and auth tag
   */
  private encrypt(data: Buffer): { data: Buffer; iv: Buffer; authTag: Buffer } {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.sessionKey, iv)
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
    const authTag = cipher.getAuthTag()

    return { data: encrypted, iv, authTag }
  }

  /**
   * Decrypt AES-256-GCM encrypted data.
   * @param data - Encrypted data
   * @param iv - Initialization vector
   * @param authTag - Authentication tag
   * @returns Decrypted plaintext
   */
  private decrypt(data: Buffer, iv: Buffer, authTag: Buffer): Buffer {
    const decipher = createDecipheriv('aes-256-gcm', this.sessionKey, iv)
    decipher.setAuthTag(authTag)
    return Buffer.concat([decipher.update(data), decipher.final()])
  }

  /**
   * Rotate the session key. Called when starting a new session.
   */
  rotateKey(): void {
    this.sessionKey = randomBytes(32)
  }
}
