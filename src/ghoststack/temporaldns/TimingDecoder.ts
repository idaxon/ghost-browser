/**
 * GhostStack Timing Decoder
 * Decodes IP addresses from response timing patterns.
 * Companion to TimingEncoder for the covert DNS channel.
 * @module TimingDecoder
 */

/**
 * Timing Decoder — extracts IP addresses from timing measurements.
 * Analyzes response latency patterns to reconstruct IP octets.
 */
export class TimingDecoder {
  /** Base timing unit for calibration */
  private readonly BASE_UNIT = 10

  /**
   * Decode an IP address from response timing measurements.
   * Uses statistical analysis to extract signal from network jitter.
   * @param timings - Array of response time measurements in ms
   * @returns Decoded IP address string or null
   */
  decode(timings: number[]): string | null {
    if (timings.length < 4) return null

    try {
      // Analyze timing distribution to extract 4 octets
      // Each group of timings represents one IP octet
      const octets: number[] = []
      const groupSize = Math.floor(timings.length / 4)

      for (let i = 0; i < 4; i++) {
        const group = timings.slice(i * groupSize, (i + 1) * groupSize)
        const octet = this.extractOctet(group)
        if (octet < 0 || octet > 255) return null
        octets.push(octet)
      }

      return octets.join('.')
    } catch {
      return null
    }
  }

  /**
   * Decode IP from binary timing pattern (10ms = 0, 20ms = 1).
   * @param timings - Binary-encoded timing measurements
   * @returns Decoded IP address or null
   */
  decodeBinary(timings: number[]): string | null {
    if (timings.length < 32) return null // Need at least 32 bits for an IPv4

    try {
      const octets: number[] = []

      for (let octet = 0; octet < 4; octet++) {
        let value = 0
        for (let bit = 0; bit < 8; bit++) {
          const idx = octet * 8 + bit
          if (idx >= timings.length) return null

          // Threshold: < 15ms = 0, >= 15ms = 1
          const threshold = this.BASE_UNIT * 1.5
          const bitValue = timings[idx] >= threshold ? 1 : 0
          value = (value << 1) | bitValue
        }

        if (value < 0 || value > 255) return null
        octets.push(value)
      }

      return octets.join('.')
    } catch {
      return null
    }
  }

  /**
   * Extract a single IP octet from a group of timing measurements.
   * Uses median timing to reduce jitter impact.
   * @param group - Group of timing measurements
   * @returns Extracted octet value (0-255)
   */
  private extractOctet(group: number[]): number {
    if (group.length === 0) return 0

    // Sort and take median
    const sorted = [...group].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]

    // Map median timing to octet value
    // Calibrate: baseline response time maps to 0, max maps to 255
    const baseline = Math.min(...sorted)
    const normalized = Math.max(0, median - baseline)

    // Scale to 0-255 range based on timing unit
    return Math.min(255, Math.round(normalized / this.BASE_UNIT))
  }

  /**
   * Calibrate the decoder with known timing measurements.
   * @param knownIP - Known IP address for calibration
   * @param timings - Timing measurements for the known IP
   */
  calibrate(_knownIP: string, _timings: number[]): void {
    // Future: adaptive calibration based on network conditions
    // For now, the fixed threshold works for most networks
  }
}
