/**
 * GhostStack Traffic Shaper
 * Shapes packet timing and sizes to mimic Google Meet video call traffic.
 * Defeats Sophos DPI statistical analysis by making bypass traffic
 * indistinguishable from legitimate video conferencing.
 * @module TrafficShaper
 */

/** Traffic shaping profile */
interface TrafficProfile {
  /** Minimum packet size in bytes */
  minPacketSize: number
  /** Maximum packet size in bytes */
  maxPacketSize: number
  /** Minimum inter-packet gap in ms */
  minGapMs: number
  /** Maximum inter-packet gap in ms */
  maxGapMs: number
  /** Heartbeat interval in ms (mimics RTCP keep-alive) */
  heartbeatIntervalMs: number
}

/** Predefined traffic profiles that mimic real applications */
const PROFILES: Record<string, TrafficProfile> = {
  googleMeet: {
    minPacketSize: 1200,
    maxPacketSize: 1400,
    minGapMs: 0,
    maxGapMs: 3,
    heartbeatIntervalMs: 5000
  },
  zoom: {
    minPacketSize: 1100,
    maxPacketSize: 1350,
    minGapMs: 1,
    maxGapMs: 5,
    heartbeatIntervalMs: 3000
  },
  teams: {
    minPacketSize: 1150,
    maxPacketSize: 1380,
    minGapMs: 0,
    maxGapMs: 4,
    heartbeatIntervalMs: 4000
  }
}

/**
 * Traffic Shaper — makes bypass traffic look like video conferencing.
 * Applies randomized packet sizes and timing jitter to defeat
 * deep packet inspection statistical analysis.
 */
export class TrafficShaper {
  private activeProfile: TrafficProfile
  private heartbeatTimers: Set<ReturnType<typeof setInterval>> = new Set()

  constructor(profileName: string = 'googleMeet') {
    this.activeProfile = PROFILES[profileName] || PROFILES.googleMeet
  }

  /**
   * Apply traffic shaping to a TLS socket.
   * Wraps the socket's write method to add jitter and padding.
   * @param socket - TLS socket to shape
   */
  shapeSocket(socket: any): void {
    if (!socket || socket.destroyed) return

    const profile = this.activeProfile
    const originalWrite = socket.write.bind(socket)

    // Override write to add padding and jitter
    socket.write = (data: Buffer | string, ...args: any[]) => {
      try {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
        const shaped = this.padPacket(buf, profile)

        // Add random jitter before sending
        const jitter = this.randomRange(profile.minGapMs, profile.maxGapMs)
        if (jitter > 0) {
          setTimeout(() => {
            try {
              originalWrite(shaped, ...args)
            } catch {
              // Socket may have been destroyed
            }
          }, jitter)
        } else {
          originalWrite(shaped, ...args)
        }
      } catch {
        // Fallback to original write
        originalWrite(data, ...args)
      }
    }

    // Start heartbeat to mimic RTCP keep-alive
    this.startHeartbeat(socket, profile)
  }

  /**
   * Pad a packet to a random size within the profile range.
   * @param data - Original packet data
   * @param profile - Traffic profile
   * @returns Padded packet buffer
   */
  private padPacket(data: Buffer, profile: TrafficProfile): Buffer {
    const targetSize = this.randomRange(profile.minPacketSize, profile.maxPacketSize)

    if (data.length >= targetSize) return data

    // Create padded buffer with random bytes
    const padded = Buffer.alloc(targetSize)
    data.copy(padded)

    // Fill remaining with random bytes (looks like encrypted data)
    const crypto = require('crypto')
    crypto.randomFillSync(padded, data.length)

    return padded
  }

  /**
   * Start a heartbeat timer that sends small keep-alive packets.
   * Mimics RTCP heartbeat pattern seen in video conferencing.
   * @param socket - Socket to send heartbeats on
   * @param profile - Traffic profile
   */
  private startHeartbeat(socket: any, profile: TrafficProfile): void {
    const timer = setInterval(() => {
      if (socket.destroyed) {
        clearInterval(timer)
        this.heartbeatTimers.delete(timer)
        return
      }

      try {
        // Small heartbeat packet (RTCP-like)
        const crypto = require('crypto')
        const heartbeat = crypto.randomBytes(64)
        socket.write(heartbeat)
      } catch {
        clearInterval(timer)
        this.heartbeatTimers.delete(timer)
      }
    }, profile.heartbeatIntervalMs)

    this.heartbeatTimers.add(timer)
  }

  /**
   * Generate a random integer in range [min, max].
   * @param min - Minimum value
   * @param max - Maximum value
   * @returns Random integer
   */
  private randomRange(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min
  }

  /**
   * Set the active traffic profile.
   * @param profileName - Profile name: 'googleMeet', 'zoom', or 'teams'
   */
  setProfile(profileName: string): void {
    this.activeProfile = PROFILES[profileName] || PROFILES.googleMeet
  }

  /**
   * Clean up all heartbeat timers.
   */
  destroy(): void {
    for (const timer of this.heartbeatTimers) {
      clearInterval(timer)
    }
    this.heartbeatTimers.clear()
  }
}
