import { protocol, session } from 'electron'
import * as http from 'http'
import { Readable } from 'stream'
import { GhostEngine } from './GhostEngine'

/**
 * GhostProtocol v5 — Local Media Relay
 *
 * Architecture:
 *   1. ghost:// protocol handler serves HTML pages via CORS relay cascade.
 *   2. A LOCAL HTTP server on 127.0.0.1 handles ALL sub-resources (CSS/JS/images/video).
 *      Localhost traffic is NEVER inspected by Sophos. This fixes video playback.
 *   3. HTML is rewritten so all resource URLs point to http://127.0.0.1:PORT/r/ENCODED_URL
 *   4. The injected JS interceptor catches dynamic fetch/XHR and routes them to localhost too.
 */

// ── In-memory cache ──
const cache = new Map<string, { buf: Buffer; mime: string; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000
const MAX_CACHE = 400

function cacheSet(key: string, buf: Buffer, mime: string): void {
  if (cache.size >= MAX_CACHE) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
  cache.set(key, { buf, mime, ts: Date.now() })
}

function cacheGet(key: string): { buf: Buffer; mime: string } | null {
  const e = cache.get(key)
  if (!e) return null
  if (Date.now() - e.ts > CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return e
}

// ── MIME types ──
const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'application/javascript',
  mjs: 'application/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  ts: 'video/mp2t',
  m3u8: 'application/vnd.apple.mpegurl',
  m4s: 'video/iso.segment',
  mpd: 'application/dash+xml',
  xml: 'application/xml',
  txt: 'text/plain'
}

function getMime(url: string): string | null {
  try {
    const p = new URL(url, 'https://x.com').pathname.split('?')[0]
    const ext = p.split('.').pop()?.toLowerCase() || ''
    return MIME[ext] || null
  } catch {
    return null
  }
}

// ── Local relay server port ──
let localRelayPort = 0
export function getRelayPort(): number {
  return localRelayPort
}
let blockedBaseDomain = ''

// ═══════════════════════════════════════════════════
// LOCAL HTTP RELAY SERVER
// Handles ALL sub-resources (CSS, JS, images, VIDEO)
// Localhost traffic bypasses Sophos entirely.
// ═══════════════════════════════════════════════════
function startLocalRelay(): Promise<number> {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url || '/', `http://127.0.0.1`)
        let targetUrl = reqUrl.searchParams.get('u')

        if (reqUrl.pathname === '/log') {
          const msg = reqUrl.searchParams.get('msg')
          console.log(`[GhostStack/FrontendLog] ${msg}`)
          res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' })
          res.end('ok')
          return
        }

        if (!targetUrl) {
          // Try to recover the target URL from the Referer (fixes relative URLs requested by iframes/scripts)
          if (req.headers.referer) {
            try {
              const refererUrl = new URL(req.headers.referer)
              const refererTarget = refererUrl.searchParams.get('u')
              if (refererTarget) {
                const baseTarget = new URL(refererTarget)
                targetUrl = new URL(req.url || '/', baseTarget.origin).href
                console.log(`[GhostProtocol] 🔄 Recovered relative URL: ${targetUrl}`)
              }
            } catch {
              // ignore parse errors
            }
          }

          if (!targetUrl) {
            console.error(`[GhostProtocol] ❌ Relay missing 'u' param for: ${req.url}`)
            res.writeHead(400)
            res.end('Missing u param')
            return
          }
        }

        // CORS headers for cross-origin requests from ghost:// page
        const origin = req.headers.origin || '*'
        res.setHeader('Access-Control-Allow-Origin', origin)
        res.setHeader('Access-Control-Allow-Credentials', 'true')
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, DELETE, OPTIONS')
        res.setHeader(
          'Access-Control-Allow-Headers',
          req.headers['access-control-request-headers'] || '*'
        )
        res.setHeader('Access-Control-Expose-Headers', '*')

        if (req.method === 'OPTIONS') {
          res.writeHead(200)
          res.end()
          return
        }

        // Check cache
        const cached = cacheGet(targetUrl)
        if (cached) {
          res.writeHead(200, {
            'Content-Type': cached.mime,
            'Content-Length': cached.buf.length,
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=86400'
          })
          res.end(cached.buf)
          return
        }

        // Forward essential headers to bypass hotlink protection
        const fetchHeaders: Record<string, string> = {}
        const blockedHeaders = ['host', 'accept-encoding']

        for (const [key, val] of Object.entries(req.headers)) {
          if (val && !blockedHeaders.includes(key.toLowerCase())) {
            fetchHeaders[key] = Array.isArray(val) ? val.join(';') : val
          }
        }

        // Fake Referer and Origin if missing or internal
        if (
          !fetchHeaders['referer'] ||
          fetchHeaders['referer'].includes('127.0.0.1') ||
          fetchHeaders['referer'].includes('ghost://')
        ) {
          fetchHeaders['Referer'] = `https://www.${blockedBaseDomain}/`
        }
        if (
          fetchHeaders['origin'] &&
          (fetchHeaders['origin'].includes('127.0.0.1') ||
            fetchHeaders['origin'].includes('ghost://'))
        ) {
          fetchHeaders['Origin'] = `https://www.${blockedBaseDomain}`
        }

        // Fetch cookies from Electron's session for the target URL
        try {
          const cookies = await session.defaultSession.cookies.get({ url: targetUrl })
          if (cookies.length > 0) {
            fetchHeaders['Cookie'] = cookies.map((c) => `${c.name}=${c.value}`).join('; ')
          }
        } catch (e) {
          console.error('[GhostProtocol] Error fetching cookies:', e)
        }

        // Forward method and body for API requests (POST/PUT)
        const fetchOptions: RequestInit = {
          method: req.method || 'GET',
          headers: fetchHeaders
        }

        if (req.method !== 'GET' && req.method !== 'HEAD') {
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          fetchOptions.body = Buffer.concat(chunks) as unknown as BodyInit
        }

        // Fetch via GhostEngine native bypass
        const response = await GhostEngine.fetch(targetUrl, fetchOptions)

        if (!response.ok) {
          console.error(
            `[GhostProtocol] ❌ Relay target returned ${response.status} for: ${targetUrl}`
          )
        } else {
          console.log(`[GhostProtocol] ✅ Relay ${response.status}: ${targetUrl.substring(0, 80)}`)
        }

        if (!response.ok) {
          res.writeHead(response.status)
          res.end(`Relay failed: ${response.status}`)
          return
        }

        const mime =
          getMime(targetUrl) || response.headers.get('content-type') || 'application/octet-stream'

        const resHeaders: Record<string, string> = {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
          'Cache-Control': 'public, max-age=86400',
          'Accept-Ranges': 'bytes'
        }
        const isText =
          mime.includes('text/') ||
          mime.includes('javascript') ||
          mime.includes('json') ||
          mime.includes('mpegurl') ||
          mime.includes('m3u8')

        if (isText) {
          // For text resources, buffer and rewrite URLs
          const arrayBuf = await response.arrayBuffer()
          let text = Buffer.from(arrayBuf).toString('utf-8')

          if (mime.includes('mpegurl') || mime.includes('m3u8') || targetUrl.includes('.m3u8')) {
            // Fix relative URLs in m3u8 playlists (e.g. chunk_1.ts)
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1)
            text = text
              .split('\\n')
              .map((line) => {
                const tLine = line.trim()
                if (tLine && !tLine.startsWith('#') && !tLine.startsWith('http')) {
                  const absoluteUrl = tLine.startsWith('/')
                    ? new URL(tLine, targetUrl).href
                    : baseUrl + tLine
                  return `http://127.0.0.1:${localRelayPort}/r?u=${encodeURIComponent(absoluteUrl)}`
                }
                return line
              })
              .join('\\n')
          }

          const finalBuf = Buffer.from(text, 'utf-8')
          cacheSet(targetUrl, finalBuf, mime)

          resHeaders['Content-Length'] = finalBuf.length.toString()
          res.writeHead(response.status, resHeaders)
          res.end(finalBuf)
        } else {
          if (response.headers.has('content-length'))
            resHeaders['Content-Length'] = response.headers.get('content-length')!
          if (response.headers.has('content-range'))
            resHeaders['Content-Range'] = response.headers.get('content-range')!
          if (response.headers.has('content-encoding'))
            resHeaders['Content-Encoding'] = response.headers.get('content-encoding')!

          res.writeHead(response.status, resHeaders)

          // For binary resources (video/images), stream directly!
          if (response.body) {
            if (typeof (response.body as unknown as Readable).pipe === 'function') {
              ;(response.body as unknown as Readable).pipe(res)
            } else {
              // Convert Web ReadableStream to Node stream
              const nodeStream = Readable.fromWeb(
                response.body as import('stream/web').ReadableStream
              )
              nodeStream.on('error', (err: Error) =>
                console.error('[GhostProtocol] Stream error:', err)
              )
              nodeStream.pipe(res)
            }
          } else {
            res.end()
          }
        }
      } catch (err) {
        console.error('[GhostProtocol] ❌ Relay error:', err)
        res.writeHead(502)
        res.end('Relay error')
      }
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number }
      localRelayPort = addr.port
      console.log(`[GhostProtocol] 🛡️ Local media relay on 127.0.0.1:${localRelayPort}`)
      resolve(localRelayPort)
    })
  })
}

