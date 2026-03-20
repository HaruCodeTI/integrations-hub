# Design: Suporte a Mídia em Conversas

**Data:** 2026-03-20
**Status:** Aprovado

---

## Visão Geral

Adicionar suporte completo a mídia (receber e enviar) na aba de Conversas do integrations-hub. Atualmente mensagens com mídia exibem `[image]`, `[audio]`, etc. O objetivo é renderizar a mídia inline e permitir que o usuário envie arquivos de qualquer tipo suportado pela Meta Cloud API.

---

## Escopo

- **Receber:** image, audio, video, document, sticker
- **Enviar:** image, audio, video, document
- **UX de envio:** ícone de clipe + drag & drop → preview → confirmar
- **Erro de exibição:** placeholder + botão "Tentar novamente" (exceto mídia expirada)

---

## Arquitetura

### Abordagem: Lazy cache via `mediaService` existente

Reutiliza `mediaService.downloadAndCache()` e `mediaService.getProxyUrl()` já presentes. O cache é em memória (TTL 10 minutos — comportamento atual do `mediaService`). O cache é feito na primeira visualização (lazy), servindo do cache nas subsequentes dentro do TTL. Não altera o fluxo do webhook.

---

## Seção 1 — Backend

### Novo módulo: `src/modules/conversations/media.routes.ts`

Exporta `mediaRoutes(req, method, pathname)` registrado em `router.ts` ao lado das demais rotas v2.

#### Proxy de recebimento
```
GET /api/v2/media/proxy/:mediaId?phoneNumberId=xxx&filename=xxx
```
- **Autenticação:** cookie de sessão (mesmo mecanismo de todas as rotas `/api/v2/`). O `phoneNumberId` serve apenas para selecionar o token Meta correto — não é um mecanismo de auth.
- Chama `mediaService.downloadAndCache(mediaId, phoneNumberId)` → stream com `Content-Type` correto
- Para tipo `document`: inclui header `Content-Disposition: attachment; filename="<filename>"` (filename vem do query param `filename`, sanitizado no backend)
- **Erros:**
  - `404` com body `{ expired: true }` → mídia não encontrada na Meta (expirada ou inválida) — sinaliza permanência ao frontend
  - `502` → Meta indisponível (transitório) — frontend pode oferecer retry
  - `400` → `phoneNumberId` não corresponde a nenhuma conta cadastrada

#### Upload para envio
```
POST /api/v2/media/upload
Content-Type: multipart/form-data
Body: { file: File, phoneNumberId: string }
```
- Recebe arquivo via multipart
- **Validação server-side (antes de qualquer I/O):**
  - `phoneNumberId` válido no DB
  - `mime_type` derivado do `Content-Type` do multipart field (não confiado do cliente) e validado contra a lista de tipos permitidos abaixo
  - Tamanho do arquivo: `413` se exceder os limites da Meta
- Faz upload na Meta Media API usando o token da conta correspondente
- Retorna `{ media_id: string, mime_type: string, type: "image" | "audio" | "video" | "document" }`
- **Tipos e limites aceitos (send):**

| Tipo | MIMEs aceitos | Limite |
|------|--------------|--------|
| image | image/jpeg, image/png, image/webp | 16 MB |
| audio | audio/mp4, audio/mpeg, audio/ogg, audio/opus | 16 MB |
| video | video/mp4, video/3gpp | 16 MB |
| document | application/pdf, application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document, text/plain | 100 MB |

> Nota: `audio/aac` **não** é suportado para envio pela Meta Cloud API. Está excluído da lista.

- **Erros:**
  - `400` tipo MIME inválido ou não suportado
  - `413` arquivo excede limite
  - `502` falha na Meta

#### Endpoint de envio de mídia
O endpoint existente `POST /api/v2/conversations/:phoneId/:contact` é **estendido** para aceitar payload de mídia além do texto:

```ts
// Payload texto (existente)
{ message: string }

// Payload mídia (novo)
{ type: "image" | "audio" | "video" | "document", media_id: string, caption?: string }
```

**Mudanças necessárias no `conversations.controller.ts`:**
A validação atual rejeita qualquer request sem `body.message`. Deve ser alterada para:
- Se `body.type` presente (mídia): `message` não é obrigatório; valida presença de `media_id`
- Se `body.type` ausente (texto): `message` obrigatório como string (comportamento atual)

```ts
// Nova lógica de validação
const isMedia = !!body?.type;
if (isMedia && !body?.media_id) {
  return Response.json({ error: 'Campo media_id obrigatorio' }, { status: 400 });
}
if (!isMedia && (!body?.message || typeof body.message !== 'string')) {
  return Response.json({ error: 'Campo message obrigatorio' }, { status: 400 });
}
```

**Mudanças necessárias no `ConversationsService.sendMessage`:**
O método atual aceita apenas `{ phone_number_id, contact_phone, message: string }`. Deve ser estendido:

```ts
static async sendMessage(params: {
  phone_number_id: string;
  contact_phone: string;
  message?: string;           // texto — obrigatório se type === 'text'
  type?: 'text' | 'image' | 'audio' | 'video' | 'document';
  media_id?: string;          // obrigatório se type !== 'text'
  caption?: string;
}): Promise<{ wamid: string }>
```

Para mídia, o `sender.send()` é chamado com o tipo correspondente (ex: `{ type: 'image', image: { id: media_id, caption } }`), que o `sender.service` já suporta. A mensagem é salva no DB com `type` e `content` correspondentes ao payload de mídia.

