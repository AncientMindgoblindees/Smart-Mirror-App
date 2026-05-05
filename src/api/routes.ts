export const routes = {
  widgets: '/api/widgets/',
  authProviders: '/api/auth/providers',
  authLogin: (provider: string) => `/api/auth/login/${provider}`,
  authLogout: (provider: string) => `/api/auth/logout/${provider}`,
  oauthStart: (provider: string) => `/api/oauth/${provider}/start`,
  clothingList: (includeImages: boolean) => `/api/clothing${includeImages ? '?include_images=true' : ''}`,
  clothingCreate: '/api/clothing/',
  clothingDelete: (itemId: number) => `/api/clothing/${itemId}`,
  clothingUploadImage: (itemId: number) => `/api/clothing/${itemId}/images`,
};
