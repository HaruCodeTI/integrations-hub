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

- Acesso protegido por senha via cookie de sessão
- Nova env var: `ADMIN_PASSWORD`
- Cookie `admin_session` assinado com HMAC-SHA256 usando `ADMIN_PASSWORD` como secret
- Sem banco de dados, sem JWT, sem dependência externa
- Fluxo:
  - `GET /admin` → redireciona para `/admin/login` se sem sessão válida
  - `GET /admin/login` → formulário de senha
  - `POST /admin/login` → valida senha, seta cookie, redireciona para `/admin`
  - `POST /admin/logout` → limpa cookie, redireciona para `/admin/login`

---

## Tela Principal (`/admin`)

### Lista de Clientes

Tabela com todos os clientes cadastrados (ativos e inativos):

| Campo | Descrição |
|-------|-----------|
| Nome | Nome do cliente |
| Tipo | `GHL` ou `Webhook` |
| Phone Number ID | ID do número no Meta |
| Status | Ativo / Inativo |
| Ações | Editar / Desativar |

### Formulário de Novo Cliente

Botão **"+ Novo Cliente"** exibe formulário inline com campos:

| Campo | Tipo | Condicional |
|-------|------|-------------|
| Nome | texto | sempre |
| Tipo | select (GHL / Webhook) | sempre |
| Phone Number ID | texto | sempre |
| Meta Token | texto | sempre |
| GHL Location ID | texto | só se tipo = GHL |
| Webhook URL | texto | só se tipo = Webhook |

Ao submeter, chama `POST /api/clients` internamente com `GATEWAY_API_KEY`.

### Guia Meta (lateral colapsável)

Painel de ajuda embutido explicando onde encontrar cada dado no Meta:

- **Phone Number ID**: Meta Developers → seu app → WhatsApp → API Setup → lista de números
- **Meta Token**: Business Manager → Configurações → Usuários do Sistema → gerar token com permissões `whatsapp_business_management` e `whatsapp_business_messaging`

---

## Implementação Técnica

### Arquitetura

Sem dependências novas. Tudo gerado server-side como HTML string, igual às páginas `/privacy` e `/terms` existentes.

### Novos Arquivos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/pages/admin-login.ts` | HTML da tela de login |
| `src/pages/admin-dashboard.ts` | HTML da tela principal com tabela e formulário |
| `src/controllers/admin.controller.ts` | Lógica de autenticação, listagem e ações CRUD |

### Modificações em Arquivos Existentes

| Arquivo | Mudança |
|---------|---------|
| `src/routes/router.ts` | Adiciona bloco `/admin/*` com as 4 novas rotas |
| `src/config/env.ts` | Adiciona `ADMIN_PASSWORD` |
| `.env.example` | Documenta `ADMIN_PASSWORD` |

### Segurança do Cookie

```
admin_session = HMAC-SHA256(ADMIN_PASSWORD, timestamp:random_nonce)
```

Verificação a cada request no bloco `/admin/*`: recalcula o HMAC e compara com `timingSafeEqual` — mesmo padrão do middleware Meta existente.

### Variáveis de Ambiente

```env
ADMIN_PASSWORD=senha_segura_aqui
```

---

## Fora do Escopo

- Dashboard de monitoramento / métricas de mensagens
- Notificações em tempo real
- Multi-usuário admin
- Tela de edição de cliente (somente desativar na v1)

---

## Critérios de Sucesso

1. Operador consegue cadastrar novo cliente GHL sem usar curl/Postman
2. Operador consegue cadastrar novo cliente Webhook sem usar curl/Postman
3. Operador consegue visualizar todos os clientes e seus status
4. Operador consegue desativar um cliente
5. Painel inacessível sem senha correta
6. Guia Meta visível na tela de cadastro
