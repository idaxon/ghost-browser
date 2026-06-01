import * as tls from 'tls'
import * as net from 'net'
import { Duplex } from 'stream'
import { queryDoH } from '../../dns/DoHClient'

/**
 * FragmentedSocket
 *
 * A Duplex stream wrapper around a raw TCP socket.
 * Intercepts the FIRST write (TLS ClientHello) and splits it into
 * two separate TCP segments with a timing gap.
 * This defeats DPI engines (Sophos, Fortinet, etc.) that inspect
 * the SNI field in the ClientHello — they can't reassemble
 * fragmented packets in real-time and default to forwarding.
 *
 * TCP_NODELAY must be set on the underlying socket to ensure
 * each write() becomes a separate TCP packet (disables Nagle).
 */
class FragmentedSocket extends Duplex {
  private tcpSocket: net.Socket
  private isFirstWrite = true
  private splitPos: number
  private gapMs: number

  constructor(tcpSocket: net.Socket, splitPos: number, gapMs: number) {
    super({ allowHalfOpen: true })
    this.tcpSocket = tcpSocket
    this.splitPos = splitPos
    this.gapMs = gapMs

    tcpSocket.on('data', (data) => {
      if (!this.push(data)) tcpSocket.pause()
    })
    tcpSocket.on('end', () => this.push(null))
    tcpSocket.on('close', () => this.destroy())
    tcpSocket.on('error', (err) => this.destroy(err))
  }

  _read(): void {
    this.tcpSocket.resume()
  }

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: (err?: Error | null) => void): void {
    if (this.isFirstWrite && Buffer.isBuffer(chunk) && chunk.length > this.splitPos) {
      this.isFirstWrite = false
      const part1 = chunk.subarray(0, this.splitPos)
      const part2 = chunk.subarray(this.splitPos)

      console.log(
        `[GhostStack/Fragment] ClientHello split: ${part1.length}+${part2.length} bytes, ${this.gapMs}ms gap`
      )

      this.tcpSocket.write(part1, () => {
        setTimeout(() => {
          if (!this.tcpSocket.destroyed && this.tcpSocket.writable) {
            this.tcpSocket.write(part2, callback)
          } else {
            callback(new Error('Socket destroyed during fragment delay'))
          }
        }, this.gapMs)
      })
    } else {
      if (!this.tcpSocket.destroyed && this.tcpSocket.writable) {
        this.tcpSocket.write(chunk, callback)
      } else {
        callback(new Error('Socket not writable'))
      }
    }
  }

  _final(callback: (err?: Error | null) => void): void {
    if (!this.tcpSocket.destroyed && this.tcpSocket.writable) {
      try {
        this.tcpSocket.end(callback)
      } catch (e) {
        callback()
      }
    } else {
      callback()
    }
  }

  _destroy(err: Error | null, callback: (err?: Error | null) => void): void {
    if (!this.tcpSocket.destroyed) {
      this.tcpSocket.destroy()
    }
    callback(err)
  }
}

/**
 * GhostHandshake — DPI-Evasion TLS Connection Factory
 *
 * 1. Resolves the real IP via DoH (bypasses DNS hijacking by Sophos).
 * 2. Opens a raw TCP socket to the REAL IP with TCP_NODELAY.
 * 3. Wraps it in a FragmentedSocket that splits the TLS ClientHello.
 * 4. Sophos's transparent proxy can't read the SNI → forwards transparently.
 * 5. The real server (Cloudflare/etc) reassembles and completes the handshake.
 *
 * Tries multiple fragmentation strategies (split positions & delays).
 */
export class GhostHandshake {
  /** Strategies to try in order — different split positions and delays */
  private static STRATEGIES = [
    { splitPos: 1, gapMs: 50, name: '1B+50ms' },
    { splitPos: 5, gapMs: 100, name: '5B+100ms' },
    { splitPos: 3, gapMs: 30, name: '3B+30ms' }
  ]

  /**
   * Establishes a trusted TLS connection with DPI evasion.
   */
  static async establishTrustedConnection(
    targetDomain: string,
    port: number = 443
  ): Promise<tls.TLSSocket> {
    console.log(`[GhostStack/Handshake] Initiating bypass for ${targetDomain}:${port}`)

    // Step 1: Resolve real IP via DoH (bypass DNS hijacking)
    let realIP: string | null = null
    try {
      const results = await queryDoH(targetDomain, 'cloudflare', 3000)
      if (results.length > 0) {
        realIP = results[0].ip
        console.log(`[GhostStack/Handshake] DoH resolved ${targetDomain} → ${realIP}`)
      }
    } catch {
      console.warn(`[GhostStack/Handshake] DoH failed, trying Google...`)
    }

    if (!realIP) {
      try {
        const results = await queryDoH(targetDomain, 'google', 3000)
        if (results.length > 0) {
          realIP = results[0].ip
          console.log(`[GhostStack/Handshake] Google DoH resolved ${targetDomain} → ${realIP}`)
        }
      } catch {
        console.warn(`[GhostStack/Handshake] Google DoH also failed, using system DNS`)
      }
    }

    const connectHost = realIP || targetDomain

    // Step 2: Try each fragmentation strategy
    let lastError: Error | null = null
    for (const strategy of this.STRATEGIES) {
      try {
        const socket = await this.connectFragmented(
          connectHost,
          port,
          targetDomain,
          strategy.splitPos,
          strategy.gapMs
        )
        console.log(`[GhostStack/Handshake] ✅ TLS established via strategy ${strategy.name}`)
        return socket
      } catch (err) {
        lastError = err as Error
        console.warn(
          `[GhostStack/Handshake] Strategy ${strategy.name} failed: ${(err as Error).message}`
        )
      }
    }

    throw lastError || new Error('All DPI bypass strategies failed')
  }

  /**
   * Attempt a single fragmented TLS connection.
   */
  private static connectFragmented(
    host: string,
    port: number,
    sni: string,
    splitPos: number,
    gapMs: number
  ): Promise<tls.TLSSocket> {
    return new Promise((resolve, reject) => {
      const tcpSocket = net.connect({ host, port })

      // CRITICAL: Disable Nagle's algorithm so each write() = separate TCP packet
      tcpSocket.setNoDelay(true)

      const tcpTimeout = setTimeout(() => {
        tcpSocket.destroy()
        reject(new Error('TCP Connection Timeout'))
      }, 6000)

      tcpSocket.once('connect', () => {
        clearTimeout(tcpTimeout)

        // Wrap in fragmenting Duplex stream
        const wrapper = new FragmentedSocket(tcpSocket, splitPos, gapMs)

        const tlsSocket = tls.connect(
          {
            socket: wrapper as any,
            servername: sni,
            rejectUnauthorized: false,
            ALPNProtocols: ['http/1.1']
          },
          () => {
            // Clear TLS timeout on success
            tlsSocket.setTimeout(0)
            resolve(tlsSocket)
          }
        )

        tlsSocket.on('error', (err) => {
          reject(err)
        })

        tlsSocket.setTimeout(8000, () => {
          tlsSocket.destroy()
          reject(new Error('TLS Handshake Timeout'))
        })
      })

      tcpSocket.on('error', (err) => {
        clearTimeout(tcpTimeout)
        reject(err)
      })
    })
  }
}
