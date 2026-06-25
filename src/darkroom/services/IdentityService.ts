import { generateIdentityKeyPair } from '../crypto'
import { Identity } from '../types'

const IDENTITY_KEY = 'dr_identity_v1'

export class IdentityService {
  private static instance: IdentityService
  private cachedIdentity: Identity | null = null

  private constructor() {
    // Empty private constructor for singleton pattern
  }

  public static getInstance(): IdentityService {
    if (!IdentityService.instance) {
      IdentityService.instance = new IdentityService()
    }
    return IdentityService.instance
  }

  public getIdentity(): Identity {
    if (this.cachedIdentity) {
      return this.cachedIdentity
    }

    const stored = localStorage.getItem(IDENTITY_KEY)
    if (stored) {
      try {
        const id = JSON.parse(stored) as Identity
        if (id.pubKey && id.privKey && id.ghostId) {
          this.cachedIdentity = id
          return id
        }
      } catch (e) {
        console.error('[IdentityService] Failed to parse cached identity, generating new one:', e)
      }
    }

    const kp = generateIdentityKeyPair()
    const id: Identity = {
      pubKey: kp.publicKey,
      privKey: kp.secretKey,
      ghostId: kp.ghostId
    }

    localStorage.setItem(IDENTITY_KEY, JSON.stringify(id))
    this.cachedIdentity = id
    return id
  }

  public resetIdentity(): Identity {
    localStorage.removeItem(IDENTITY_KEY)
    this.cachedIdentity = null
    return this.getIdentity()
  }
}

export const identityService = IdentityService.getInstance()
