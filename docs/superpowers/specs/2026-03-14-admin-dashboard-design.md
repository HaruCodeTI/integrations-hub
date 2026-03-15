# Design: Painel Admin Interno

**Data:** 2026-03-14
**Projeto:** integrations-hub / WhatsApp Omni Gateway
**Objetivo:** Eliminar o onboarding manual de clientes via API e a confusão no processo de configuração Meta.

---

## Contexto

O gateway já suporta múltiplos clientes (multi-tenant via SQLite), roteamento por `phone_number_id`, integração GHL e webhook genérico. O problema atual é operacional: adicionar um novo cliente exige chamadas manuais à API e o operador fica perdido sobre quais dados coletar no Meta. A solução é um painel admin interno que centraliza essas operações.

---

## Solução

Painel web em `/admin`, acessível só pelo operador (HaruCode), sem exposição para clientes finais. Resolve dois problemas:

1. **Setup manual via API** — substituído por formulário visual
2. **Confusão no processo Meta** — guia passo-a-passo embutido na tela de cadastro

---

## Autenticação

### Variável de Ambiente

```env
ADMIN_PASSWORD=senha_segura_aqui
```

Se `ADMIN_PASSWORD` não estiver definida na inicialização, qualquer request para `/admin/*` retorna `503 Service Unavailable` com body "Admin não configurado". Sem fallback inseguro.

### Cookie de Sessão

Formato do cookie `admin_session`:

```
base64url(timestamp_unix) + "." + hex(HMAC-SHA256(ADMIN_PASSWORD, base64url(timestamp_unix)))
```

- `timestamp_unix`: momento do login em segundos (Unix timestamp)
- **Expiração:** 8 horas — o servidor rejeita cookies com timestamp mais antigo que 8h
- **Flags obrigatórias:** `HttpOnly; Secure; SameSite=Lax; Path=/admin`
  - `HttpOnly`: impede acesso via JS
  - `Secure`: só transmitido via HTTPS (já obrigatório no ambiente de produção)
  - `SameSite=Lax`: mitiga CSRF em submissões cross-site
- **Verificação:** `crypto.timingSafeEqual` a cada request no bloco `/admin/*`
- Se `ADMIN_PASSWORD` mudar, cookies existentes tornam-se inválidos silenciosamente → redireciona para login

### Rotas de Autenticação

| Método | Rota | Comportamento |
|--------|------|---------------|
| `GET` | `/admin/login` | Renderiza formulário de senha |
| `POST` | `/admin/login` | Senha correta: seta cookie + `302` para `/admin`. Senha errada: re-renderiza login com mensagem "Senha incorreta" (sem redirect, sem 401) |
| `POST` | `/admin/logout` | Remove cookie (Set-Cookie com Max-Age=0) + `302` para `/admin/login` |

Todas as outras rotas `/admin/*` verificam a sessão primeiro. Sem sessão válida → `302` para `/admin/login`.

JavaScript é **obrigatório** no painel admin (usado para comportamento condicional do formulário e confirmação de desativação).

---

## Tela Principal (`GET /admin`)

### Dados

Carregados **server-side diretamente via `db.getAllClients()`** (função já existente em `src/services/db.service.ts:136`). Sem chamada HTTP intermediária.

### Lista de Clientes

Tabela renderizada no HTML com todos os clientes (ativos e inativos):

| Campo | Valores possíveis |
|-------|------------------|
| Nome | texto livre |
| Tipo | `GHL` / `Webhook` |
| Phone Number ID | texto |
| Status | `ativo` / `inativo` |
| Ações | botão Desativar (se ativo) / Reativar (se inativo) |

Sem paginação na v1.

**Ação Desativar:**
- Botão exibe `window.confirm("Desativar [Nome]?")` antes de submeter
- Submit via form `POST /admin/clients/:id/deactivate`
- Controller chama `db.deleteClient(id)` — **é um soft-delete** (seta `active = 0`, não apaga a linha). Retorna `boolean`.
- Se retornar `false` (id não encontrado) → re-renderiza dashboard com mensagem "Cliente não encontrado"
- Sucesso → `302` para `/admin`

**Ação Reativar:**
- Submit via form `POST /admin/clients/:id/reactivate` (sem confirmação)
- Controller chama `db.updateClient(id, { active: 1 })` — retorna `Client | null`
- Se retornar `null` (id não encontrado) → re-renderiza dashboard com mensagem "Cliente não encontrado"
- Sucesso → `302` para `/admin`

---

## Formulário de Novo Cliente (`POST /admin/clients`)

Botão **"+ Novo Cliente"** exibe formulário inline (toggle via JS).

### Campos e Mapeamento

| Campo | Tipo HTML | Condicional | Campo no `db.createClient()` |
|-------|-----------|-------------|------------------------------|
| Nome | `input[text]` | sempre | `name` |
| Tipo | `select` (`ghl` / `webhook`) | sempre | `client_type` |
| Phone Number ID | `input[text]` | sempre | `phone_number_id` |
| Meta Token | `input[text]` | sempre | `meta_token` |
| GHL Location ID | `input[text]` | visível se tipo=`ghl` | `ghl_location_id` |
| Webhook URL | `input[url]` | visível se tipo=`webhook` | `webhook_url` |

