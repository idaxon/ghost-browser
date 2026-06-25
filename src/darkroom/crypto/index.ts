import nacl from 'tweetnacl'

// ── UTF-8 and Base64 Encoders/Decoders ─────────────────────────────────────────

export function encodeUtf8(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

export function decodeUtf8(arr: Uint8Array): string {
  return new TextDecoder().decode(arr)
}

export function encodeBase64(arr: Uint8Array): string {
  return btoa(String.fromCharCode(...arr))
}

export function decodeBase64(str: string): Uint8Array {
  return new Uint8Array([...atob(str)].map((c) => c.charCodeAt(0)))
}

// ── Ghost ID derivation ────────────────────────────────────────────────────────

export function deriveGhostId(pubKeyB64: string): string {
  // First 6 alphanumeric chars of base64 pubkey, lowercased, prefixed with "ghost-"
  const cleaned = pubKeyB64.replace(/[^a-zA-Z0-9]/g, '')
  return 'ghost-' + cleaned.slice(0, 6).toLowerCase()
}

// ── Key Pair Generation ────────────────────────────────────────────────────────

export interface KeyPair {
  publicKey: string // base64
  secretKey: string // base64
  ghostId: string
}

export function generateIdentityKeyPair(): KeyPair {
  const keyPair = nacl.box.keyPair()
  const publicKey = encodeBase64(keyPair.publicKey)
  const secretKey = encodeBase64(keyPair.secretKey)
  const ghostId = deriveGhostId(publicKey)
  return { publicKey, secretKey, ghostId }
}

// ── DH Shared Secret Derivation ────────────────────────────────────────────────

export function deriveSharedSecret(mySecretKeyB64: string, peerPublicKeyB64: string): Uint8Array {
  return nacl.box.before(decodeBase64(peerPublicKeyB64), decodeBase64(mySecretKeyB64))
}

// ── XSalsa20-Poly1305 Symmetric Encryption ─────────────────────────────────────

export interface EncryptedData {
  ciphertext: string // base64
  nonce: string // base64
}

export function encryptSymmetric(plaintext: string, key: Uint8Array): EncryptedData {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength)
  const boxed = nacl.secretbox(encodeUtf8(plaintext), nonce, key)
  return {
    ciphertext: encodeBase64(boxed),
    nonce: encodeBase64(nonce)
  }
}

export function decryptSymmetric(
  ciphertext: string,
  nonce: string,
  key: Uint8Array
): string | null {
  try {
    const opened = nacl.secretbox.open(decodeBase64(ciphertext), decodeBase64(nonce), key)
    return opened ? decodeUtf8(opened) : null
  } catch (err) {
    console.error('[Crypto] Symmetric decryption failed:', err)
    return null
  }
}

// ── Curve25519 nacl.box Asymmetric Encryption ───────────────────────────

export function encryptAsymmetric(
  plaintext: string,
  peerPubKeyB64: string,
  mySecretKeyB64: string
): EncryptedData {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const boxed = nacl.box(
    encodeUtf8(plaintext),
    nonce,
    decodeBase64(peerPubKeyB64),
    decodeBase64(mySecretKeyB64)
  )
  return {
    ciphertext: encodeBase64(boxed),
    nonce: encodeBase64(nonce)
  }
}

export function decryptAsymmetric(
  ciphertext: string,
  nonce: string,
  peerPubKeyB64: string,
  mySecretKeyB64: string
): string | null {
  try {
    const opened = nacl.box.open(
      decodeBase64(ciphertext),
      decodeBase64(nonce),
      decodeBase64(peerPubKeyB64),
      decodeBase64(mySecretKeyB64)
    )
    return opened ? decodeUtf8(opened) : null
  } catch (err) {
    console.error('[Crypto] Asymmetric decryption failed:', err)
    return null
  }
}

// ── Safety Number / Fingerprint UX Helper ──────────────────────────────────────

export async function deriveSafetyNumber(pubKey1B64: string, pubKey2B64: string): Promise<string> {
  const keys = [pubKey1B64, pubKey2B64].sort()
  const data = encodeUtf8(keys[0] + keys[1])

  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer)

  const view = new DataView(hashBuffer)
  let digits = ''
  for (let i = 0; i < 8; i++) {
    // Extract 32-bit values and modulo 100000 to get a 5-digit block
    const val = view.getUint32(i * 4, true) % 100000
    digits += val.toString().padStart(5, '0') + ' '
  }
  return digits.trim()
}
