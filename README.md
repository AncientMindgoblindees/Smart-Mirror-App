# Smart-Mirror Configuration App

This project provides a React-based configuration app for a Raspberry Pi 5 Smart-Mirror. It allows you to manage widgets, trigger the mirror's camera, and sync your digital wardrobe.

## Architecture

- **Frontend**: React + Tailwind CSS + dnd-kit (Mirror Theme).
- **Connectivity**: Secure communication via WebSockets to your Raspberry Pi.
- **Database**: Firebase Firestore (metadata) & Storage (clothing images).

## Setup Instructions

### 1. Raspberry Pi Connectivity

The app connects to your Pi via WebSockets. You can use a Cloudflare Tunnel to expose your Pi's local FastAPI server securely.

1.  **Expose your Pi**: Use `cloudflared` to route traffic from a public URL (e.g., `wss://mirror-api.yourdomain.com/ws`) to your Pi's local port (e.g., `8000`).
2.  **Configure URL**: In the app's settings (gear icon), enter your public WebSocket URL.

### 2. Firebase Configuration

The app uses Firebase for the digital wardrobe.

1.  **Firestore**: Stores metadata for clothing items (name, category, user ID).
2.  **Storage**: Stores the actual clothing images.
3.  **Auth**: Google Login is used to keep your wardrobe private.

## Features

- **Mirror Theme**: Pitch black background with translucent "glass" cards.
- **Widget Reordering**: Drag and drop widgets to update the mirror layout in real-time.
- **Pose Capture**: Trigger the Pi camera with a 3-second countdown.
- **Virtual Wardrobe**: Upload clothes to Firebase and overlay them onto your reflection on the mirror.

## WebSocket Protocol

The app sends the following JSON packets to the Pi:

- `REORDER_WIDGETS`: `{ "type": "REORDER_WIDGETS", "order": ["clock", "weather", ...] }`
- `TRIGGER_CAPTURE`: `{ "type": "TRIGGER_CAPTURE" }`
- `SELECT_CLOTHING`: `{ "type": "SELECT_CLOTHING", "imageUrl": "https://..." }`
