import { db } from './db.service';

const META_API_BASE = 'https://graph.facebook.com/v25.0';

/**
 * MediaService — Download e resolução de mídia da Meta API
 *
 * Fluxo para obter uma mídia do WhatsApp:
 * 1. GET /{media_id} → retorna a URL temporária da mídia
 * 2. GET na URL temporária → retorna os bytes da mídia
 *
 * A URL temporária expira, então sempre resolve antes de usar.
 */
class MediaService {

  /**
   * Obtém a URL temporária de download de uma mídia.
   * Retorna { url, mime_type, sha256, file_size }
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
   * Baixa os bytes da mídia e retorna como base64 data URL.
   * Usado para enviar como attachment para o GHL.
   */
  async downloadAsDataUrl(mediaId: string, phoneNumberId: string): Promise<{
    dataUrl: string;
    mimeType: string;
    fileSize: number;
  }> {
    const mediaInfo = await this.getMediaUrl(mediaId, phoneNumberId);

    const client = db.getClientByPhoneId(phoneNumberId);
    if (!client) throw new Error(`Cliente não encontrado para phone: ${phoneNumberId}`);

    const response = await fetch(mediaInfo.url, {
      headers: { 'Authorization': `Bearer ${client.meta_token}` },
    });

    if (!response.ok) {
      throw new Error(`Download de mídia falhou: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString('base64');
    const dataUrl = `data:${mediaInfo.mime_type};base64,${base64}`;

    return {
      dataUrl,
      mimeType: mediaInfo.mime_type,
      fileSize: mediaInfo.file_size,
    };
  }

  /**
   * Baixa a mídia e retorna a URL temporária da Meta (para uso direto).
   * Mais leve que base64, mas a URL expira.
   */
  async getDirectUrl(mediaId: string, phoneNumberId: string): Promise<{
    url: string;
    mimeType: string;
  }> {
    const mediaInfo = await this.getMediaUrl(mediaId, phoneNumberId);
    return {
      url: mediaInfo.url,
      mimeType: mediaInfo.mime_type,
    };
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
