# Design: Painel WhatsApp — Templates, Conversas e Campanhas

**Data:** 2026-03-20
**Status:** Aprovado
**Escopo:** Interno (admin único)

---

## Contexto

O integrations-hub já funciona como gateway de WhatsApp multi-tenant rodando em DigitalOcean. Ele recebe webhooks da Meta, roteia mensagens para clientes (webhook ou GHL), gerencia tokens OAuth e expõe um painel admin simples.

Este documento especifica a expansão do sistema com três novos módulos:
1. **Templates** — CRUD de message templates via Meta Graph API
2. **Conversas** — Inbox por conta com histórico persistente
3. **Campanhas** — Disparos em massa com CSV, agendamento e métricas

---

## Decisões de Arquitetura

| Decisão | Escolha | Motivo |
|---|---|---|
| Usuários do painel | Admin interno apenas | Fase atual não requer multi-tenant |
| Localização do código | Módulos dentro do servidor Bun atual | Evita overhead operacional de 2 processos |
| Frontend | React SPA via Bun HTML imports, servida em `/painel` | Sem Vite, consistente com CLAUDE.md |
| Banco de dados | Mesmo SQLite (`gateway.db`) com novas tabelas | Sem dependências extras |
| Templates — armazenamento | Não armazenados localmente | Sempre buscados da Meta API (evita dados obsoletos) |
| Conversas — histórico | Salvo no banco conforme webhooks chegam | Meta API não tem endpoint de histórico |
| Campanhas — processamento | Fila persistente no SQLite + worker em loop no mesmo processo | Robusto a restarts, sem dependências externas |
| Anti-ban | Delay fixo entre mensagens + rate limit por tier Meta | A + C conforme requisito |

---

## Estrutura de Arquivos

```
src/
├── modules/                         # NOVO
│   ├── templates/
│   │   ├── templates.controller.ts
│   │   ├── templates.service.ts     # Chama Meta Graph API
│   │   └── templates.routes.ts
│   ├── conversations/
│   │   ├── conversations.controller.ts
│   │   ├── conversations.service.ts
│   │   └── conversations.routes.ts
│   └── campaigns/
│       ├── campaigns.controller.ts
│       ├── campaigns.service.ts
│       ├── campaigns.worker.ts      # Fila persistente + dispatcher
│       └── campaigns.routes.ts
├── frontend/                        # NOVO — React SPA
│   ├── index.html                   # Entry point servido em /painel
│   ├── App.tsx
│   ├── pages/
│   │   ├── campaigns/
│   │   │   ├── CampaignList.tsx
│   │   │   ├── CampaignWizard.tsx   # 3 etapas
│   │   │   └── CampaignDetail.tsx
│   │   ├── templates/
│   │   │   ├── TemplateList.tsx
│   │   │   └── TemplateForm.tsx
│   │   └── conversations/
│   │       ├── ConversationList.tsx
│   │       └── ConversationView.tsx
│   └── components/
│       ├── AccountSelector.tsx
│       ├── StatusBadge.tsx
│       ├── MetricCard.tsx
│       └── ContactsTable.tsx
├── controllers/                     # Já existe — gateway intacto
├── services/
│   └── db.service.ts                # Ganha métodos para novas tabelas
└── server.ts                        # Registra módulos + serve frontend
```

---

## Banco de Dados — Novas Tabelas

### `messages`
Armazena todas as mensagens (inbound e outbound) para o inbox.

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,              -- wamid do WhatsApp
  phone_number_id TEXT NOT NULL,    -- qual conta recebeu/enviou
  contact_phone TEXT NOT NULL,      -- número do contato (com DDI)
  direction TEXT NOT NULL,          -- 'inbound' | 'outbound'
  type TEXT NOT NULL,               -- 'text' | 'image' | 'template' | ...
  content TEXT NOT NULL,            -- JSON com corpo da mensagem
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent' | 'delivered' | 'read' | 'failed'
  campaign_id TEXT,                 -- FK campaigns (nullable)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_messages_conversation
  ON messages(phone_number_id, contact_phone, created_at);
```

### `campaigns`
Cabeçalho de cada campanha de disparo.

```sql
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,    -- conta usada no disparo
  template_name TEXT NOT NULL,
  template_language TEXT NOT NULL,
  variable_mapping TEXT NOT NULL,   -- JSON: { "{{nome}}": "coluna_csv" }
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'running' | 'paused' | 'done' | 'cancelled'
  scheduled_at TEXT,                -- NULL = disparo imediato
  delay_seconds INTEGER NOT NULL DEFAULT 3,
  meta_tier INTEGER NOT NULL DEFAULT 1, -- 1 | 2 | 3
  total_contacts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
```

### `campaign_contacts`
Um registro por destinatário de cada campanha.

```sql
CREATE TABLE campaign_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,        -- FK campaigns
  phone TEXT NOT NULL,              -- número com DDI
  variables TEXT NOT NULL,          -- JSON: { "nome": "Israel", ... }
  status TEXT NOT NULL DEFAULT 'pending',
    -- 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled'
  wamid TEXT,                       -- retornado pela Meta após envio
  error_code TEXT,
  error_message TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_campaign_contacts_campaign
  ON campaign_contacts(campaign_id, status);
