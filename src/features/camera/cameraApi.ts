function trimBase(base: string): string {
  return base.replace(/\/$/, '');
}

export async function triggerMirrorCapture(baseUrl: string, sessionId: string): Promise<void> {
  const res = await fetch(`${trimBase(baseUrl)}/api/camera/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      countdown_seconds: 3,
      source: 'mobile-companion',
      session_id: sessionId,
    }),
  });
  if (!res.ok) {
    throw new Error(`Capture failed: ${res.status} ${res.statusText}`);
  }
}
