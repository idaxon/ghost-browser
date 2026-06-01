/**
 * GhostStack DNS-over-HTTPS Client
 * Performs encrypted DNS queries via HTTPS to bypass local DNS filtering.
 * Supports Cloudflare, Google, NextDNS, and Quad9 DoH providers.
 * @module DoHClient
 */

import { net } from 'electron'

export interface DoHResponse {
  Status: number
  Answer?: Array<{
    name: string
    type: number
    TTL: number
    data: string
  }>
}

export interface ResolvedRecord {
  ip: string
  ttl: number
  provider: string
}

/** Known DoH provider endpoints */
export const DOH_PROVIDERS = {
  cloudflare: 'https://1.1.1.1/dns-query',
  google: 'https://8.8.8.8/resolve',
  nextdns: 'https://dns.nextdns.io/dns-query',
  quad9: 'https://dns.quad9.net:5053/dns-query',
  adguard: 'https://dns.adguard-dns.com/dns-query',
  mullvad: 'https://dns.mullvad.net/dns-query',
  libredns: 'https://doh.libredns.gr/dns-query',
  swiss: 'https://dns.digitale-gesellschaft.ch/dns-query'
} as const

export type DoHProvider = keyof typeof DOH_PROVIDERS

/**
 * Perform a DNS-over-HTTPS query to a specific provider.
 * All queries are encrypted — firewalls cannot read the domain being resolved.
 * @param domain - Domain to resolve
 * @param provider - DoH provider to use
 * @param timeout - Timeout in milliseconds (default 5000)
 * @param recordType - 'A' for IPv4, 'AAAA' for IPv6 (default 'A')
 * @returns Array of resolved records
 */
export async function queryDoH(
  domain: string,
  provider: DoHProvider,
  timeout = 5000,
  recordType: 'A' | 'AAAA' = 'A'
): Promise<ResolvedRecord[]> {
  const baseUrl = DOH_PROVIDERS[provider]
  const url = `${baseUrl}?name=${encodeURIComponent(domain)}&type=${recordType}`
  const expectedType = recordType === 'A' ? 1 : 28

  return new Promise((resolve) => {
    const results: ResolvedRecord[] = []

    try {
      const request = net.request({
        url,
        method: 'GET'
      })

      request.setHeader('Accept', 'application/dns-json')

      const timer = setTimeout(() => {
        request.abort()
        resolve(results)
      }, timeout)

      request.on('response', (response) => {
        let body = ''

        response.on('data', (chunk) => {
          body += chunk.toString()
        })

        response.on('end', () => {
          clearTimeout(timer)
          try {
            const json: DoHResponse = JSON.parse(body)
            if (json.Status === 0 && json.Answer) {
              for (const answer of json.Answer) {
                // Type 1 = A record (IPv4), Type 28 = AAAA record (IPv6)
                if (answer.type === expectedType) {
                  results.push({
                    ip: answer.data,
                    ttl: answer.TTL,
                    provider
                  })
                }
              }
            }
          } catch {
            // Parse error — return empty
          }
          resolve(results)
        })

        response.on('error', () => {
          clearTimeout(timer)
          resolve(results)
        })
      })

      request.on('error', () => {
        clearTimeout(timer)
        resolve(results)
      })

      request.end()
    } catch {
      resolve(results)
    }
  })
}

/**
 * Query a domain via CNAME resolution over DoH.
 * Used for CNAME cloaking detection.
 * @param domain - Domain to check for CNAME records
 * @param provider - DoH provider to use
 * @param timeout - Timeout in milliseconds
 * @returns Array of CNAME records
 */
export async function queryCNAME(
  domain: string,
  provider: DoHProvider = 'cloudflare',
  timeout = 5000
): Promise<string[]> {
  const baseUrl = DOH_PROVIDERS[provider]
  const url = `${baseUrl}?name=${encodeURIComponent(domain)}&type=CNAME`

  return new Promise((resolve) => {
    const results: string[] = []

    try {
      const request = net.request({ url, method: 'GET' })
      request.setHeader('Accept', 'application/dns-json')

      const timer = setTimeout(() => {
        request.abort()
        resolve(results)
      }, timeout)

      request.on('response', (response) => {
        let body = ''
        response.on('data', (chunk) => {
          body += chunk.toString()
        })
        response.on('end', () => {
          clearTimeout(timer)
          try {
            const json: DoHResponse = JSON.parse(body)
            if (json.Status === 0 && json.Answer) {
              for (const answer of json.Answer) {
                // Type 5 = CNAME record
                if (answer.type === 5) {
                  results.push(answer.data)
                }
              }
            }
          } catch {
            // Parse error
          }
          resolve(results)
        })
        response.on('error', () => {
          clearTimeout(timer)
          resolve(results)
        })
      })

      request.on('error', () => {
        clearTimeout(timer)
        resolve(results)
      })

      request.end()
    } catch {
      resolve(results)
    }
  })
}

/**
 * Multi-provider DoH consensus query.
 * Queries all 4 providers simultaneously and returns the IP that 2+ agree on.
 * @param domain - Domain to resolve
 * @returns Consensus IP and the method used, or null if all fail
 */
export async function consensusResolve(
  domain: string
): Promise<{ ip: string; provider: string } | null> {
  const providers: DoHProvider[] = ['cloudflare', 'google', 'nextdns', 'quad9']

  const results = await Promise.all(providers.map((p) => queryDoH(domain, p, 5000)))

  // Collect all IPs with their providers
  const ipVotes: Map<string, string[]> = new Map()

  for (let i = 0; i < results.length; i++) {
    const records = results[i]
    if (records.length > 0) {
      const ip = records[0].ip
      const existing = ipVotes.get(ip) || []
      existing.push(providers[i])
      ipVotes.set(ip, existing)
    }
  }

  // Find consensus (2+ providers agree)
  for (const [ip, voters] of ipVotes) {
    if (voters.length >= 2) {
      return { ip, provider: `consensus(${voters.join(',')})` }
    }
  }

  // No consensus — fall back to Cloudflare answer
  if (results[0].length > 0) {
    return { ip: results[0][0].ip, provider: 'cloudflare_fallback' }
  }

  return null
}

/**
 * Resolve a domain using the system DNS for comparison.
 * Uses Node.js dns module directly.
 * @param domain - Domain to resolve
 * @returns Resolved IP or null
 */
export async function resolveSystemDNS(domain: string): Promise<string | null> {
  const dns = await import('dns')
  return new Promise((resolve) => {
    dns.resolve4(domain, (err, addresses) => {
      if (err || !addresses || addresses.length === 0) {
        resolve(null)
      } else {
        resolve(addresses[0])
      }
    })
  })
}
