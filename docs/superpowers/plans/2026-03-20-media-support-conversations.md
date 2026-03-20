# Media Support in Conversations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar suporte completo a receber e enviar mídias (image, audio, video, document, sticker) na aba de Conversas.

**Architecture:** Backend expõe um proxy autenticado por session cookie para servir mídias da Meta, e um endpoint de upload que recebe o arquivo, sobe na Meta Media API e retorna o `media_id`. O frontend renderiza mídias inline por tipo e adiciona UX de anexo (clipe + drag & drop).

**Tech Stack:** Bun, TypeScript, React, Tailwind, lucide-react, `bun:sqlite` (via db.service), Meta Cloud API v25.0

---

## File Map

| Status | Arquivo | O que muda |
|--------|---------|-----------|
| **Criar** | `src/modules/conversations/media.routes.ts` | `GET /api/v2/media/proxy/:mediaId` e `POST /api/v2/media/upload` |
| **Modificar** | `src/routes/router.ts:187-199` | Registrar `mediaRoutes` no bloco `/api/v2/` |
| **Modificar** | `src/modules/conversations/conversations.controller.ts:17-38` | Validação aceita payload de mídia além de texto |
| **Modificar** | `src/modules/conversations/conversations.service.ts:15-45` | `sendMessage` suporta `type`/`media_id`/`caption`/`filename` |
| **Modificar** | `src/frontend/pages/conversations/ConversationView.tsx` | Renderização inline + UX de envio com anexo |

---

## Task 1: Backend — Rota de Proxy de Mídia

**Files:**
- Create: `src/modules/conversations/media.routes.ts`
- Modify: `src/routes/router.ts` (linha ~193, bloco `/api/v2/`)

### Contexto

`mediaService.getMediaUrl(mediaId, phoneNumberId)` faz `GET /{mediaId}` na Meta com o token e retorna `{ url, mime_type, sha256, file_size }`. Se a Meta retorna 404, o método lança um erro com mensagem no formato `"Meta Media API error: 404 — <body>"`. O proxy usa essa string para detectar expiração permanente (`msg.includes(': 404')`).

Importante: `downloadAndCache()` internamente chama `getMediaUrl()` também. O proxy chama `getMediaUrl()` explicitamente apenas para detectar 404 antes de tentar o download — isso causa dois fetches à Meta API na resolução de URL em cache miss. Esse é o trade-off aceito para distinguir 404 de outros erros sem modificar o mediaService.

- [ ] **Step 1.1: Criar `media.routes.ts` com handler do proxy e constantes de upload**

```ts
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
```

- [ ] **Step 1.2: Registrar `mediaRoutes` em `router.ts`**

Adicionar import no topo de `src/routes/router.ts` (junto aos outros imports de rotas):

```ts
import { mediaRoutes } from '../modules/conversations/media.routes';
```

Dentro do bloco `if (pathname.startsWith('/api/v2/'))`, **antes** de `conversationsRoutes` (linha ~193):

```ts
const mediaResult = await mediaRoutes(req, method, pathname, url);
if (mediaResult) return mediaResult;
```

> `url` já está declarado no início de `appRouter` como `const url = new URL(req.url)`.

- [ ] **Step 1.3: Testar manualmente o endpoint de proxy**

```bash
# Com o servidor rodando — substituir pelos valores reais
curl -b "session=<cookie>" \
  "http://localhost:3000/api/v2/media/proxy/<mediaId>?phoneNumberId=<phoneId>" \
  --output /tmp/media-test.jpg

file /tmp/media-test.jpg
# Espera: JPEG image data (ou tipo correto)
```

- [ ] **Step 1.4: Commit**

```bash
git add src/modules/conversations/media.routes.ts src/routes/router.ts
git commit -m "feat(media): adiciona proxy GET /api/v2/media/proxy/:mediaId"
```

---

## Task 2: Backend — Endpoint de Upload de Mídia

**Files:**
- Modify: `src/modules/conversations/media.routes.ts` (substituir stub `/api/v2/media/upload`)

### Contexto

A Meta Media Upload API aceita `multipart/form-data`:
```
POST https://graph.facebook.com/v25.0/<phoneNumberId>/media
Authorization: Bearer <meta_token>
Content-Type: multipart/form-data

file=<binary>   type=<mime_type>   messaging_product=whatsapp
```
Retorna `{ id: "<media_id>" }`. Bun suporta `req.formData()` nativamente.

