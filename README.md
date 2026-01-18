# dbl-chat-client (v0.4.0)

Pure client library and UI for interacting with the [dbl-gateway](https://github.com/lukaspfisterch/dbl-gateway) chat surface.

## Role
This is a **pure client and projector**, never a governor.
- All state is derived from gateway events.
- Communications are strictly HTTP (Get capabilities, Post intent, Tail SSE).
- Zero local policy logic or "smart" retries.

## Features
- Identity anchor management (`thread_id`, `turn_id`, `parent_turn_id`).
- Intent composition for `chat.message`.
- Real-time event projection via `/tail`.
- Clean, minimalist "ChatGPT-style" interface.

## Installation

### PowerShell
```powershell
git clone https://github.com/lukaspfisterch/dbl-chat-client.git
cd dbl-chat-client
npm install
```

### Bash
```bash
git clone https://github.com/lukaspfisterch/dbl-chat-client.git
cd dbl-chat-client
npm install
```

## Running the Client

### PowerShell / Bash
Start the development server:
```bash
npm run dev
```

The UI will typically run at `http://localhost:5173`. 

### Configuration
By default, the client expects the gateway at `http://127.0.0.1:8010`. You can change this in `src/App.tsx` (GATEWAY_URL).

## Design Stance
- **Boring by design**: If the gateway is slow or denies an intent, the UI reflects exactly that.
- **Single Source of Truth**: The Gateway event stream is the only authority for what happened.
- **Minimal State**: State is computed from the append-only event trail.

## Development & Validation

### Live Contract Smoke Test
To validate the current UI code against a running gateway:
```bash
node scripts/smoke-test.js
```
This script verifies that the client matches the authoritative `INTENT` wire contract.