#### Diferenciação de erros no proxy
O `mediaService.downloadAndCache()` atual lança erros genéricos sem distinção de código HTTP. O handler da rota proxy deve:
1. Chamar `mediaService.getMediaUrl(mediaId, phoneNumberId)` primeiro para obter a URL autenticada da Meta
2. Fazer um `fetch` dessa URL inspecionando o status:
   - `404` da Meta → responder `{ expired: true }` com status 404
   - `5xx` / erro de rede → responder com status 502 (transitório)
3. Se URL OK, stream do conteúdo

Essa abordagem não requer alteração no `mediaService` — a lógica de diferenciação fica no handler da rota.

> Nota: `audio/ogg; codecs=opus` é o MIME com que a Meta entrega áudio recebido. Para *envio*, o `accept` usa `audio/ogg` (sem codec suffix) — essa variante nunca aparece em uploads multipart. O proxy de recebimento é pass-through e não filtra MIME, portanto não é afetado.

---

## Seção 2 — Frontend: Exibição de Mídia Recebida

### Arquivo: `src/frontend/pages/conversations/ConversationView.tsx`

#### Parsing do campo `content`

O campo `content` no DB é o JSON completo da mensagem Meta. Para extrair `type` e `media_id`:

```ts
const parsed = JSON.parse(msg.content);       // { type: "image", image: { id: "...", mime_type: "..." }, ... }
const mediaType = parsed.type;                 // "image" | "audio" | "video" | "document" | "sticker" | "text"
const mediaBlock = parsed[mediaType];          // parsed.image, parsed.audio, etc.
const mediaId = mediaBlock?.id;
const filename = mediaBlock?.filename;         // só em document
```

#### Construção da URL de proxy
```
/api/v2/media/proxy/{mediaId}?phoneNumberId={phoneNumberId}&filename={filename}
```
`phoneNumberId` vem do contexto da conversa aberta.

#### Renderização por tipo (`getBody()`)

| Tipo | Renderização |
|------|-------------|
| `text` | texto puro (comportamento atual) |
| `image` | `<img>` com proxy URL, `object-fit: cover`, clique abre lightbox (modal fullscreen) |
| `audio` | `<audio controls>` com proxy URL, largura ~240px |
| `video` | `<video controls>` com proxy URL, aspect ratio 16:9, poster escuro com ícone play |
| `document` | Ícone de arquivo + `filename` + link de download via proxy (abre download) |
| `sticker` | `<img>` igual a image, sem lightbox |

#### Estado de erro (por tipo de falha)

| Resposta do proxy | Estado exibido |
|------------------|---------------|
| Erro transitório (502, network fail) | Placeholder + ícone + "Mídia indisponível" + botão "Tentar novamente" |
| `{ expired: true }` (404 permanente) | Placeholder + ícone + "Mídia expirada" (sem botão retry) |

O componente distingue a permanência pelo corpo da resposta `{ expired: true }`.

---

## Seção 3 — Frontend: Envio de Mídia

### Arquivo: `src/frontend/pages/conversations/ConversationView.tsx`

#### Input area
- Ícone Paperclip (lucide-react) à esquerda do campo de texto → clique abre `<input type="file" hidden>`
- `accept` no input cobre os tipos sendáveis (mesma lista da seção 1, sem `audio/aac`)
- Drag & drop na área de conversa inteira (`onDragOver` + `onDrop`)
- **Validação client-side** (UX apenas — backend valida novamente):
  - Tipo MIME não aceito → toast de erro, arquivo rejeitado
  - Tamanho acima do limite → toast de erro antes de qualquer upload
- Quando há arquivo selecionado, o campo de texto vira campo de caption (placeholder: "Adicionar legenda…")

#### Preview panel
Exibido entre as mensagens e o input quando há arquivo pendente:
- Thumbnail para image/video, ícone genérico para document/audio
- Nome do arquivo + tamanho formatado (ex: "foto.jpg · 2,3 MB")
- Barra de progresso durante upload (`XMLHttpRequest` com `onprogress` ou `fetch` com stream)
- Botão X para cancelar (limpa o arquivo selecionado e aborta upload em curso)

#### Fluxo de envio
1. Usuário seleciona/arrasta arquivo → preview aparece
2. Usuário clica Enviar (ou pressiona Enter com caption):
   a. `POST /api/v2/media/upload` (multipart) → `{ media_id, type }`
   b. `POST /api/v2/conversations/:phoneId/:contact` com `{ type, media_id, caption? }`
3. Preview some, mensagem aparece na conversa

#### Erros de envio
| Cenário | Comportamento |
|---------|--------------|
| Upload falha (502, timeout) | Toast "Falha no upload. Tente novamente." Preview mantido |
| Tipo inválido (400) | Toast com o erro retornado pelo backend |
| Arquivo muito grande (413) | Toast "Arquivo excede o limite permitido." Preview mantido |

---

## Fluxo de Dados

### Receber
```
Meta webhook → controller salva msg no DB (JSON completo com media_id)
                                    ↓
Frontend abre conversa → lê mensagens → parse content → constrói proxy URL
                                    ↓
GET /api/v2/media/proxy/:mediaId → mediaService.downloadAndCache → stream
```

### Enviar
```
Usuário seleciona arquivo → validação client → preview
                    ↓
POST /api/v2/media/upload → validação server → Meta Media Upload API → { media_id }
                    ↓
POST /api/v2/conversations/:phoneId/:contact { type, media_id, caption }
                    → sender.service → Meta Send API
```

---

## Fora do Escopo

- Thumbnail de vídeo gerado server-side
- Compressão de imagem antes do envio
- Envio múltiplo (mais de um arquivo por vez)
- Histórico de mídia / galeria
- Cache persistente em disco (fora do TTL em memória do `mediaService`)
