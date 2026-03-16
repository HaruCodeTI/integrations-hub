# WhatsApp Omni Gateway

Gateway centralizado de alta performance para receber, validar e rotear webhooks da API Cloud do WhatsApp (Meta) para serviços de destino como bots, n8n e CRMs.

## Visão Geral

O **wa-omni-gateway** é um middleware construído com Bun que atua como "para-choque" entre a Meta e seus serviços de processamento. Ele resolve um problema crítico: a Meta exige respostas HTTP `200 OK` imediatas nos webhooks. Se o processamento de IA ou lógica de negócio demorar e o webhook der timeout, a Meta bloqueia o número. Este gateway responde instantaneamente e repassa o payload de forma assíncrona.

```
Cliente (WhatsApp) → Meta Cloud API → Bun Gateway (VPS) → n8n / Bot / CRM
                                            ↓
                                      200 OK (imediato)
```

## Tech Stack

- **Runtime:** [Bun](https://bun.sh) — alta performance de I/O, nativo em TypeScript
- **Hospedagem:** DigitalOcean Droplet (Ubuntu 24.04 LTS)
- **Proxy Reverso/SSL:** Nginx + Certbot (Let's Encrypt)
- **Automação:** n8n (orquestração de fluxos e respostas)
- **Futuro:** Redis (mapeamento de Phone_ID → Bot_URL para multi-tenant)

## Estrutura do Projeto

```
integrations-hub/
├── src/
│   ├── server.ts                       # Entrada principal — Bun.serve() + cron job
│   ├── config/
│   │   └── env.ts                      # Variáveis de ambiente tipadas
│   ├── controllers/
│   │   ├── admin.controller.ts         # Painel admin (login, clientes, signup links)
│   │   ├── signup.controller.ts        # Embedded Signup (showSignup, exchangeCode, confirmNumbers)
│   │   └── webhook.controller.ts       # Recepção e roteamento de webhooks Meta
│   ├── jobs/
│   │   └── token-refresh.job.ts        # Cron diário 03:00 — renova meta_tokens
│   ├── middlewares/
│   │   └── metaSecurity.ts             # Validação HMAC SHA-256 da assinatura Meta
│   ├── pages/
│   │   ├── admin-dashboard.ts          # HTML do painel admin
│   │   ├── admin-login.ts              # HTML da tela de login
│   │   ├── signup.ts                   # HTML da página de Embedded Signup
│   │   ├── signup-success.ts           # HTML da confirmação de signup
│   │   ├── privacy.ts                  # Política de Privacidade (LGPD)
│   │   └── terms.ts                    # Termos de Uso
│   ├── services/
│   │   ├── db.service.ts               # SQLite — clientes, signup_tokens, métodos de acesso
│   │   └── meta-oauth.service.ts       # Troca de code, listagem de números, renovação de token
│   └── routes/
│       └── router.ts                   # Roteamento de todas as requisições
├── docs/
│   ├── PRD.md                          # Product Requirements Document
│   ├── fluxo.png                       # Diagrama visual do fluxo
│   └── superpowers/
│       ├── specs/                      # Design specs das features
│       └── plans/                      # Planos de implementação
├── .env.example                        # Template de variáveis de ambiente
├── package.json
├── tsconfig.json
├── SETUP.md                            # Guia completo de deploy no DigitalOcean
├── TESTING.md                          # Guia de testes manuais e automatizados
├── TROUBLESHOOTING.md                  # Problemas comuns e soluções
└── next-step.md                        # Situação atual e próximos passos
```

## Rotas Disponíveis

### Públicas

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/health` | Health check — retorna status e uptime |
| `GET` | `/webhook` | Verificação de webhook (challenge da Meta) |
| `POST` | `/webhook` | Recepção de webhooks da Meta |
| `GET` | `/privacy` | Política de Privacidade (LGPD) |
| `GET` | `/terms` | Termos de Uso |
| `GET` | `/signup/:token` | Página de onboarding do cliente (Embedded Signup) |
| `POST` | `/signup/:token/exchange` | Troca o code Meta por long-lived token |
| `POST` | `/signup/:token/confirm` | Confirma números e cria clientes |
| `GET` | `/signup/success` | Página de confirmação pós-onboarding |

### Admin (requer autenticação)

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/admin` | Dashboard de clientes |
| `GET` | `/admin/login` | Tela de login |
| `POST` | `/admin/login` | Autenticação |
| `POST` | `/admin/logout` | Logout |
| `POST` | `/admin/clients` | Criar cliente manualmente |
| `POST` | `/admin/clients/:id/deactivate` | Desativar cliente |
| `POST` | `/admin/clients/:id/reactivate` | Reativar cliente |
| `POST` | `/admin/signup-links` | Gerar link de onboarding |

## Início Rápido

### Pré-requisitos

- [Bun](https://bun.sh) v1.3+
- Domínio com HTTPS (obrigatório pela Meta)
- App configurado no [Meta for Developers](https://developers.facebook.com)

### Instalação

```bash
git clone <repo-url>
cd integrations-hub
bun install
```

### Configuração

Copie o arquivo de exemplo e preencha com seus valores:

```bash
cp .env.example .env
```

```env
PORT=3000
ADMIN_PASSWORD=sua_senha_admin
GATEWAY_PUBLIC_URL=https://gateway.harucode.com.br

# Meta / WhatsApp
META_VERIFY_TOKEN=seu_token_de_verificacao
META_APP_SECRET=seu_app_secret_do_meta
META_APP_ID=seu_app_id_publico

# Destino dos webhooks (webhook type clients)
WEBHOOK_URL_N8N=https://seu-n8n.com/webhook/seu-webhook-id

# GoHighLevel (opcional — apenas para clientes tipo GHL)
GHL_CLIENT_ID=
GHL_CLIENT_SECRET=
GHL_CONVERSATION_PROVIDER_ID=
```

Onde encontrar cada valor:

- **META_APP_ID / META_APP_SECRET:** Meta Developers → Seu App → Configurações → Básico
- **META_VERIFY_TOKEN:** Token que você define livremente. Configure o mesmo no painel da Meta em WhatsApp → Configuração → Webhook.
- **GATEWAY_PUBLIC_URL:** URL pública do gateway (sem barra no final).

### Executar

```bash
# Desenvolvimento (com hot reload)
bun --hot src/server.ts

# Produção
bun src/server.ts
```

## Fluxo de Dados

```mermaid
sequenceDiagram
    participant User as Cliente (WhatsApp)
    participant Meta as Meta Cloud API
    participant GW as Bun Gateway
    participant N8N as n8n (Worker)

    User->>Meta: Envia mensagem
    Meta->>GW: POST /webhook (payload + assinatura HMAC)
    GW->>GW: Valida assinatura SHA-256
    GW->>Meta: 200 OK (imediato)
    GW->>N8N: POST assíncrono (payload completo)
    N8N->>Meta: POST /{phone_id}/messages (resposta)
    Meta->>User: Entrega resposta
```

### Detalhamento do Processamento

1. **Meta envia webhook** com header `x-hub-signature-256` contendo HMAC do payload.
2. **Gateway valida a assinatura** usando `META_APP_SECRET` via `crypto.timingSafeEqual` (proteção contra timing attacks).
3. **Responde `200 OK` imediatamente** à Meta para evitar bloqueio do número.
4. **Extrai dados da mensagem:** remetente (`from`), conteúdo (`text.body`), e `phone_number_id`.
5. **Repassa para n8n** via POST assíncrono com o payload completo.
6. **n8n processa** e responde via API da Meta usando o `phone_number_id` e `from` dinâmicos.

## Segurança

O middleware `metaSecurity.ts` implementa validação HMAC SHA-256 conforme especificação da Meta:

- Rejeita requisições sem header `x-hub-signature-256`
- Calcula HMAC do body bruto usando o App Secret
- Usa `crypto.timingSafeEqual` para comparação segura (imune a timing attacks)
- Retorna `401 Unauthorized` para assinaturas inválidas

## Deploy em Produção

Consulte o [SETUP.md](./SETUP.md) para o guia completo de deploy no DigitalOcean, incluindo configuração de Nginx, SSL, systemd e Meta Developers.

## Testes

```bash
bun test   # 47 testes automatizados
```

Consulte o [TESTING.md](./TESTING.md) para o guia completo de testes manuais, incluindo o fluxo de Embedded Signup end-to-end e como testar o job de renovação de tokens.

## Troubleshooting

Consulte o [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) para soluções dos problemas mais comuns, incluindo erros de webhook, problemas com a Meta API e debugging de fluxos no n8n.

## Fluxo n8n (Referência)

O fluxo básico no n8n para responder mensagens:

- **Webhook node:** recebe POST do gateway
- **HTTP Request node:**
  - URL: `https://graph.facebook.com/v25.0/{{ $json.body.entry[0].changes[0].value.metadata.phone_number_id }}/messages`
  - Header: `Authorization: Bearer SEU_TOKEN_PERMANENTE`
  - Body (JSON com expressão):
    ```json
    {
      "messaging_product": "whatsapp",
      "recipient_type": "individual",
      "to": "{{ $json.body.entry[0].changes[0].value.messages[0].from }}",
      "type": "text",
      "text": { "body": "Sua resposta aqui" }
    }
    ```

**Importante:** No n8n, o payload do gateway fica dentro de `$json.body` (não direto em `$json`), pois o Webhook node separa `headers`, `params`, `query` e `body`.

## Roadmap

- [x] Gateway core com validação HMAC
- [x] Multi-tenant — múltiplos clientes por phone_number_id
- [x] Painel admin completo
- [x] Integração GHL — Conversation Provider bidirecional
- [x] Suporte a mídias (imagens, áudios, documentos, stickers)
- [x] Meta Embedded Signup — onboarding automático de clientes
- [x] Renovação automática de tokens (cron job diário)
- [ ] Regeneração manual de token expirado pelo admin
- [ ] Delivery reports e status updates
- [ ] Fila de mensagens para resiliência (retry com backoff)
- [ ] Alertas de token expirado (email/webhook)
- [ ] Dashboard de monitoramento e métricas
- [ ] Mensagens interativas (botões, listas, templates)

## Licença

Projeto privado — HaruCode Tecnologia.
