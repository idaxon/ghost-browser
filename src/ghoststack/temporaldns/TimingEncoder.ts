/**
 * GhostStack Timing Encoder
 * Encodes domain names into timing sequences for covert DNS resolution.
 * Each character is encoded as a specific delay value.
 * @module TimingEncoder
 */

/**
 * Timing Encoder — converts domain strings to delay sequences.
 * The delay pattern encodes the domain name in a way that
 * can survive network jitter through redundancy.
 */
export class TimingEncoder {
  /** Base delay unit in milliseconds */
  private readonly BASE_DELAY = 10

  /**
   * Encode a domain name into a timing sequence.
   * Each character becomes a delay value.
   * @param domain - Domain to encode
   * @returns Array of delay values in milliseconds
   */
  encode(domain: string): number[] {
    const delays: number[] = []

    // Start marker
    delays.push(this.BASE_DELAY * 5)

    for (let i = 0; i < domain.length; i++) {
      const charCode = domain.charCodeAt(i)
      // Map character to delay: a-z = 10-360ms, digits = 370-460ms, . = 470ms
      if (charCode >= 97 && charCode <= 122) {
        // lowercase a-z
        delays.push(this.BASE_DELAY * (charCode - 96))
      } else if (charCode >= 48 && charCode <= 57) {
        // digits 0-9
        delays.push(this.BASE_DELAY * (charCode - 48 + 37))
      } else if (charCode === 46) {
        // dot
        delays.push(this.BASE_DELAY * 47)
      } else if (charCode === 45) {
        // hyphen
        delays.push(this.BASE_DELAY * 48)
      } else {
        // other characters
        delays.push(this.BASE_DELAY * 49)
      }
    }

    // End marker
    delays.push(this.BASE_DELAY * 50)

    return delays
  }

  /**
   * Encode a domain into binary timing (bit 0 = 10ms, bit 1 = 20ms).
   * @param domain - Domain to encode
   * @returns Array of binary-encoded delays
   */
  encodeBinary(domain: string): number[] {
    const delays: number[] = []
    const bytes = Buffer.from(domain, 'ascii')

    for (const byte of bytes) {
      for (let bit = 7; bit >= 0; bit--) {
        const isSet = (byte >> bit) & 1
        delays.push(isSet ? 20 : 10)
      }
    }

    return delays
  }
}