- [ ] **Step 2.1: Substituir stub de upload pelo handler completo**

No arquivo `src/modules/conversations/media.routes.ts`, substituir o bloco:

```ts
  // POST /api/v2/media/upload — implementado na Task 2
  if (method === 'POST' && pathname === '/api/v2/media/upload') {
    return json({ error: 'Not implemented' }, 501);
  }
```

Por:

```ts
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
    const mediaType = MIME_TO_TYPE[mimeType];
    if (!mediaType) {
      return json({ error: `Tipo de arquivo nao suportado: ${mimeType}` }, 400);
    }

    if (file.size > SIZE_LIMIT_BYTES[mediaType]) {
      return json({ error: 'Arquivo excede o limite permitido para este tipo' }, 413);
    }

    try {
      const metaForm = new FormData();
      metaForm.append('file', file);
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
        filename: file.name,
      });

    } catch (err: any) {
      console.error('[media upload] erro:', err.message);
      return new Response('Bad Gateway', { status: 502 });
    }
  }
```

- [ ] **Step 2.2: Testar upload manualmente**

```bash
curl -b "session=<cookie>" \
  -F "phoneNumberId=<phoneId>" \
  -F "file=@/tmp/test.jpg" \
  http://localhost:3000/api/v2/media/upload

# Espera: { "media_id": "...", "mime_type": "image/jpeg", "type": "image", "filename": "test.jpg" }
```

- [ ] **Step 2.3: Commit**

```bash
git add src/modules/conversations/media.routes.ts
git commit -m "feat(media): adiciona POST /api/v2/media/upload"
```

---

## Task 3: Backend — Estender sendMessage para Mídia

**Files:**
- Modify: `src/modules/conversations/conversations.controller.ts`
- Modify: `src/modules/conversations/conversations.service.ts`

### Contexto

`sender.send()` já aceita tipos de mídia com campo `id`. Para documentos, o `sender.service.ts` suporta `document.filename` (linha 12 do arquivo). O campo deve ser passado para que o destinatário veja o nome do arquivo.

- [ ] **Step 3.1: Atualizar validação em `conversations.controller.ts`**

Substituir as linhas 18-33 (validação + chamada ao service):

```ts
// ANTES (linhas 18-33):
const body = await req.json().catch(() => null);
if (!body?.message || typeof body.message !== 'string') {
  return Response.json({ error: 'Campo message obrigatorio' }, { status: 400 });
}

const client = db.getClientByPhoneId(phone_number_id);
if (!client) {
  return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
}

try {
  const result = await ConversationsService.sendMessage({
    phone_number_id,
    contact_phone,
    message: body.message,
  });
```

Por:

```ts
// DEPOIS:
const body = await req.json().catch(() => null);

const isMedia = !!body?.type;
if (isMedia && !body?.media_id) {
  return Response.json({ error: 'Campo media_id obrigatorio' }, { status: 400 });
}
if (!isMedia && (!body?.message || typeof body.message !== 'string')) {
  return Response.json({ error: 'Campo message obrigatorio' }, { status: 400 });
}

const client = db.getClientByPhoneId(phone_number_id);
if (!client) {
  return Response.json({ error: 'Conta nao encontrada' }, { status: 404 });
}

try {
  const result = await ConversationsService.sendMessage({
    phone_number_id,
    contact_phone,
    message: body.message,
    type: body.type,
    media_id: body.media_id,
    caption: body.caption,
    filename: body.filename,
  });
```

- [ ] **Step 3.2: Estender `ConversationsService.sendMessage`**

Substituir o método completo (linhas 15-45) em `conversations.service.ts`:

