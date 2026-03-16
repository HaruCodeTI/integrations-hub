# Embedded Signup — Design Spec

## Overview

Implementar o fluxo Meta Embedded Signup no gateway, permitindo que a agência onboard novos clientes de forma totalmente automática. O admin gera um link único, envia ao cliente, o cliente autoriza o acesso ao WABA, seleciona os números desejados e o gateway os cadastra automaticamente com token long-lived renovado por job diário.

---

## Arquitetura Geral

Três grupos de responsabilidade:

### 1. Geração de Link (Admin)
- Admin clica em "Gerar link de onboarding" no `/admin`
- Backend cria um UUID v4 com TTL de 7 dias na tabela `signup_tokens`
- URL exibida no painel: `https://gateway.harucode.com.br/signup/<uuid>`
- Admin copia e envia ao cliente por qualquer canal

### 2. Fluxo do Cliente (`/signup/:token`)
- Valida token (existe + não expirou + não foi usado)
- Renderiza página com botão Meta Embedded Signup via SDK JS
- Após autorização: JS recebe `code` e `waba_id` → POST para `/signup/:token/exchange`
- Backend troca `code` por long-lived user token, armazena token temporariamente em `signup_tokens.pending_meta_token`, lista números do WABA
- Front exibe números → cliente seleciona → POST para `/signup/:token/confirm`
- Backend recupera `pending_meta_token`, cria clientes em transação, marca token como usado

### 3. Renovação Automática de Token (Background Job)
- Cron diário às 03:00
- Verifica clientes com `meta_token_expires_at` vencendo em menos de 7 dias
- Renova cada token via Meta API (`fb_exchange_token`), usa `expires_in` da resposta para calcular novo `meta_token_expires_at`
- Atualiza token no DB; em caso de falha, seta flag `token_expired = 1`

**Nota sobre tokens permanentes:** System User Token (que não expira) exige etapa manual no Business Manager do cliente — quebraria o fluxo automático. Long-lived token + renovação automática é a solução equivalente sem fricção.

---

## Banco de Dados

### Nova tabela: `signup_tokens`
```sql
CREATE TABLE signup_tokens (
  id                TEXT PRIMARY KEY,          -- UUID v4
  created_at        TEXT DEFAULT (datetime('now')),
  expires_at        TEXT NOT NULL,             -- datetime string, 7 dias após created_at
  used_at           TEXT,                      -- NULL = não usado
  pending_meta_token TEXT                      -- token temporário após /exchange, antes de /confirm
);
```

Timestamps como `TEXT` com `datetime()` — consistente com o padrão do restante do codebase.

Comparações SQLite: `expires_at > datetime('now')`, `used_at IS NULL`.

### Mudanças na tabela `clients` existente
Adicionar colunas via `ALTER TABLE` (mesmo padrão `try/catch` já usado no codebase):
```sql
ALTER TABLE clients ADD COLUMN meta_token_expires_at TEXT;
ALTER TABLE clients ADD COLUMN token_expired INTEGER DEFAULT 0;
```

Atualizar o tipo `Client` em `db.service.ts` para incluir:
```ts
meta_token_expires_at: string | null;
token_expired: 0 | 1;
```

---

