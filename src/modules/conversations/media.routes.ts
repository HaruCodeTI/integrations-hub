// src/modules/conversations/media.routes.ts
import { mediaService } from '../../services/media.service';
import { db } from '../../services/db.service';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// MIME → tipo Meta para upload
export const MIME_TO_TYPE: Record<string, 'image' | 'audio' | 'video' | 'document'> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'audio/mp4': 'audio', 'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'audio/opus': 'audio',
  'video/mp4': 'video', 'video/3gpp': 'video',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'text/plain': 'document',
};

export const SIZE_LIMIT_BYTES: Record<string, number> = {
  image: 16 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  document: 100 * 1024 * 1024,
};

export async function mediaRoutes(
  req: Request,
  method: string,
  pathname: string,
  url: URL,
): Promise<Response | null> {

  // GET /api/v2/media/proxy/:mediaId
  const proxyMatch = pathname.match(/^\/api\/v2\/media\/proxy\/([^/]+)$/);
  if (method === 'GET' && proxyMatch) {
    const mediaId = proxyMatch[1];
    const phoneNumberId = url.searchParams.get('phoneNumberId') ?? '';
    const filename = url.searchParams.get('filename');

    if (!phoneNumberId) return json({ error: 'phoneNumberId obrigatorio' }, 400);
    if (!db.getClientByPhoneId(phoneNumberId)) return json({ error: 'Conta nao encontrada' }, 400);

    try {
      // Verifica existência na Meta — detecta 404 permanente via string de erro
      // (mediaService.getMediaUrl lança: "Meta Media API error: 404 — <body>")
      try {
        await mediaService.getMediaUrl(mediaId, phoneNumberId);
      } catch (err: any) {
        const msg = (err.message ?? '') as string;
        if (msg.includes(': 404')) {
          return json({ expired: true }, 404);
        }
        return new Response('Bad Gateway', { status: 502 });
      }

      // Download (usa cache em memória se ainda válido)
      const { buffer, mimeType } = await mediaService.downloadAndCache(mediaId, phoneNumberId);

      const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, max-age=600',
      };

      if (filename) {
        const safe = filename.replace(/[^a-zA-Z0-9._\-]/g, '_');
        headers['Content-Disposition'] = `attachment; filename="${safe}"`;
      }

      return new Response(buffer, { status: 200, headers });

    } catch (err: any) {
      console.error('[media proxy] erro ao servir:', err.message);
      return new Response('Bad Gateway', { status: 502 });
    }
  }

  // POST /api/v2/media/upload — implementado na Task 2
  if (method === 'POST' && pathname === '/api/v2/media/upload') {
    return json({ error: 'Not implemented' }, 501);
  }

  return null;
}
