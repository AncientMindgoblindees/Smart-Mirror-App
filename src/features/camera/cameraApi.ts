import { requestVoid } from '../../api/httpClient';
import { routes } from '../../api/routes';

export async function triggerMirrorCapture(baseUrl: string, sessionId: string): Promise<void> {
  await requestVoid(baseUrl, routes.cameraCapture, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      countdown_seconds: 3,
      source: 'mobile-companion',
      session_id: sessionId,
    }),
  });
}
