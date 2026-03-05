import { db } from './db.service';
import { env } from '../config/env';
import { createHmac } from 'crypto';

const META_API_BASE = 'https://graph.facebook.com/v25.0';

// Cache em memória para mídia baixada (evita re-download)
// Limpa automaticamente após 10 minutos
interface MediaCacheEntry {
  buffer: Buffer;
  mimeType: string;
  expiresAt: number;
}

const mediaCache = new Map<string, MediaCacheEntry>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

// Limpa cache expirado a cada 2 minutos
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of mediaCache) {
    if (entry.expiresAt < now) {
      mediaCache.delete(key);
    }
  }
}, 2 * 60 * 1000);

/**
 * MediaService — Download, cache e proxy de mídia da Meta API
 *
 * Fluxo para obter uma mídia do WhatsApp:
 * 1. GET /{media_id} → retorna a URL temporária da mídia
 * 2. GET na URL temporária → retorna os bytes da mídia
 * 3. Cache em memória por 10 min para servir via proxy público
 *
 * O GHL exige URLs HTTP públicas nos attachments, então servimos
 * a mídia via /media/:token endpoint no gateway.
 */
class MediaService {

  /**
   * Gera um token HMAC para proteger o endpoint de proxy.
   * Formato: {mediaId}.{phoneNumberId}.{hmac}
   */
  generateMediaToken(mediaId: string, phoneNumberId: string): string {
    const payload = `${mediaId}.${phoneNumberId}`;
    const hmac = createHmac('sha256', env.GATEWAY_API_KEY || 'default-secret')
      .update(payload)
      .digest('hex')
      .substring(0, 16); // 16 chars é suficiente para evitar brute force
    return `${mediaId}.${phoneNumberId}.${hmac}`;
  }

  /**
   * Valida um token de proxy e retorna os componentes.
   */
  parseMediaToken(token: string): { mediaId: string; phoneNumberId: string } | null {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [mediaId, phoneNumberId, hmac] = parts;
    const expectedHmac = createHmac('sha256', env.GATEWAY_API_KEY || 'default-secret')
      .update(`${mediaId}.${phoneNumberId}`)
      .digest('hex')
      .substring(0, 16);

    if (hmac !== expectedHmac) return null;
    return { mediaId, phoneNumberId };
  }

  /**
   * Gera a URL pública do proxy para uma mídia.
   * Ex: https://gateway.harucode.com.br/media/123456.968853.abcdef1234567890
   */
  getProxyUrl(mediaId: string, phoneNumberId: string): string {
    const token = this.generateMediaToken(mediaId, phoneNumberId);
    return `${env.GATEWAY_PUBLIC_URL}/media/${token}`;
  }

  /**
   * Obtém a URL temporária de download de uma mídia.
   */
  async getMediaUrl(mediaId: string, phoneNumberId: string): Promise<{
    url: string;
    mime_type: string;
    sha256: string;
    file_size: number;
  }> {
    const client = db.getClientByPhoneId(phoneNumberId);
    if (!client) throw new Error(`Cliente não encontrado para phone: ${phoneNumberId}`);

    const response = await fetch(`${META_API_BASE}/${mediaId}`, {
      headers: { 'Authorization': `Bearer ${client.meta_token}` },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Meta Media API error: ${response.status} — ${err}`);
    }

    return await response.json() as any;
  }

  /**
   * Baixa a mídia e armazena no cache.
   * Retorna o buffer e mimeType.
   */
  async downloadAndCache(mediaId: string, phoneNumberId: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileSize: number;
  }> {
    // Verifica cache primeiro
    const cacheKey = `${mediaId}.${phoneNumberId}`;
    const cached = mediaCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { buffer: cached.buffer, mimeType: cached.mimeType, fileSize: cached.buffer.length };
    }

    // Resolve URL e baixa
    const mediaInfo = await this.getMediaUrl(mediaId, phoneNumberId);
    const client = db.getClientByPhoneId(phoneNumberId);
    if (!client) throw new Error(`Cliente não encontrado para phone: ${phoneNumberId}`);

    const response = await fetch(mediaInfo.url, {
      headers: { 'Authorization': `Bearer ${client.meta_token}` },
    });

    if (!response.ok) {
      throw new Error(`Download de mídia falhou: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Armazena no cache
    mediaCache.set(cacheKey, {
      buffer,
      mimeType: mediaInfo.mime_type,
      expiresAt: Date.now() + CACHE_TTL,
    });

    return {
      buffer,
      mimeType: mediaInfo.mime_type,
      fileSize: buffer.length,
    };
  }

  /**
   * Serve a mídia a partir do cache ou baixa sob demanda.
   * Chamado pelo endpoint GET /media/:token
   */
  async serveMedia(token: string): Promise<Response> {
    const parsed = this.parseMediaToken(token);
    if (!parsed) {
      return new Response('Invalid token', { status: 403 });
    }

    try {
      const { buffer, mimeType } = await this.downloadAndCache(parsed.mediaId, parsed.phoneNumberId);
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=600', // 10 min
        },
      });
    } catch (err: any) {
      console.error(`[❌ Media Proxy] Erro ao servir mídia:`, err.message);
      return new Response('Media not found', { status: 404 });
    }
  }

  /**
   * Mapeia o tipo de mensagem WhatsApp para extensão de arquivo.
   */
  getExtensionForMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'audio/ogg': 'ogg',
      'audio/ogg; codecs=opus': 'ogg',
      'audio/mpeg': 'mp3',
      'audio/mp4': 'm4a',
      'audio/amr': 'amr',
      'video/mp4': 'mp4',
      'video/3gpp': '3gp',
      'application/pdf': 'pdf',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'text/plain': 'txt',
    };
    return map[mimeType] || 'bin';
  }

  /**
   * Extrai informações de mídia de uma mensagem do WhatsApp.
   * Retorna null se for mensagem de texto puro.
   */
  extractMediaFromMessage(msg: any): {
    mediaId: string;
    mimeType: string;
    caption?: string;
    filename?: string;
    type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  } | null {
    if (msg.image) {
      return {
        mediaId: msg.image.id,
        mimeType: msg.image.mime_type,
        caption: msg.image.caption,
        type: 'image',
      };
    }
    if (msg.audio) {
      return {
        mediaId: msg.audio.id,
        mimeType: msg.audio.mime_type,
        type: 'audio',
      };
    }
    if (msg.video) {
      return {
        mediaId: msg.video.id,
        mimeType: msg.video.mime_type,
        caption: msg.video.caption,
        type: 'video',
      };
    }
    if (msg.document) {
      return {
        mediaId: msg.document.id,
        mimeType: msg.document.mime_type,
        caption: msg.document.caption,
        filename: msg.document.filename,
        type: 'document',
      };
    }
    if (msg.sticker) {
      return {
        mediaId: msg.sticker.id,
        mimeType: msg.sticker.mime_type,
        type: 'sticker',
      };
    }
    return null;
  }
}

export const mediaService = new MediaService();