```ts
static async sendMessage(params: {
  phone_number_id: string;
  contact_phone: string;
  message?: string;
  type?: 'text' | 'image' | 'audio' | 'video' | 'document';
  media_id?: string;
  caption?: string;
  filename?: string;
}): Promise<{ wamid: string }> {
  const { phone_number_id, contact_phone, message, type = 'text', media_id, caption, filename } = params;

  let sendInput: Parameters<typeof sender.send>[0];
  if (type === 'text') {
    sendInput = { phone_number_id, to: contact_phone, type: 'text', text: { body: message! } };
  } else if (type === 'image') {
    sendInput = { phone_number_id, to: contact_phone, type: 'image', image: { id: media_id!, caption } };
  } else if (type === 'audio') {
    sendInput = { phone_number_id, to: contact_phone, type: 'audio', audio: { id: media_id! } };
  } else if (type === 'video') {
    sendInput = { phone_number_id, to: contact_phone, type: 'video', video: { id: media_id!, caption } };
  } else if (type === 'document') {
    sendInput = { phone_number_id, to: contact_phone, type: 'document', document: { id: media_id!, caption, filename } };
  } else {
    throw new Error(`Tipo nao suportado: ${type}`);
  }

  const result = await sender.send(sendInput);

  if (!result.success || !result.data?.messages?.[0]?.id) {
    throw new Error(result.error ?? 'Falha ao enviar mensagem via Meta API');
  }

  const wamid = result.data.messages[0].id as string;

  // content espelha o payload enviado — inclui 'type' para compatibilidade com renderBody no frontend
  const content = type === 'text'
    ? { type: 'text', text: { body: message } }
    : { type, [type]: { id: media_id, ...(caption ? { caption } : {}), ...(filename ? { filename } : {}) } };

  db.saveMessage({
    id: wamid,
    phone_number_id,
    contact_phone,
    direction: 'outbound',
    type,
    content,
  });

  return { wamid };
}
```

- [ ] **Step 3.3: Verificar envio de texto ainda funciona**

```bash
curl -b "session=<cookie>" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"message": "teste backend"}' \
  "http://localhost:3000/api/v2/conversations/<phoneId>/<contact>"

# Espera: { "wamid": "wamid..." }
```

- [ ] **Step 3.4: Commit**

```bash
git add src/modules/conversations/conversations.controller.ts \
        src/modules/conversations/conversations.service.ts
git commit -m "feat(conversations): estende sendMessage para suporte a mídia"
```

---

## Task 4: Frontend — Renderização de Mídia Recebida

**Files:**
- Modify: `src/frontend/pages/conversations/ConversationView.tsx`

### Contexto

**Problema de retrocompatibilidade:** Mensagens de texto antigas no banco de dados têm `content` no formato `{"text": {"body": "..."}}` (sem campo `type`). O novo `renderBody` deve detectar esse caso e tratá-lo como texto, evitando que mensagens antigas exibam `[mídia]`.

Cada `Message.content` no DB é uma string JSON do payload Meta:
```json
// Novo formato (text):
{"type": "text", "text": {"body": "mensagem"}}
// Formato antigo (text, sem type):
{"text": {"body": "mensagem"}}
// Mídia:
{"type": "image", "image": {"id": "12345", "mime_type": "image/jpeg"}}
```

A URL do proxy é: `/api/v2/media/proxy/<mediaId>?phoneNumberId=<phoneId>&filename=<filename>`

- [ ] **Step 4.1: Atualizar imports no topo de `ConversationView.tsx`**

Substituir a linha de imports existente:
```tsx
// Antes:
import { Check, CheckCheck } from 'lucide-react';
```

Por (consolidado em um único import):
```tsx
import { Check, CheckCheck, FileText, ImageOff, RefreshCw, Paperclip, X } from 'lucide-react';
```

- [ ] **Step 4.2: Adicionar componentes auxiliares antes da função principal do componente**

Adicionar imediatamente antes da linha `export default function ConversationView`:

