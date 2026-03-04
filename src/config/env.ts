export const env = {
  PORT: process.env.PORT || 3000,
  META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN || '',
  META_APP_SECRET: process.env.META_APP_SECRET || '',
  GATEWAY_API_KEY: process.env.GATEWAY_API_KEY || '',

  // Legado — será usado como fallback enquanto migra para multi-tenant
  WEBHOOK_URL_N8N: process.env.WEBHOOK_URL_N8N || '',
};
