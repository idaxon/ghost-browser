/**
 * GhostSwarm Signaling Server (Cloudflare Worker — Service Worker format)
 * 
 * This is a lightweight signaling server used to connect WebRTC peers.
 * It matches 'Clients' (users on restricted networks) with 'Relays' (users on open networks).
 * 
 * Deploy: Paste this into Cloudflare Dashboard → Workers → Create Worker → Quick Edit
 */

const relays = new Set()
const messages = new Map()
const TTL = 30000

function pushMessage(targetId, msg) {
  if (!messages.has(targetId)) {
    messages.set(targetId, [])
  }
  messages.get(targetId).push(msg)
}

addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    if (path === '/register' && request.method === 'POST') {
      const body = await request.json()
      const relayId = body.id
      if (relayId) {
        relays.add(relayId)
        setTimeout(() => relays.delete(relayId), TTL)
        return new Response(JSON.stringify({ status: 'ok', activeRelays: relays.size }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
    }

    if (path === '/offer' && request.method === 'POST') {
      const body = await request.json()
      const relayArray = Array.from(relays)
      if (relayArray.length === 0) {
        return new Response(JSON.stringify({ error: 'No relays available' }), {
          status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      const targetRelay = relayArray[Math.floor(Math.random() * relayArray.length)]
      pushMessage(targetRelay, {
        type: 'offer',
        from: body.id,
        sdp: body.sdp
      })
      return new Response(JSON.stringify({ status: 'ok', relayId: targetRelay }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (path === '/answer' && request.method === 'POST') {
      const body = await request.json()
      pushMessage(body.targetId, {
        type: 'answer',
        from: body.id,
        sdp: body.sdp
      })
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (path === '/ice' && request.method === 'POST') {
      const body = await request.json()
      pushMessage(body.targetId, {
        type: 'ice',
        from: body.id,
        candidate: body.candidate
      })
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (path === '/poll' && request.method === 'GET') {
      const id = url.searchParams.get('id')
      if (!id) return new Response('Missing id', { status: 400, headers: corsHeaders })
      const msgs = messages.get(id) || []
      messages.delete(id)
      return new Response(JSON.stringify({ messages: msgs }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response('GhostSwarm Signaling Server is running', { status: 200, headers: corsHeaders })
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
}