```tsx
// Constrói URL do proxy de mídia
function proxyUrl(mediaId: string, phoneId: string, filename?: string) {
  const params = new URLSearchParams({ phoneNumberId: phoneId });
  if (filename) params.set('filename', filename);
  return `/api/v2/media/proxy/${mediaId}?${params}`;
}

// Lightbox para imagens
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <img
        src={src}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// Renderizador de mídia com estados de erro
function MediaMessage({ type, mediaId, phoneId, caption, filename }: {
  type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  mediaId: string;
  phoneId: string;
  caption?: string;
  filename?: string;
}) {
  const [errored, setErrored] = React.useState<false | 'transient' | 'expired'>(false);
  const [lightbox, setLightbox] = React.useState(false);
  const [retryKey, setRetryKey] = React.useState(0);

  // URL com chave de retry para forçar re-fetch no browser
  const url = proxyUrl(mediaId, phoneId, filename) + `&_k=${retryKey}`;

  // Chamado quando img/audio/video falha no carregamento
  async function handleMediaError() {
    try {
      const res = await fetch(proxyUrl(mediaId, phoneId, filename));
      if (res.status === 404) {
        const body = await res.json().catch(() => ({})) as any;
        setErrored(body.expired ? 'expired' : 'transient');
      } else {
        setErrored('transient');
      }
    } catch {
      setErrored('transient');
    }
  }

  if (errored) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200 min-w-[180px]">
        <ImageOff className="h-8 w-8 text-gray-300" />
        <span className="text-xs text-gray-400 text-center">
          {errored === 'expired' ? 'Mídia expirada' : 'Mídia indisponível'}
        </span>
        {errored === 'transient' && (
          <button
            onClick={() => { setErrored(false); setRetryKey(k => k + 1); }}
            className="text-xs text-blue-600 flex items-center gap-1 hover:underline"
          >
            <RefreshCw className="h-3 w-3" /> Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (type === 'image' || type === 'sticker') {
    return (
      <div>
        {lightbox && <Lightbox src={url} onClose={() => setLightbox(false)} />}
        <img
          src={url}
          onError={handleMediaError}
          onClick={() => type === 'image' && setLightbox(true)}
          className={`max-w-[240px] max-h-[240px] rounded-lg object-cover block ${type === 'image' ? 'cursor-pointer hover:opacity-90' : ''}`}
        />
        {caption && <p className="text-xs text-gray-500 mt-1">{caption}</p>}
      </div>
    );
  }

  if (type === 'audio') {
    return <audio controls src={url} onError={handleMediaError} className="w-60 h-10" />;
  }

  if (type === 'video') {
    return (
      <div>
        <video
          controls src={url} onError={handleMediaError}
          className="max-w-[280px] rounded-lg"
          style={{ aspectRatio: '16/9' }}
        />
        {caption && <p className="text-xs text-gray-500 mt-1">{caption}</p>}
      </div>
    );
  }

  if (type === 'document') {
    // <a> não suporta onError — documento é sempre clicável
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 text-sm text-blue-700"
      >
        <FileText className="h-5 w-5 shrink-0" />
        <span className="truncate max-w-[180px]">{filename ?? 'Documento'}</span>
      </a>
    );
  }

  return null;
}
```

- [ ] **Step 4.3: Substituir `getBody` por `renderBody` (retrocompatível)**

Substituir a função `getBody` existente (linhas 46-51):

```tsx
// Antes:
function getBody(content: string): string {
  try {
    const c = JSON.parse(content);
    return c?.text?.body ?? `[${c?.type ?? 'midia'}]`;
  } catch { return '[conteudo]'; }
}
```

Por (dentro do componente `ConversationView`, antes do `return`):

```tsx
// Dentro do componente ConversationView — substituir getBody por renderBody
function renderBody(content: string): React.ReactNode {
  try {
    const c = JSON.parse(content);

    // Retrocompatibilidade: mensagens antigas sem campo 'type' mas com text.body
    if (!c?.type && c?.text?.body !== undefined) {
      return <span>{c.text.body}</span>;
    }

    const type = c?.type;
    if (type === 'text') return <span>{c.text?.body ?? ''}</span>;

    const mediaTypes = ['image', 'audio', 'video', 'document', 'sticker'] as const;
    type MediaType = typeof mediaTypes[number];
    if (mediaTypes.includes(type as MediaType)) {
      const block = c[type];
      return (
        <MediaMessage
          type={type as MediaType}
          mediaId={block?.id ?? ''}
          phoneId={phoneId}
          caption={block?.caption}
          filename={block?.filename}
        />
      );
    }

    return <span className="italic text-gray-400">[{type ?? 'mídia'}]</span>;
  } catch {
    return <span className="italic text-gray-400">[conteúdo]</span>;
  }
}
```

> Esta função é definida **dentro** do corpo de `ConversationView` para ter acesso ao `phoneId` prop.

- [ ] **Step 4.4: Atualizar JSX que chama `getBody`**

Substituir na área de mensagens:

```tsx
// Antes:
<div>{getBody(msg.content)}</div>

// Depois:
<div>{renderBody(msg.content)}</div>
```

