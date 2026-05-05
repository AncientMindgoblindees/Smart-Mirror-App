# Smart-Mirror Configuration App

This project provides a React-based companion app for a Raspberry Pi 5 Smart-Mirror. It lets you manage the mirror widget layout, upload wardrobe items through the mirror backend, connect calendar accounts, and inspect mirror connection status.

## Architecture

- **Frontend**: React + Tailwind CSS mirror-themed UI.
- **Connectivity**: HTTP API calls for persisted mirror state plus WebSocket envelopes for live sync.
- **Backend**: Smart-Mirror FastAPI endpoints store widget config, wardrobe metadata, clothing images, and account tokens.

## Setup Instructions

### 1. Raspberry Pi Connectivity

The app connects to your Pi's FastAPI server over HTTP and WebSockets. You can use a Cloudflare Tunnel to expose the local server securely.

1.  **Expose your Pi**: Use `cloudflared` to route traffic from a public URL to your Pi's local FastAPI port.
2.  **Configure URLs**: In the app settings, enter the mirror HTTP base URL and WebSocket URL.
3.  **Configure token**: If the mirror backend requires `MIRROR_API_TOKEN`, enter the same token in the app settings.

### 2. Local Development

```powershell
npm install
npm run dev
```

The Vite dev server defaults to port `3000`.

## Features

- **Layout editor**: Add, move, resize, remove, and configure mirror widgets.
- **Mirror sync**: Pull and push widget configuration through the mirror HTTP API, with local cache fallback.
- **Wardrobe**: Upload clothing images and metadata to the mirror backend.
- **Accounts**: Start Google account linking through the mirror backend.
- **Connection diagnostics**: View the configured HTTP/WebSocket endpoints and live WebSocket status.

## WebSocket Protocol

The app sends versioned control envelopes to the mirror:

- `DEVICE_PAIR`: sent when the companion connects.
- `WIDGETS_SYNC`: sent when layout changes should be mirrored live.
- `WARDROBE_UPDATED`: sent after wardrobe upload/delete events.
