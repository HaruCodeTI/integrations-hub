export const env = {
  PORT: process.env.PORT || 3000,
  META_VERIFY_TOKEN: process.env.META_VERIFY_TOKEN || '',
  META_APP_SECRET: process.env.META_APP_SECRET || '',
  META_APP_ID: process.env.META_APP_ID || '',
  GATEWAY_API_KEY: process.env.GATEWAY_API_KEY || '',

  // Legado — será usado como fallback enquanto migra para multi-tenant
  WEBHOOK_URL_N8N: process.env.WEBHOOK_URL_N8N || '',

  // ─── GHL (GoHighLevel) Marketplace ─────────────────────────
  GHL_CLIENT_ID: process.env.GHL_CLIENT_ID || '',
  GHL_CLIENT_SECRET: process.env.GHL_CLIENT_SECRET || '',
  GHL_CONVERSATION_PROVIDER_ID: process.env.GHL_CONVERSATION_PROVIDER_ID || '',
  GHL_APP_VERSION_ID: process.env.GHL_APP_VERSION_ID || '',
  GHL_SCOPES: process.env.GHL_SCOPES || 'conversations/message.readonly conversations/message.write contacts.readonly contacts.write',
  GATEWAY_PUBLIC_URL: process.env.GATEWAY_PUBLIC_URL || 'https://gateway.harucode.com.br',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
};
