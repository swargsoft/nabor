# Nabor

A privacy-first, serverless dating app that runs entirely in your browser. No accounts on a central server — your identity, matches, and messages live only on your device.

---

## How it works

Nabor uses peer-to-peer networking (WebTorrent/Trystero) to connect nearby users directly. Discovery is based on H3 geohash cells so you only see people within your chosen radius. All data is stored locally in IndexedDB via Dexie. There is no backend.

---

## Features

- **Local-only identity** — keypair generated from a BIP-39 mnemonic, stored on-device
- **P2P discovery** — find nearby users without a central server
- **End-to-end encrypted chat** — messages never touch a server
- **Offline-capable PWA** — installable, works without a network connection
- **TURN server support** — add your own TURN servers for restrictive networks
- **Recovery phrase** — back up and restore your identity with a 12-word mnemonic

---

## Getting started

### Prerequisites

- Node.js 18+
- npm 9+

### Install

```bash
git clone <repo-url>
cd nabor
npm install
```

### Environment

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `VITE_APP_NAME` | `Nabor` | App display name |
| `VITE_APP_VERSION` | `0.1.0` | App version |
| `VITE_LOG_LEVEL` | `debug` | Log verbosity (`debug` / `info` / `warn` / `error`) |

### Run locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview the production build locally |
| `npm run test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run lint` | Lint source files |
| `npm run format` | Format source files with Prettier |

---

## Project structure

```
src/
  app/            # Router and app entry
  components/     # Shared UI components and layout
  hooks/          # React hooks
  infrastructure/ # Trystero/P2P transport, discovery strategies
  pages/          # Route-level page components
  repositories/   # Dexie IndexedDB repositories
  services/       # Business logic (SessionService, DiscoveryService, etc.)
  stores/         # Zustand stores
  tests/          # Vitest test suites
  types/          # Shared TypeScript types
  utils/          # Pure utility functions
public/
  icons/          # PWA icons (192px, 512px — any + maskable)
  manifest.webmanifest
```

---

## App screens

| Path | Screen |
|---|---|
| `/` | Welcome / onboarding |
| `/create-account` | Generate identity + mnemonic |
| `/recovery` | Restore identity from mnemonic |
| `/discover` | Browse nearby users |
| `/matches` | Your mutual matches |
| `/chat/:id` | Conversation |
| `/profile` | Edit your profile |
| `/settings` | Preferences, TURN config, danger zone |
| `/devices` | Linked devices |

---

## TURN servers

If you are behind a strict NAT or corporate firewall, P2P connections may fail. You can add your own TURN server in **Settings → Connectivity**:

1. Enter the TURN URL (e.g. `turn:your-server.example.com:3478`)
2. Enter username and credential
3. Tap **Test** to verify connectivity
4. Save — the server is persisted locally and used for all future P2P connections

---

## Recovery phrase

Your identity is derived from a 12-word BIP-39 mnemonic generated at account creation. **Write it down and store it safely** — it is the only way to recover your account if you clear your browser data.

To restore: open the app on a new device, choose **Restore from recovery phrase**, and enter your 12 words.

---

## PWA installation

On a supported browser (Chrome, Edge, Safari on iOS 16.4+):

- Desktop: click the install icon in the address bar
- Mobile: use **Add to Home Screen** from the browser menu

The app will prompt you when an update is available. Tap **Update** to apply it.

---

## Privacy

- No data is sent to any server owned by Nabor
- Discovery metadata (H3 cell, public key) is broadcast only to peers in the same geographic cell
- Messages are encrypted before leaving your device
- Clearing browser site data permanently deletes your profile, matches, and messages