CREATE INDEX idx_campaign_contacts_wamid
  ON campaign_contacts(wamid);
```

### `campaign_jobs`
Fila persistente de trabalhos de envio. É a tabela que o worker usa para controlar o processamento. `campaign_contacts` é a fonte da verdade para métricas e status visível ao usuário. Ambas devem ser atualizadas em uma única transação SQLite a cada envio para garantir consistência.

```sql
CREATE TABLE campaign_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  contact_id INTEGER NOT NULL,      -- FK campaign_contacts
  status TEXT NOT NULL DEFAULT 'queued',
    -- 'queued' | 'processing' | 'done' | 'failed'
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_campaign_jobs_next
  ON campaign_jobs(status, next_attempt_at);
```

---

## API Routes — Novas (`/api/v2/*`)

Autenticadas por session cookie (mesmo mecanismo do `/admin`).

**Importante — posição no router:** O bloco `/api/v2/*` deve ser registrado em `router.ts` **antes** do bloco `/api/*` existente. O middleware atual `validateApiKey` intercepta qualquer caminho que comece com `/api/`, portanto as rotas v2 devem aparecer primeiro no dispatcher e usar `isAuthenticated` (session cookie) em vez de `validateApiKey`.

### Templates

```
GET    /api/v2/templates/:phone_number_id         Lista templates da Meta API
POST   /api/v2/templates/:phone_number_id         Cria e submete para aprovação
PUT    /api/v2/templates/:phone_number_id/:name   Edita template existente
DELETE /api/v2/templates/:phone_number_id/:name   Exclui template
```

Payload de criação/edição:
```json
{
  "name": "promocao_verao",
  "category": "MARKETING",
  "language": "pt_BR",
  "header": { "type": "TEXT", "text": "Promoção especial" },
  "body": "Olá, {{1}}, confira nossa oferta!",
  "footer": "Enviado via HaruCode",
  "buttons": [],
  "examples": { "body": ["Israel"] }
}
```

### Conversas

```
GET  /api/v2/conversations/:phone_number_id              Lista contatos únicos com última mensagem
GET  /api/v2/conversations/:phone_number_id/:contact     Histórico de mensagens do contato
POST /api/v2/conversations/:phone_number_id/:contact     Envia mensagem manual (texto ou template)
```

### Campanhas

```
GET    /api/v2/campaigns                   Lista todas as campanhas com métricas resumidas
POST   /api/v2/campaigns                   Cria campanha (multipart: dados + arquivo CSV/XLSX)
GET    /api/v2/campaigns/:id               Detalhes + métricas completas
PATCH  /api/v2/campaigns/:id/pause         Pausa campanha em andamento
PATCH  /api/v2/campaigns/:id/resume        Retoma campanha pausada
DELETE /api/v2/campaigns/:id               Cancela campanha
GET    /api/v2/campaigns/:id/contacts      Lista contatos com status individual (paginado)
```

### Contas

```
GET  /api/v2/accounts   Lista clientes WhatsApp Oficial ativos (phone_number_id + name)
```

### Ajuste no Webhook Existente

`webhook.controller.ts` receberá dois novos comportamentos que se aplicam a **todos os clientes** (webhook e GHL), independente do tipo:

1. **Salvar mensagem** → insere em `messages` a cada mensagem inbound, antes de qualquer roteamento específico por tipo de cliente.
2. **Atualizar status** → quando chegar status update (`delivered`, `read`, `failed`), atualiza `messages.status` E verifica se o `wamid` existe em `campaign_contacts.wamid` — se sim, atualiza `delivered_at`, `read_at` ou `error_code` nessa tabela também. Essa verificação é feita por lookup no banco, sem conflito com o processamento GHL existente.

---

## Frontend — Páginas e Componentes

**Rota base:** `/painel` (React SPA, client-side routing)

**SPA wildcard no servidor:** `router.ts` deve registrar uma rota wildcard `/painel/*` que retorna `index.html` para qualquer sub-rota. Isso garante que navegação direta ou refresh em `/painel/campanhas/:id` não resulte em 404. Exemplo com Bun.serve:
```ts
"/painel/*": () => new Response(Bun.file("src/frontend/index.html"))
```

### Páginas

| Rota | Componente | Descrição |
|---|---|---|
| `/painel` | Redirect | → `/painel/campanhas` |
| `/painel/campanhas` | `CampaignList` | Lista com filtros + botão Nova Campanha |
| `/painel/campanhas/nova` | `CampaignWizard` | Wizard 3 etapas |
| `/painel/campanhas/:id` | `CampaignDetail` | Métricas + tabela de contatos |
| `/painel/templates` | `TemplateList` | Seletor de conta + lista templates |
| `/painel/templates/novo` | `TemplateForm` | Formulário criação |
| `/painel/templates/:name/editar` | `TemplateForm` | Formulário edição |
| `/painel/conversas` | `ConversationList` | Seletor de conta + lista conversas |
| `/painel/conversas/:contact` | `ConversationView` | Histórico + campo envio |

### Wizard Nova Campanha

**Etapa 1 — Upload da Lista**
- Campo: Nome da campanha (obrigatório)
- Drag & drop de CSV ou XLSX (máx 10.000 contatos)
- Parsing de XLSX no backend usando o pacote `xlsx` (npm: `xlsx`, compatível com Bun)
- CSV é parseado nativamente sem dependência extra
- Coluna `telefone` obrigatória com DDI
- Preview tabela: telefone + colunas detectadas
- Validação: remove duplicatas, formata números

**Etapa 2 — Canal & Template**
- `AccountSelector`: lista só contas WhatsApp Oficial
- Lista templates com status `APPROVED` da conta selecionada
- Mapeamento de variáveis: `{{1}}` → dropdown com colunas do CSV
- Preview da mensagem renderizada com dados do 1º contato da lista

**Etapa 3 — Confirmar Disparo**
- Delay fixo entre mensagens (padrão: 3s, editável)
- Meta Tier (1/2/3 — define limite diário)
- Checkbox "Agendar para depois" + datetime picker
- Resumo: canal, template, total contatos
- Aviso: template aprovado, números com DDI, rate limit do tier
- Botão "Confirmar Disparo"

### Componentes Compartilhados

- `AccountSelector` — dropdown com contas conectadas, filtrável por tipo
- `StatusBadge` — pill colorido por status (Em Andamento, Concluída, Cancelada, etc.)
- `MetricCard` — card com ícone, número e percentual (Total, Enviados, Entregues, Lidos, Falhas)
- `ContactsTable` — tabela filtrável por status, paginada, com timestamps por coluna

### Autenticação

O SPA usa o mesmo session cookie do `/admin`. Interceptor no fetch verifica 401 e redireciona para `/admin/login`.

---

## Campaign Worker

Roda no mesmo processo Bun (iniciado em `server.ts`). Poll a cada 5 segundos.

### Ciclo de Vida

```
1. Usuário confirma campanha
   → Se scheduled_at preenchido: INSERT campaigns (status: 'pending')
   → Se disparo imediato: INSERT campaigns (status: 'running')
   → INSERT N campaign_contacts (status: 'pending')
   → INSERT N campaign_jobs (status: 'queued')

2. Worker acorda a cada 5s
   → Busca campanhas status: running, scheduled_at <= agora
   → Para cada campanha ativa:
       a. Verifica limite de tier (mensagens enviadas hoje)
       b. Se limite atingido → pausa até meia-noite UTC
       c. Busca próximo job: status=queued, next_attempt_at <= agora
       d. Marca job: processing
       e. Chama Meta Messages API com template + variáveis
       f. Sucesso → salva wamid, contact: sent, job: done
       g. Falha → incrementa attempts, agenda retry, job: failed se attempts >= 3
       h. Aguarda delay_seconds antes do próximo job

3. Webhook de status chega
   → Atualiza messages.status por wamid
   → Atualiza campaign_contacts (delivered_at, read_at, error_code)

4. Campanha encerra
   → Quando não há mais jobs queued/processing
   → Worker marca campaigns.status: done
```

### Rate Limit por Tier

| Tier | Limite diário por número |
|---|---|
| 1 | 1.000 mensagens |
| 2 | 10.000 mensagens |
| 3 | 100.000 mensagens |

O worker conta mensagens enviadas hoje via JOIN explícito:

```sql
SELECT COUNT(*) FROM campaign_contacts cc
JOIN campaigns c ON cc.campaign_id = c.id
WHERE c.phone_number_id = ?
  AND cc.status IN ('sent', 'delivered', 'read')
  AND cc.sent_at >= date('now')
```

Esse JOIN é necessário porque `campaign_contacts` não possui `phone_number_id` diretamente — o vínculo é feito através de `campaigns`.

### Retry com Backoff

| Tentativa | Espera |
|---|---|
| 1ª falha | 60 segundos |
| 2ª falha | 300 segundos |
| 3ª falha | Marca `failed` com `error_code` da Meta |

### Controles

- **Pause** → `campaigns.status = paused` (worker ignora)
- **Resume** → `campaigns.status = running`
- **Cancel** → `campaigns.status = cancelled`, todos jobs `queued/processing` → `cancelled`, todos contacts `pending` → `cancelled`

---

## Ordem de Implementação Sugerida

1. **Migração do banco** — novas tabelas + índices
2. **Ajuste no webhook.controller.ts** — salvar `messages`, atualizar status
3. **Módulo conversations** — API + tela inbox (valida o armazenamento)
4. **Módulo templates** — API + telas CRUD (base para campanhas)
5. **Módulo campaigns** — API + wizard + worker
6. **Frontend SPA** — estrutura base + roteamento + páginas

---

## Não Está no Escopo (por ora)

- Multi-tenant (cada cliente gerencia suas próprias campanhas)
- Relatórios exportáveis (CSV de resultados)
- Webhooks de notificação quando campanha encerra
- Gestão de opt-out / blocklist
- Suporte a mídia em templates (header imagem/vídeo)