### Validação e Persistência Server-side

O controller valida antes de chamar o banco. Não há chamada HTTP loopback — o controller do admin chama `db.createClient()` diretamente.

**Regras de validação:**
- `name`, `phone_number_id`, `meta_token` são sempre obrigatórios
- Se `client_type = 'ghl'`: `ghl_location_id` é obrigatório; `webhook_url` deve ser passado como `""` (string vazia) para satisfazer `webhook_url TEXT NOT NULL` no banco — nunca `undefined`
- Se `client_type = 'webhook'`: `webhook_url` é obrigatório; `ghl_location_id` é passado como `null`
- Campos extras presentes no body do form são ignorados silenciosamente (ex: `ghl_location_id` enviado mesmo com tipo webhook)

**Erros mapeados:**

| Situação | Mensagem exibida inline |
|----------|------------------------|
| `phone_number_id` duplicado (UNIQUE constraint) | "Este Phone Number ID já está cadastrado" |
| Campo obrigatório ausente | "Campo [nome] é obrigatório" |
| Erro genérico do banco | "Erro ao cadastrar cliente — tente novamente" |

Em caso de erro, re-renderiza o formulário **com os valores já preenchidos** preservados (sem perder o que o usuário digitou).

Sucesso → `302` para `/admin` com query `?success=1` (exibe banner "Cliente cadastrado com sucesso").

---

## Guia Meta (lateral colapsável)

Conteúdo **estático fixo no HTML** da página (não carregado de banco). Renderizado no lado do formulário de novo cliente.

**Como obter o Phone Number ID:**
1. Acesse [developers.facebook.com](https://developers.facebook.com) → seu app
2. Menu lateral: WhatsApp → API Setup
3. Na seção "From", selecione o número — o Phone Number ID aparece abaixo

**Como gerar o Meta Token (System User):**
1. Acesse [business.facebook.com](https://business.facebook.com) → Configurações do Negócio
2. Usuários → Usuários do Sistema → criar ou selecionar um usuário admin
3. Clique em "Gerar novo token" → selecione seu app
4. Permissões: `whatsapp_business_management` e `whatsapp_business_messaging`
5. Copie o token — ele não é exibido novamente

---

## Implementação Técnica

### Novos Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/pages/admin-login.ts` | Exporta `adminLoginHTML(error?: string): string` — retorna HTML da tela de login, opcionalmente com mensagem de erro |
| `src/pages/admin-dashboard.ts` | Exporta `adminDashboardHTML(clients: Client[], message?: string): string` — retorna HTML completo com tabela e formulário |
| `src/controllers/admin.controller.ts` | Métodos estáticos: `showLogin`, `handleLogin`, `handleLogout`, `showDashboard`, `createClient`, `deactivateClient`, `reactivateClient` |

Mesmo padrão dos arquivos existentes `src/pages/privacy.ts` e `src/pages/terms.ts`.

### Modificações em Arquivos Existentes

| Arquivo | Mudança |
|---------|---------|
| `src/routes/router.ts` | Adiciona bloco `/admin/*` antes do bloco `/api/*` |
| `src/config/env.ts` | Adiciona `ADMIN_PASSWORD: string \| undefined` |
| `.env.example` | Adiciona `ADMIN_PASSWORD=` com comentário |

### Bloco de Roteamento (pseudocódigo)

```
if pathname starts with "/admin":
  if ADMIN_PASSWORD not defined → return 503

  // Rotas públicas (sem autenticação)
  if GET /admin/login → AdminController.showLogin()
  if POST /admin/login → AdminController.handleLogin(req)
  if POST /admin/logout → AdminController.handleLogout()

  // A partir daqui, verifica sessão
  if no valid session → redirect /admin/login

  if GET /admin → AdminController.showDashboard(url)
  if POST /admin/clients → AdminController.createClient(req)
  if POST /admin/clients/:id/deactivate → AdminController.deactivateClient(id)
  if POST /admin/clients/:id/reactivate → AdminController.reactivateClient(id)
```

---

## Fora do Escopo (v1)

- Dashboard de métricas / volume de mensagens
- Notificações em tempo real
- Multi-usuário admin
- Rate limiting no login
- 2FA
- Edição completa de dados do cliente (apenas desativar/reativar)

---

## Critérios de Sucesso

1. Cadastrar cliente GHL sem curl/Postman
2. Cadastrar cliente Webhook sem curl/Postman
3. Visualizar todos os clientes com status correto
4. Desativar cliente com `window.confirm` antes
5. Reativar cliente inativo
6. Retorna 503 se `ADMIN_PASSWORD` não definida
7. Cookie expira em 8 horas; tem flags `HttpOnly`, `Secure`, `SameSite=Lax`
8. Guia Meta visível e completo na tela de cadastro
9. Erros de cadastro exibidos inline sem perder dados do formulário
10. Sucesso no cadastro exibe banner de confirmação
