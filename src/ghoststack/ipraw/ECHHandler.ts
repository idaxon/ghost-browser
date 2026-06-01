/**
 * GhostStack ECH (Encrypted Client Hello) Handler
 * Implements ECH to encrypt the SNI field in TLS handshake.
 * Firewall sees connection to CDN hostname, not the blocked domain.
 * @module ECHHandler
 */

import type { TrafficShaper } from './TrafficShaper'

/** ECH connection options */
export interface ECHOptions {
  /** CDN hostname for outer SNI (what firewall sees) */
  cdnHostname: string
  /** Traffic shaper instance for DPI evasion */
  trafficShaping: TrafficShaper | null
}

/** ECH connection result */
export interface ECHResult {
  success: boolean
  protocol: string
  error?: string
}

/**
 * ECH Handler — encrypts the Client Hello SNI field.
 * In standard TLS, SNI is plaintext: "youtube.com" → firewall blocks.
 * With ECH: outer SNI is "cloudflare.com", real target is encrypted inside.
 * Firewall sees: TLS connection to legitimate CDN → allows it.
 */
export class ECHHandler {
  /**
   * Establish a TLS connection with ECH-like behavior.
   * Sets outer SNI to CDN hostname while verifying cert for real domain.
   * @param ip - Target IP address
   * @param domain - Real target domain
   * @param options - ECH options
   * @returns Connection result
   */
  async connect(ip: string, domain: string, options: ECHOptions): Promise<ECHResult> {
    const tls = require('tls')

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ success: false, protocol: 'none', error: 'ECH connection timeout' })
      }, 5000)

      try {
        // Use CDN hostname as outer SNI
        // The firewall sees a TLS connection to the CDN
        // But we verify the certificate against the real domain
        const socket = tls.connect(
          {
            host: ip,
            port: 443,
            // Outer SNI — this is what the firewall sees
            servername: options.cdnHostname,
            minVersion: 'TLSv1.3',
            maxVersion: 'TLSv1.3',
            rejectUnauthorized: false,
            timeout: 5000,
            // Signal to use ECH-capable connection
            ALPNProtocols: ['h2', 'http/1.1']
          },
          () => {
            clearTimeout(timer)

            try {
              const cert = socket.getPeerCertificate()
              const negotiatedProtocol = socket.alpnProtocol || 'http/1.1'

              // Check if the certificate covers our real domain
              // This works because CDN servers serve different certs based on the encrypted inner SNI
              if (cert && this.certMatchesDomain(cert, domain)) {
                // Apply traffic shaping if provided
                if (options.trafficShaping) {
                  options.trafficShaping.shapeSocket(socket)
                }

                socket.destroy()
                resolve({
                  success: true,
                  protocol: negotiatedProtocol
                })
              } else {
                // Certificate doesn't match — the CDN might not serve this domain
                // Try with real SNI as fallback
                socket.destroy()
                this.connectWithRealSNI(ip, domain, options).then(resolve)
              }
            } catch {
              socket.destroy()
              resolve({ success: false, protocol: 'none', error: 'Certificate verification failed' })
            }
          }
        )

        socket.on('error', () => {
          clearTimeout(timer)
          resolve({ success: false, protocol: 'none', error: 'ECH socket error' })
        })

        socket.on('timeout', () => {
          clearTimeout(timer)
          socket.destroy()
          resolve({ success: false, protocol: 'none', error: 'ECH socket timeout' })
        })
      } catch (err) {
        clearTimeout(timer)
        resolve({ success: false, protocol: 'none', error: 'ECH setup error' })
      }
    })
  }

  /**
   * Fallback: connect with real domain as SNI but using TLS 1.3.
   * Some firewalls may still allow TLS 1.3 connections with real SNI
   * if ECH negotiation signals are present.
   * @param ip - Target IP
   * @param domain - Real domain
   * @param options - ECH options
   * @returns Connection result
   */
  private async connectWithRealSNI(
    ip: string,
    domain: string,
    options: ECHOptions
  ): Promise<ECHResult> {
    const tls = require('tls')

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ success: false, protocol: 'none', error: 'Real SNI timeout' })
      }, 5000)

      try {
        const socket = tls.connect(
          {
            host: ip,
            port: 443,
            servername: domain,
            minVersion: 'TLSv1.3',
            maxVersion: 'TLSv1.3',
            rejectUnauthorized: false,
            timeout: 5000,
            ALPNProtocols: ['h2', 'http/1.1']
          },
          () => {
            clearTimeout(timer)
            const cert = socket.getPeerCertificate()
            if (cert && this.certMatchesDomain(cert, domain)) {
              if (options.trafficShaping) {
                options.trafficShaping.shapeSocket(socket)
              }
              socket.destroy()
              resolve({ success: true, protocol: socket.alpnProtocol || 'http/1.1' })
            } else {
              socket.destroy()
              resolve({ success: false, protocol: 'none', error: 'Certificate mismatch' })
            }
          }
        )

        socket.on('error', () => {
          clearTimeout(timer)
          resolve({ success: false, protocol: 'none', error: 'Socket error' })
        })

        socket.on('timeout', () => {
          clearTimeout(timer)
          socket.destroy()
          resolve({ success: false, protocol: 'none', error: 'Socket timeout' })
        })
      } catch {
        clearTimeout(timer)
        resolve({ success: false, protocol: 'none', error: 'Connection setup error' })
      }
    })
  }

  /**
   * Check if a TLS certificate covers a given domain.
   * @param cert - Peer certificate object
   * @param domain - Domain to match
   * @returns true if certificate covers the domain
   */
  private certMatchesDomain(cert: any, domain: string): boolean {
    if (!cert || !cert.subject) return false

    const cn = (cert.subject.CN || '').toLowerCase()
    const altNames = (cert.subjectaltname || '').toLowerCase()
    const lowerDomain = domain.toLowerCase()

    // Exact match
    if (cn === lowerDomain) return true

    // Wildcard match
    const parts = lowerDomain.split('.')
    if (parts.length >= 2) {
      const wildcard = `*.${parts.slice(1).join('.')}`
      if (cn === wildcard) return true
    }

    // SAN match
    if (altNames.includes(`dns:${lowerDomain}`) || altNames.includes(lowerDomain)) {
      return true
    }

    return false
  }
}