// ═══════════════════════════════════════════════════
// GHOST:// PROTOCOL HANDLER — HTML documents only
// ═══════════════════════════════════════════════════
export async function initializeGhostProtocol(): Promise<void> {
  // Start local relay server first
  await startLocalRelay()

  protocol.handle('ghost', async (request) => {
    try {
      // Fix double ghost:// URLs
      let rawUrl = request.url
      const secondGhost = rawUrl.indexOf('ghost://', 8)
      if (secondGhost !== -1) rawUrl = rawUrl.substring(secondGhost)

      const targetUrl = new URL(rawUrl.replace('ghost://', 'https://'))
      const hostname = targetUrl.hostname
      const fullPath = targetUrl.pathname + targetUrl.search
      const realUrl = targetUrl.href

      blockedBaseDomain = hostname.replace(/^www\./, '')

      console.log(`[GhostProtocol] 📄 ${hostname}${fullPath.substring(0, 60)}`)

      // Convert request Headers to Record
      const fetchHeaders: Record<string, string> = {}
      const blockedHeaders = ['host', 'accept-encoding']

      request.headers.forEach((val, key) => {
        if (!blockedHeaders.includes(key.toLowerCase())) fetchHeaders[key] = val
      })

      // Fake Referer and Origin for top-level navigation and APIs that slip through
      if (!fetchHeaders['referer'] || fetchHeaders['referer'].includes('ghost://')) {
        fetchHeaders['Referer'] = `https://${hostname}/`
      }
      if (fetchHeaders['origin'] && fetchHeaders['origin'].includes('ghost://')) {
        fetchHeaders['Origin'] = `https://${hostname}`
      }

      const fetchOptions: RequestInit = {
        method: request.method,
        headers: fetchHeaders
      }

      if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
        const reader = (request.body as unknown as ReadableStream<Uint8Array>).getReader()
        const chunks: Uint8Array[] = []
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) chunks.push(value)
        }
        fetchOptions.body = Buffer.concat(chunks)
      }

      // Fetch HTML via GhostEngine Native Bypass
      const resp = await GhostEngine.fetch(realUrl, fetchOptions)
      if (!resp.ok) {
        throw new Error(`Native Bypass failed (${resp.status})`)
      }

      const mime = getMime(realUrl) || resp.headers.get('content-type') || 'text/html'

      // If a binary resource slips through to ghost:// (like an image), stream it back directly
      if (!mime.includes('text/html')) {
        const headers: Record<string, string> = {
          'Content-Type': mime,
          'Access-Control-Allow-Origin': '*'
        }

        // Return a new response from the buffered data to avoid Stream truncation issues
        // and because undici already decompresses the body automatically.
        const buf = await resp.arrayBuffer()
        return new Response(buf, {
          status: resp.status,
          headers
        })
      }

      let html = await resp.text()
      html = rewriteHtml(html)

      console.log(`[GhostProtocol] ✅ Rendered ${hostname} (${(html.length / 1024).toFixed(0)}KB)`)

      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
      })
    } catch (err) {
      console.error('[GhostProtocol] Error:', err)
      throw err
    }
  })
}

function rewriteHtml(html: string): string {
  // Strip integrity attributes so rewritten scripts don't fail SRI checks
  html = html.replace(/\s+integrity=["'][^"']*["']/gi, '')

  // Strip CSP meta tags that could block our local relay or inline scripts
  html = html.replace(/<meta[^>]*http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')

  // ── Convert protocol-relative to absolute ──
  const urlAttrs = '(?:src|href|poster|srcset|data-[a-zA-Z0-9-]+)'
  html = html.replace(new RegExp(`(${urlAttrs}=["'])\\/\\/([^"']*?)(["'])`, 'gi'), `$1https://$2$3`)

  // Inject a test script at the end of the body or head to verify JS execution
  html = html.replace('</head>', '<script>console.log("HELLO FROM GHOSTSTACK INJECTOR"); setTimeout(()=>console.log("DOM loaded?", document.body.innerHTML.substring(0,200)), 1000);</script></head>')

  return html
}