## Componentes e Arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/pages/signup.ts` | HTML da página `/signup/:token` (botão Meta + seleção de números) |
| `src/pages/signup-success.ts` | HTML da confirmação final ("Tudo certo!") |
| `src/controllers/signup.controller.ts` | Handlers: `showSignup`, `exchangeCode`, `confirmNumbers` |
| `src/services/meta-oauth.service.ts` | Troca `code`→token, lista números do WABA, renova token |
| `src/jobs/token-refresh.job.ts` | Cron diário: renova tokens que vencem em <7 dias |

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/services/db.service.ts` | `addSignupToken`, `getSignupToken`, `markTokenUsed`, `setPendingToken`, `getExpiringTokens`, `updateClientToken`, `setTokenExpired`; migração das novas colunas; tipo `Client` atualizado |
| `src/routes/router.ts` | Rotas `/signup/*` |
| `src/pages/admin-dashboard.ts` | Botão "Gerar link"; URL gerada; alerta visual para clientes com `token_expired = 1` |
| `src/controllers/admin.controller.ts` | Handler `generateSignupLink` |

### Nova variável de ambiente
```
META_APP_ID=    # necessário para o SDK JS da Meta (público, sem secret)
```
(`META_APP_SECRET` já existe para trocar o code no servidor)

---

## Fluxo de Dados

### 1. Admin gera o link
```
POST /admin/signup-links
→ cria UUID, insere em signup_tokens com expires_at = datetime('now', '+7 days')
→ retorna /admin com URL exibida para copiar
HTTP 302 redirect → GET /admin
```

### 2. Cliente abre o link
```
GET /signup/:token
→ valida token: EXISTS + expires_at > datetime('now') + used_at IS NULL
→ inválido → HTTP 200 página de erro "Link expirado ou já utilizado"
→ válido   → HTTP 200 renderiza página com SDK JS + botão "Conectar WhatsApp"
```

### 3. Embedded Signup — extração de `code` e `waba_id` no front
O SDK JS da Meta dispara eventos via `window.addEventListener('message', handler)`.
O handler deve verificar:
```js
if (event.origin !== 'https://www.facebook.com') return;
const data = JSON.parse(event.data);
if (data.type === 'WA_EMBEDDED_SIGNUP') {
  if (data.event === 'FINISH') {
    const { code, waba_id } = data.data; // campos disponíveis no evento FINISH
    // POST para /signup/:token/exchange
  }
  if (data.event === 'CANCEL' || data.event === 'ERROR') {
    // exibir mensagem inline de cancelamento/erro
  }
}
```

### 4. Troca do code (server-side)
```
POST /signup/:token/exchange  { code, waba_id }
→ valida token (mesmo critério do GET, proteção contra replay)
→ POST /oauth/access_token { client_id, client_secret, code }   → short-lived token
→ GET /oauth/access_token?grant_type=fb_exchange_token&...      → long-lived token
   usa expires_in da resposta para calcular meta_token_expires_at
→ GET /{waba_id}/phone_numbers?access_token=...                 → lista de números
→ db.setPendingToken(token_id, long_lived_token)                → armazena server-side
→ HTTP 200 { numbers: [{ id, display_phone_number, verified_name }] }
→ HTTP 400 se code inválido/expirado: { error: "Autorização expirada. Recarregue e tente novamente." }
→ HTTP 400 se WABA sem números: { error: "Nenhum número encontrado nesta conta WhatsApp Business." }
```

**Proteção contra replay em /exchange:** Se `pending_meta_token` já estiver preenchido no token, sobrescreve com o novo token (idempotente — cliente pode re-autorizar caso a seleção falhe).

### 5. Cliente confirma os números
```
POST /signup/:token/confirm  { phone_number_ids: ["id1", "id2"] }
→ valida token (EXISTS + não expirado + não usado)
→ recupera pending_meta_token — se NULL: HTTP 400 { error: "Sessão inválida. Recomece o processo." }
→ valida que phone_number_ids não está vazio
→ TRANSAÇÃO SQLite:
    para cada id:
      db.createClient({
        name: verified_name,
        phone_number_id: id,
        meta_token: pending_meta_token,
        meta_token_expires_at: calculado em /exchange,
        client_type: "webhook",   -- padrão; admin pode alterar depois
        webhook_url: "",
        ghl_location_id: null,
        active: 1,
        token_expired: 0
      })
      -- erro UNIQUE: registra em skipped[], continua
      -- outro erro: rollback, HTTP 500
    db.markTokenUsed(token_id)
  FIM TRANSAÇÃO
→ HTTP 200 { success: true, created: N, skipped: M }
→ JS redireciona para /signup/success
```

**Nota:** Todos os clientes criados via Embedded Signup usam `client_type: "webhook"` por padrão. O admin pode alterar o tipo e preencher `ghl_location_id` no painel caso o cliente precise de integração GHL.

### 6. Página de sucesso
```
GET /signup/success
→ HTTP 200 página de confirmação "Tudo certo! Sua conta WhatsApp foi conectada."
```

### 7. Job de renovação diário (03:00)
```
→ db.getExpiringTokens(threshold: '7 days')
   SELECT * FROM clients WHERE meta_token_expires_at < datetime('now', '+7 days')
   AND token_expired = 0 AND meta_token IS NOT NULL AND meta_token != ''
→ para cada cliente:
    GET /oauth/access_token?grant_type=fb_exchange_token&fb_exchange_token=<meta_token>
    → sucesso: db.updateClientToken(id, novo_token, datetime('now', '+' || expires_in || ' seconds'))
    → falha:   db.setTokenExpired(id, 1); loga erro; continua próximo
```

---

## Error Handling

| Situação | Resposta |
|---|---|
| Link inválido/expirado/já usado | HTTP 200 — página de erro: "Este link não é válido ou já foi utilizado. Solicite um novo link à agência." |
| Signup cancelado pelo cliente (evento CANCEL/ERROR) | Mensagem inline na mesma página; sem reload; token permanece válido |
| Falha na troca do `code` (expirado, rede) | HTTP 400 JSON — front exibe "Autorização expirada. Recarregue e tente novamente." Token de signup permanece válido para nova tentativa |
| WABA sem números | HTTP 400 JSON — front exibe "Nenhum número encontrado nesta conta WhatsApp Business." |
| `confirmNumbers` sem `pending_meta_token` | HTTP 400 JSON — "Sessão inválida. Recomece o processo." |
| `phone_number_id` duplicado | Pula o duplicado, cria os demais; retorna `{ skipped: M }` |
| Erro inesperado em `confirmNumbers` | Rollback da transação; HTTP 500 JSON — "Erro ao cadastrar. Tente novamente." |
| Falha no job de renovação em um cliente | Loga erro, seta `token_expired = 1`, continua demais; dashboard admin exibe alerta por cliente |
| Dashboard: clientes com `token_expired = 1` | Nova coluna "Token" na tabela de clientes; badge vermelho "Expirado" com botão para regenerar manualmente (fora do escopo desta versão — placeholder visual apenas) |

---

## Testes

### `meta-oauth.service.ts`
- Troca `code` → short-lived token (mock Meta API)
- Exchange short-lived → long-lived token; usa `expires_in` da resposta
- Listagem de números retorna formato `{ id, display_phone_number, verified_name }`
- Renovação de token bem-sucedida retorna novo token e `expires_in`
- Renovação com token já expirado → lança erro tipado

### `signup.controller.ts`
- Token válido → `showSignup` renderiza página (200)
- Token expirado → página de erro (200)
- Token já usado → página de erro (200)
- Token inexistente → página de erro (200)
- `exchangeCode` com code válido → armazena `pending_meta_token`, retorna lista de números (200)
- `exchangeCode` chamado duas vezes no mesmo token → sobrescreve `pending_meta_token` (idempotente)
- `exchangeCode` com code inválido → HTTP 400
- `confirmNumbers` com `pending_meta_token` presente → cria clientes, marca token usado (200)
- `confirmNumbers` sem `pending_meta_token` (sem /exchange antes) → HTTP 400
- `confirmNumbers` com duplicata → sucesso parcial, `skipped > 0`
- `confirmNumbers` com erro inesperado → rollback, HTTP 500; token não marcado como usado

### `db.service.ts`
- `addSignupToken` + `getSignupToken` roundtrip
- `getSignupToken` retorna `null` para token inexistente
- `getExpiringTokens` retorna apenas clientes dentro do threshold; ignora `token_expired = 1`
- `markTokenUsed` seta `used_at`; token passa a ser considerado inválido
- `setPendingToken` + `getSignupToken` reflete o token armazenado
- Novas colunas `meta_token_expires_at` e `token_expired` presentes após migração
- Tipo `Client` inclui os novos campos

### `token-refresh.job.ts`
- Renova tokens dentro do threshold (expires_in usado para calcular novo expires_at)
- Ignora tokens fora do threshold
- Ignora clientes com `token_expired = 1` (já falhou antes)
- Não para ao encontrar erro em um token; processa os demais
- Seta `token_expired = 1` e loga quando renovação falha

### `admin.controller.ts`
- `generateSignupLink` cria registro em `signup_tokens` com `expires_at` correto
- URL retornada contém o ID do token
- Dashboard exibe badge "Expirado" para clientes com `token_expired = 1`

### `router.ts`
- `GET /signup/success` retorna 200
- Rotas `/signup/*` acessíveis sem autenticação
- Rotas `/admin/*` continuam exigindo autenticação
