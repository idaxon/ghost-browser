# GhostSwarm: Peer-to-Peer Hybrid Proxy Plan

This document outlines the architectural changes required to build **GhostSwarm**, a 100% free, encrypted Peer-to-Peer (P2P) proxy network that acts as a fallback when the primary GhostStack client-side techniques fail.

## How It Works

1. **Relays & Clients:** Users on unrestricted networks (e.g., home Wi-Fi) automatically act as **Relays**. Users on restricted networks (e.g., University firewalls) act as **Clients**.
2. **Signaling:** A tiny, free server matches Clients with Relays to exchange connection details. No actual traffic flows through this server.
3. **Encrypted Tunnel:** A direct **WebRTC Data Channel** is opened between the Client and the Relay. WebRTC is natively encrypted using DTLS/SCTP, making it highly secure and undetectable.
4. **Traffic Flow:** The Client sends the blocked HTTP request over WebRTC. The Relay fetches the page on the normal internet and sends the data back over WebRTC.

---

## User Review Required

> [!WARNING]
> **WebRTC in Electron:** The Node.js "Main" process in Electron does not support WebRTC natively. To solve this without adding heavy, unstable C++ dependencies, we must run the WebRTC logic in a **hidden background Renderer window**. Please review this architectural decision in Section 2.

> [!IMPORTANT]
> **Signaling Server:** We need a signaling server to connect peers. Are you comfortable with me providing the code for a **Free Cloudflare Worker** that you can deploy in 2 minutes? It will cost $0.

---

## Proposed Changes

### 1. Signaling Server (External)

#### [NEW] `ghostswarm-signal.js` (Cloudflare Worker Script)
- A standalone script that you will deploy to a free Cloudflare Worker.
- It acts as a matchmaking lobby. Relays post their availability. Clients ask for a Relay. They exchange WebRTC Offer/Answer SDP strings to connect directly.

---

### 2. P2P Background Worker (Electron Renderer)

#### [MODIFY] `src/main/index.ts`
- Create a new, hidden `BrowserWindow` on startup called `GhostSwarmWorker`.
- This window never shows on screen, but it provides access to the Chromium browser's native, highly optimized `RTCPeerConnection` APIs.

#### [NEW] `src/ghoststack/swarm/worker.html` & `worker.ts`
- The code running inside the hidden window.
- Manages the WebRTC connection lifecycle.
- Automatically encrypts traffic (WebRTC does this natively).
- Receives raw HTTP request data via IPC, sends it over the WebRTC Data Channel, receives the response, and sends it back via IPC.
- If acting as a Relay, it receives requests from the Data Channel, uses native browser `fetch()` to grab the unblocked website, and sends the response back to the Client.

---

### 3. Swarm Manager (Main Process)

#### [NEW] `src/ghoststack/swarm/SwarmManager.ts`
- Determines the role of the browser based on `NetworkProbe`:
  - `networkType === 'open'` → Register as a Relay.
  - `networkType === 'filtered'` → Connect as a Client.
- Communicates with the hidden WebRTC window via Electron's `ipcMain`/`ipcRenderer`.

---

### 4. Hybrid Routing Cascade

#### [MODIFY] `src/ghoststack/core/GhostStackOrchestrator.ts`
- **Bypass Cascade Update** in `handleNavigationFailure()`:
  - Step 1: Try `IPRaw` (Traffic Shaping).
  - Step 2: Try `SplitCast` (TLS Fragmentation).
  - **NEW Step 3 (Fallback):** If both fail, flag the domain as `swarm` in `activeBypasses`.

#### [MODIFY] `src/ghoststack/core/network/GhostProtocol.ts`
- **The Routing Glue:** When the local HTTP relay processes a request:
  - It checks if the domain is flagged for `swarm`.
  - If **Yes**: Instead of using `GhostEngine.fetch()`, it serializes the request (URL, headers, method) and sends it over IPC to the `SwarmManager`. The request travels through the encrypted WebRTC tunnel, gets fetched by the remote peer, and returns.
  - If **No**: It uses the standard `GhostEngine` client-side bypass.

---

## Verification Plan

### Automated/Local Tests
1. **Local Swarm Testing:** We will force the browser to spawn two hidden WebRTC windows internally to simulate a Client and a Relay on the same machine.
2. We will verify they connect via the signaling server and successfully pass a test file over the encrypted WebRTC data channel.

### Manual Verification
1. Open the browser on an unrestricted network (acting as Relay).
2. Open a second instance of the browser on a restricted network (or simulate failure of IPRaw/SplitCast).
3. Attempt to load `youtube.com`.
4. Verify the page loads successfully and check the console logs to confirm the traffic was routed through `GhostSwarm` rather than the standard `GhostEngine`.
