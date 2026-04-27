# Testing

## Tools in this repo

- Companion app component tests: `Vitest` + React Testing Library
- Companion app smoke E2E: `Playwright`

## Install test dependencies

From [Smart-Mirror-App/package.json](/c:/Users/Jake%20Bleeden/y4hw/SmartMirror/Smart-Mirror-App/package.json:1):

```powershell
cd Smart-Mirror-App
npm install
npx playwright install
```

## Run tests

### Component tests

```powershell
cd Smart-Mirror-App
npm test
```

### E2E smoke test

```powershell
cd Smart-Mirror-App
npm run test:e2e
```

## Mocked dependencies

- Companion app tests mock mirror HTTP/WebSocket helpers.
- Wardrobe/image API calls are mocked, so tests do not require a live mirror backend.
- No Cloudinary credentials or production database data are required.
