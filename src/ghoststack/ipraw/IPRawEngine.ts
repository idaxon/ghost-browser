/**
 * GhostStack IPRaw Bypass Engine
 * Connects directly to discovered IP while hiding the domain name from DPI.
 * Uses ECH (Encrypted Client Hello) + QUIC + Traffic Shaping.
 * @module IPRawEngine
 */

import { ECHHandler } from './ECHHandler'
import { QuicTransport } from './QuicTransport'
import { TrafficShaper } from './TrafficShaper'

/** IPRaw bypass options */
export interface IPRawOptions {
  useECH: boolean
  useQuic: boolean
  useTrafficShaping: boolean
  cdn: string | null
}

/** IPRaw bypass result */
export interface IPRawResult {
  success: boolean
  method: string
  latencyMs: number
  error?: string
}

/**
 * IPRaw Engine — direct IP connection with DPI evasion.
 * Skips DNS entirely and connects to the discovered IP address.
 * Hides the domain name in the TLS handshake using ECH.
 */
export class IPRawEngine {
  private echHandler: ECHHandler
  private quicTransport: QuicTransport
  private trafficShaper: TrafficShaper

  constructor() {
    this.echHandler = new ECHHandler()
    this.quicTransport = new QuicTransport()
    this.trafficShaper = new TrafficShaper()
  }

  /**
   * Attempt to bypass a block by connecting directly to the IP.
   * Tries QUIC first (if enabled), then ECH over TCP TLS 1.3.
   * @param ip - Real IP address of the target server
   * @param domain - Domain name (used for SNI/certificate verification)
   * @param options - Bypass options
   * @returns Bypass result
   */
  async bypass(ip: string, domain: string, options: IPRawOptions): Promise<IPRawResult> {
    const start = Date.now()

    // Step 1: Try QUIC transport if enabled
    if (options.useQuic) {
      try {
        const quicResult = await this.quicTransport.connect(ip, domain, 443)
        if (quicResult.success) {
          return {
            success: true,
            method: 'QUIC_DIRECT',
            latencyMs: Date.now() - start
          }
        }
      } catch {
        // QUIC failed, fall through to ECH
      }
    }

    // Step 2: Try ECH (Encrypted Client Hello)
    if (options.useECH) {
      try {
        const echResult = await this.echHandler.connect(ip, domain, {
          cdnHostname: this.getCDNHostname(options.cdn),
          trafficShaping: options.useTrafficShaping ? this.trafficShaper : null
        })
        if (echResult.success) {
          return {
            success: true,
            method: `ECH_${options.cdn?.toUpperCase() || 'DIRECT'}`,
            latencyMs: Date.now() - start
          }
        }
      } catch {
        // ECH failed, fall through to direct TLS
      }
    }

    // Step 3: Direct TLS 1.3 connection (no ECH)
    try {
      const directResult = await this.directTLSConnect(ip, domain, options.useTrafficShaping)
      if (directResult) {
        return {
          success: true,
          method: 'TLS13_DIRECT',
          latencyMs: Date.now() - start
        }
      }
    } catch {
      // Direct TLS failed
    }

    return {
      success: false,
      method: 'NONE',
      latencyMs: Date.now() - start,
      error: 'All IPRaw methods failed'
    }
  }

  /**
   * Direct TLS 1.3 connection to IP with optional traffic shaping.
   * @param ip - Target IP
   * @param domain - Target domain for SNI
   * @param shapeTraffic - Whether to apply traffic shaping
   * @returns true if connection succeeded
   */
  private async directTLSConnect(
    ip: string,
    domain: string,
    shapeTraffic: boolean
  ): Promise<boolean> {
    const tls = require('tls')

    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000)

      try {
        const options: any = {
          host: ip,
          port: 443,
          servername: domain,
          minVersion: 'TLSv1.3',
          maxVersion: 'TLSv1.3',
          rejectUnauthorized: false,
          timeout: 5000
        }

        const socket = tls.connect(options, () => {
          clearTimeout(timer)

          // Verify certificate matches domain
          try {
            const cert = socket.getPeerCertificate()
            if (cert && cert.subject) {
              const cn = cert.subject.CN || ''
              const altNames = cert.subjectaltname || ''
              const matches =
                cn === domain ||
                cn === `*.${domain.split('.').slice(1).join('.')}` ||
                altNames.toLowerCase().includes(domain.toLowerCase())

              if (matches) {
                // Apply traffic shaping if enabled
                if (shapeTraffic) {
                  this.trafficShaper.shapeSocket(socket)
                }
                socket.destroy()
                resolve(true)
                return
              }
            }
          } catch {
            // Certificate check failed
          }

          socket.destroy()
          resolve(false)
        })

        socket.on('error', () => {
          clearTimeout(timer)
          resolve(false)
        })

        socket.on('timeout', () => {
          clearTimeout(timer)
          socket.destroy()
          resolve(false)
        })
      } catch {
        clearTimeout(timer)
        resolve(false)
      }
    })
  }

  /**
   * Get the CDN hostname for ECH outer SNI.
   * The firewall sees a connection to a legitimate CDN hostname.
   * @param cdn - Detected CDN name
   * @returns CDN hostname to use as outer SNI
   */
  private getCDNHostname(cdn: string | null): string {
    switch (cdn) {
      case 'google':
        return 'www.google.com'
      case 'cloudflare':
        return 'cloudflare.com'
      case 'fastly':
        return 'fastly.com'
      case 'akamai':
        return 'akamai.com'
      case 'amazon':
        return 'amazonaws.com'
      default:
        return 'cloudflare.com'
    }
  }
}
