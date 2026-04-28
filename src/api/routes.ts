export const routes = {
  sessionMe: '/api/session/me',
  widgets: '/api/widgets/',
  profileList: '/api/profile/',
  profileDelete: (userId: string) => `/api/profile/${encodeURIComponent(userId)}`,
  authProviders: '/api/auth/providers',
  authLogin: (provider: string) => `/api/auth/login/${provider}`,
  authLogout: (provider: string) => `/api/auth/logout/${provider}`,
  oauthStart: (provider: string) => `/api/oauth/${provider}/start`,
  authPairings: '/api/auth/pairings',
  authPairingById: (pairingId: string) => `/api/auth/pairings/${encodeURIComponent(pairingId)}`,
  authPairingRedeem: '/api/auth/pairings/redeem',
  authPairingFinalize: (pairingId: string) =>
    `/api/auth/pairings/${encodeURIComponent(pairingId)}/finalize`,
  authPairingExchangeToken: (pairingId: string) =>
    `/api/auth/pairings/${encodeURIComponent(pairingId)}/exchange-token`,
  cameraCapture: '/api/camera/capture',
  clothingList: (includeImages: boolean) => `/api/clothing${includeImages ? '?include_images=true' : ''}`,
  clothingCreate: '/api/clothing/',
  clothingDelete: (itemId: number) => `/api/clothing/${itemId}`,
  clothingUploadImage: (itemId: number) => `/api/clothing/${itemId}/images`,
  tryonGenerate: '/api/tryon/outfit-generate',
  personImageLatest: '/api/tryon/person-image/latest',
  personImageList: '/api/tryon/person-image',
  personImageById: (imageId: number) => `/api/tryon/person-image/${imageId}`,
  calendarEvents: (days?: number, provider?: string) => {
    const sp = new URLSearchParams();
    if (days) sp.set('days', String(days));
    if (provider) sp.set('provider', provider);
    const qs = sp.toString();
    return `/api/calendar/events${qs ? `?${qs}` : ''}`;
  },
  calendarTasks: (provider?: string) => {
    const sp = new URLSearchParams();
    if (provider) sp.set('provider', provider);
    const qs = sp.toString();
    return `/api/calendar/tasks${qs ? `?${qs}` : ''}`;
  },
};
