// src/modules/conversations/media.routes.ts
import { mediaService } from '../../services/media.service';
import { db } from '../../services/db.service';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Exportados para uso pelo handler de upload (POST /api/v2/media/upload)
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
      const { buffer, mimeType } = await mediaService.downloadAndCache(mediaId, phoneNumberId);

      const headers: Record<string, string> = {
        'Content-Type': mimeType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'private, max-age=600',
      };

      if (filename) {
        const safe = filename.replace(/[^a-zA-Z0-9_\-]/g, '_');
        headers['Content-Disposition'] = `attachment; filename="${safe}"`;
      }

      return new Response(buffer, { status: 200, headers });

    } catch (err: any) {
      const msg = (err.message ?? '') as string;
      // mediaService.downloadAndCache internamente chama getMediaUrl, que lança:
      // "Meta Media API error: 404 — <body>" para mídia expirada/não encontrada
      if (msg.includes(': 404')) {
        return json({ expired: true }, 404);
      }
      console.error('[media proxy] erro ao servir:', msg);
      return new Response('Bad Gateway', { status: 502 });
    }
  }

  if (method === 'POST' && pathname === '/api/v2/media/upload') {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return json({ error: 'Corpo da requisicao invalido (multipart esperado)' }, 400);
    }

    const phoneNumberId = (form.get('phoneNumberId') as string | null) ?? '';
    const file = form.get('file') as File | null;

    if (!phoneNumberId || !file) {
      return json({ error: 'phoneNumberId e file sao obrigatorios' }, 400);
    }

    const client = db.getClientByPhoneId(phoneNumberId);
    if (!client) return json({ error: 'Conta nao encontrada' }, 400);

    // MIME derivado do objeto File (determinado pelo Bun/browser — não do cliente)
    const mimeType = file.type;
    if (!mimeType) {
      return json({ error: 'Tipo de arquivo nao determinado (Content-Type ausente)' }, 400);
    }
    const mediaType = MIME_TO_TYPE[mimeType];
    if (!mediaType) {
      return json({ error: `Tipo de arquivo nao suportado: ${mimeType}` }, 400);
    }

    // Lê os bytes para validar tamanho real (file.size é metadata do cliente — não confiável)
    const bytes = await file.arrayBuffer();
    if (bytes.byteLength > SIZE_LIMIT_BYTES[mediaType]) {
      return json({ error: 'Arquivo excede o limite permitido para este tipo' }, 413);
    }

    try {
      const fileBlob = new Blob([bytes], { type: mimeType });
      const metaForm = new FormData();
      metaForm.append('file', fileBlob, file.name);
      metaForm.append('type', mimeType);
      metaForm.append('messaging_product', 'whatsapp');

      const META_API_BASE = 'https://graph.facebook.com/v25.0';
      const res = await fetch(`${META_API_BASE}/${phoneNumberId}/media`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${client.meta_token}` },
        body: metaForm,
      });

      if (!res.ok) {
        const err = await res.text();
        console.error('[media upload] Meta error:', res.status, err);
        return new Response('Bad Gateway', { status: 502 });
      }

      const data = await res.json() as { id: string };
      return json({
        media_id: data.id,
        mime_type: mimeType,
        type: mediaType,
        filename: file.name.replace(/[^a-zA-Z0-9_\-\.]/g, '_'),
      });

    } catch (err: any) {
      console.error('[media upload] erro:', err.message);
      return new Response('Bad Gateway', { status: 502 });
    }
  }

  return null;
}