- [ ] **Step 4.5: Verificar visualmente**

Abrir uma conversa com mensagens de texto antigas — devem continuar exibindo normalmente. Mensagens com mídia devem renderizar inline.

- [ ] **Step 4.6: Commit**

```bash
git add src/frontend/pages/conversations/ConversationView.tsx
git commit -m "feat(conversations): renderiza mídia recebida inline (image, audio, video, document)"
```

---

## Task 5: Frontend — UX de Envio de Mídia

**Files:**
- Modify: `src/frontend/pages/conversations/ConversationView.tsx`

### Contexto sobre o Optimistic Update

Ao enviar mídia, **não** fazemos optimistic update com a mídia em si (pois o `media_id` ainda não existe antes do upload terminar). Em vez disso, mostramos uma mensagem temporária de texto "Enviando mídia…" que é substituída pela lista real após o envio completar. Isso evita o bug de renderizar `<img src="/api/v2/media/proxy/pending?...">` que causaria um request inválido imediato.

- [ ] **Step 5.1: Adicionar constantes e utilitários no topo do componente**

Adicionar logo após os hooks `useState` existentes (dentro do componente `ConversationView`):

```tsx
// Referências e state para anexo (adicionar após os useState existentes)
const [attachment, setAttachment] = React.useState<File | null>(null);
const [uploading, setUploading] = React.useState(false);
const [uploadProgress, setUploadProgress] = React.useState(0);
const fileInputRef = React.useRef<HTMLInputElement>(null);
```

Constantes (podem ficar fora do componente, junto às outras funções auxiliares):

```tsx
const ACCEPTED_MIMES = [
  'image/jpeg', 'image/png', 'image/webp',
  'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/opus',
  'video/mp4', 'video/3gpp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const CLIENT_MIME_TO_TYPE: Record<string, string> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'audio/mp4': 'audio', 'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'audio/opus': 'audio',
  'video/mp4': 'video', 'video/3gpp': 'video',
  'application/pdf': 'document', 'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'text/plain': 'document',
};

const CLIENT_SIZE_LIMITS: Record<string, number> = {
  image: 16 * 1024 * 1024, audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024, document: 100 * 1024 * 1024,
};

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
```

- [ ] **Step 5.2: Adicionar funções de seleção e drag & drop (dentro do componente)**

Adicionar dentro do componente `ConversationView`, antes do `return`:

```tsx
// Dentro do componente ConversationView
function handleFileSelect(file: File) {
  if (!ACCEPTED_MIMES.includes(file.type)) {
    setError(`Tipo de arquivo não suportado: ${file.type}`);
    return;
  }
  const mediaType = CLIENT_MIME_TO_TYPE[file.type];
  const limit = CLIENT_SIZE_LIMITS[mediaType] ?? 16 * 1024 * 1024;
  if (file.size > limit) {
    setError(`Arquivo excede o limite de ${formatBytes(limit)}`);
    return;
  }
  setAttachment(file);
  setError(null);
}

function handleDragOver(e: React.DragEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function handleDrop(e: React.DragEvent) {
  e.preventDefault();
  e.stopPropagation();
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
}
```

- [ ] **Step 5.3: Substituir `sendMessage` pelo handler completo com suporte a mídia**

Substituir a função `sendMessage` existente (linhas 53-93):

