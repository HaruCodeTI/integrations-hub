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
- **Erro de exibição:** placeholder + botão "Tentar novamente"

---

## Arquitetura

### Abordagem: Lazy cache via `mediaService` existente

Reutiliza `mediaService.downloadAndCache()` e `mediaService.getProxyUrl()` já presentes. O cache é feito na primeira visualização (lazy), servindo do disco nas subsequentes. Não altera o fluxo do webhook.

---

## Seção 1 — Backend

### Novo módulo: `src/modules/conversations/media.routes.ts`

#### Proxy de recebimento
```
GET /api/v2/media/proxy/:mediaId?phoneNumberId=xxx
```
- Chama `mediaService.downloadAndCache(mediaId, phoneNumberId)`
- Faz stream da resposta com `Content-Type` correto
- Cache em disco — segunda visualização é instantânea
- Autenticação: `phoneNumberId` válido (deve corresponder a uma conta cadastrada)
- Erros: 404 se media não encontrada, 502 se Meta indisponível

#### Upload para envio
```
POST /api/v2/media/upload
Content-Type: multipart/form-data
Body: { file: File, phoneNumberId: string }
```
- Recebe arquivo via multipart
- Faz upload na Meta Media API usando o token da conta correspondente ao `phoneNumberId`
- Retorna `{ media_id: string, mime_type: string, type: "image" | "audio" | "video" | "document" }`
- Limites Meta: image 16MB, audio 16MB, video 16MB, document 100MB
- Erros: 400 tipo inválido, 413 arquivo muito grande, 502 falha na Meta

### Registro das rotas
As novas rotas são registradas no roteador principal ao lado das demais rotas de conversas.

---

## Seção 2 — Frontend: Exibição de Mídia Recebida

### Arquivo: `src/frontend/pages/conversations/ConversationView.tsx`

#### Construção da URL de proxy
O JSON de cada mensagem armazenado no DB contém o `media_id` em `msg.image.id`, `msg.audio.id`, etc. A URL de proxy é construída no frontend:
```
/api/v2/media/proxy/{mediaId}?phoneNumberId={phoneNumberId}
```

#### Renderização por tipo (`getBody()`)

| Tipo | Renderização |
|------|-------------|
| `image` | `<img>` com proxy URL, `object-fit: cover`, clique abre lightbox (modal fullscreen) |
| `audio` | `<audio controls>` com proxy URL, largura ~240px |
| `video` | `<video controls>` com proxy URL, aspect ratio 16:9, poster escuro com ícone play |
| `document` | Ícone de arquivo + `filename` + link de download via proxy |
| `sticker` | `<img>` igual a image, sem lightbox |

#### Estado de erro
- Placeholder com ícone do tipo + "Mídia indisponível"
- Botão "Tentar novamente" → força re-fetch limpando a key de cache do componente (re-mount)

---

## Seção 3 — Frontend: Envio de Mídia

### Arquivo: `src/frontend/pages/conversations/ConversationView.tsx`

#### Input area
- Ícone de clipe (Paperclip do lucide-react) à esquerda do campo de texto
- Clique abre `<input type="file" hidden>` com `accept` cobrindo tipos Meta:
  - Imagens: `image/jpeg,image/png,image/webp`
  - Áudio: `audio/aac,audio/mp4,audio/mpeg,audio/ogg`
  - Vídeo: `video/mp4,video/3gpp`
  - Documento: `application/pdf,application/msword,...`
- Drag & drop na área de conversa inteira (`onDragOver` + `onDrop`)
- Quando há arquivo selecionado, o campo de texto vira caption (placeholder: "Adicionar legenda…")

#### Preview panel
Exibido entre as mensagens e o input quando há arquivo pendente:
- Thumbnail para image/video, ícone genérico para document/audio
- Nome do arquivo + tamanho formatado
- Barra de progresso durante upload
- Botão X para cancelar (limpa o arquivo selecionado)

#### Fluxo de envio
1. Usuário seleciona/arrasta arquivo → preview aparece
2. Usuário clica Enviar (ou pressiona Enter com caption):
   a. `POST /api/v2/media/upload` (multipart) → `{ media_id, type }`
   b. `POST /api/v2/conversations/:phoneId/:contact/send` com `{ type, media_id, caption? }`
3. Preview some, mensagem aparece na conversa com status "enviando"

---

## Fluxo de Dados

### Receber
```
Meta webhook → controller salva msg no DB (JSON completo com media_id)
                                    ↓
Frontend abre conversa → lê mensagens → constrói proxy URL
                                    ↓
GET /api/v2/media/proxy/:mediaId → mediaService.downloadAndCache → stream
```

### Enviar
```
Usuário seleciona arquivo → preview
                    ↓
POST /api/v2/media/upload → Meta Media Upload API → { media_id }
                    ↓
POST /send { type, media_id, caption } → sender.service → Meta Send API
```

---

## Tratamento de Erros

| Cenário | Comportamento |
|---------|--------------|
| Proxy falha (Meta indisponível) | Placeholder + botão retry |
| Mídia expirada na Meta (~30 dias) | Mesmo placeholder + retry |
| Arquivo muito grande no envio | Toast de erro antes do upload |
| Upload falha na Meta | Toast de erro, preview mantido para retry |
| Tipo de arquivo não suportado | Toast de erro, arquivo rejeitado |

---

## Fora do Escopo

- Preview de vídeo com thumbnail gerado (poster estático escuro)
- Compressão de imagem antes do envio
- Envio múltiplo (mais de um arquivo por vez)
- Histórico de mídia / galeria