```tsx
async function sendMessage() {
  const hasText = text.trim().length > 0;
  const hasFile = !!attachment;
  if (!hasText && !hasFile) return;

  const caption = hasFile && hasText ? text.trim() : undefined;
  const textBody = !hasFile ? text.trim() : '';

  setText('');
  setSending(true);
  setError(null);

  // Optimistic update: para mídia, mostra "Enviando..." em vez de tentar renderizar
  // a mídia antes de ter o media_id — evita request inválido ao proxy
  const tempId = `temp-${Date.now()}`;
  const tempContent = hasFile
    ? JSON.stringify({ type: 'text', text: { body: '⏳ Enviando mídia…' } })
    : JSON.stringify({ type: 'text', text: { body: textBody } });

  const tempMsg: Message = {
    id: tempId,
    direction: 'outbound',
    type: 'text',
    content: tempContent,
    status: 'sent',
    created_at: new Date().toISOString(),
  };
  setMessages(prev => [...prev, tempMsg]);

  try {
    let sendBody: Record<string, any>;

    if (hasFile) {
      setUploading(true);
      setUploadProgress(0);

      const form = new FormData();
      form.append('file', attachment!);
      form.append('phoneNumberId', phoneId);

      // XHR para ter progresso real
      const uploadResult = await new Promise<{
        media_id: string; type: string; filename: string;
      }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/v2/media/upload');
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText)?.error ?? 'Falha no upload'));
            } catch {
              reject(new Error('Falha no upload'));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Erro de conexão'));
        xhr.send(form);
      });

      setUploading(false);
      setAttachment(null);
      sendBody = {
        type: uploadResult.type,
        media_id: uploadResult.media_id,
        filename: uploadResult.filename,
        ...(caption ? { caption } : {}),
      };
    } else {
      sendBody = { message: textBody };
    }

    const res = await fetch(
      `/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sendBody) },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      setError(err.error ?? 'Erro ao enviar mensagem');
      setMessages(prev => prev.filter(m => m.id !== tempId));
      return;
    }

    // Substitui temp pela lista atualizada do servidor
    const updated = await fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`).then(r => r.json());
    setMessages(updated);

  } catch (err: any) {
    setError(err.message ?? 'Erro de conexão');
    setMessages(prev => prev.filter(m => m.id !== tempId));
    setUploading(false);
  } finally {
    setSending(false);
    setUploadProgress(0);
  }
}
```

- [ ] **Step 5.4: Atualizar JSX — substituir bloco de input e adicionar preview e drag & drop**

No `return` do componente, substituir **todo** o bloco após `{/* Mensagens */}` (a partir do `{/* Erro de envio */}`):

```tsx
      {/* Drag & drop wrapper — envolve preview, erro e input */}
      <div
        className="flex flex-col"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Preview do anexo pendente */}
        {attachment && (
          <div className="px-4 pt-3 pb-2 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <FileText className="h-5 w-5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{attachment.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(attachment.size)}</p>
              </div>
              {uploading ? (
                <div className="w-20 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAttachment(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Erro de envio */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-600 text-xs">{error}</div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-gray-200 bg-white flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIMES.join(',')}
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 shrink-0"
            title="Anexar arquivo"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder={attachment ? 'Adicionar legenda…' : 'Digite uma mensagem...'}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={uploading}
          />
          <button
            onClick={sendMessage}
            disabled={sending || uploading || (!text.trim() && !attachment)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            {uploading ? `${uploadProgress}%` : sending ? '…' : 'Enviar'}
          </button>
        </div>
      </div>
```

> Remover o bloco `{/* Erro de envio */}` antigo (estava fora do wrapper) — já está incluído acima.

- [ ] **Step 5.5: Verificar envio end-to-end**

1. Abrir uma conversa
2. Clicar no clipe → selecionar imagem → preview com nome/tamanho aparece
3. Clicar Enviar → barra de progresso → "⏳ Enviando mídia…" aparece → substitui pela imagem real
4. No celular, confirmar que a imagem chegou
5. Testar drag & drop: arrastar arquivo para a conversa → preview aparece

- [ ] **Step 5.6: Commit**

```bash
git add src/frontend/pages/conversations/ConversationView.tsx
git commit -m "feat(conversations): adiciona envio de mídia com clipe, drag & drop e preview"
```

---

## Task 6: Validação Final

- [ ] **Step 6.1: Testar recebimento de todos os tipos**

Enviar do celular para o número cadastrado:
- Imagem → renderiza `<img>`, clique abre lightbox
- Áudio → renderiza `<audio controls>`
- Vídeo → renderiza `<video controls>`
- Documento PDF → renderiza link de download com nome do arquivo

- [ ] **Step 6.2: Testar que mensagens antigas de texto continuam OK**

Abrir uma conversa com histórico de mensagens de texto antigas (formato sem `type`). Devem exibir o texto normalmente.

- [ ] **Step 6.3: Testar estados de erro**

Para testar "Mídia indisponível": abrir DevTools → Network → bloquear requisições para `/api/v2/media/proxy/`. Deve aparecer placeholder + botão retry.

- [ ] **Step 6.4: Commit final**

```bash
git add -A
git commit -m "feat(conversations): suporte completo a mídia — receber e enviar"
```
