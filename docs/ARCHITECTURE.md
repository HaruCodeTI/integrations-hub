  # Arquitetura Multi-Tenant — wa-omni-gateway v2

## Visão Geral

O gateway evolui de um repasse fixo (hardcoded para n8n) para um **roteador inteligente multi-tenant** que identifica o dono de cada `phone_number_id` e encaminha a mensagem para o destino correto.

## Fluxo Completo

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│   Cliente    │────▶│  Meta Cloud API  │────▶│   Bun Gateway (VPS) │
│  (WhatsApp)  │     │                  │     │   POST /webhook     │
└─────────────┘     └──────────────────┘     └─────────┬───────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  1. Valida HMAC  │
                                              │  2. Extrai       │
                                              │  phone_number_id │
                                              └────────┬────────┘
                                                       │
                                              ┌────────▼────────┐
                                              │  3. Consulta     │
                                              │  SQLite/Cache    │
                                              │  "Quem é o dono  │
                                              │  deste phone_id?"│
                                              └────────┬────────┘
                                                       │
                                         ┌─────────────┼─────────────┐
                                         │             │             │
                                   ┌─────▼─────┐ ┌────▼────┐ ┌─────▼─────┐
                                   │  Bot n8n   │ │   GHL   │ │  Bot X    │
                                   │ Cliente A  │ │Cliente B│ │ Cliente C │
                                   └─────┬─────┘ └────┬────┘ └─────┬─────┘
                                         │            │             │
                                         │    IA processa texto,    │
                                         │    gera a resposta       │
                                         │            │             │
                                         └─────────┬──┘─────────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  POST /api/send  │
                                          │  { phone_id,     │
                                          │    to, message }  │
                                          └────────┬────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  Gateway busca   │
                                          │  meta_token do   │
                                          │  cliente no DB   │
                                          └────────┬────────┘
                                                   │
                                          ┌────────▼────────┐
                                          │  POST Meta API   │
                                          │  /v25.0/{id}/    │
                                          │  messages         │
                                          └────────┬────────┘
                                                   │
                    ┌──────────────────┐   ┌───────▼────────┐
                    │   Cliente        │◀──│  Meta Cloud API │
                    │   (WhatsApp)     │   │  Entrega msg   │
                    └──────────────────┘   └────────────────┘
```

## Estrutura de Arquivos (v2)

```
src/
├── config/
│   └── env.ts                 # Variáveis de ambiente (atualizado)
├── controllers/
│   ├── webhook.controller.ts  # Webhook com roteamento dinâmico
│   └── api.controller.ts      # CRUD de clientes + envio de mensagens
├── middlewares/
│   ├── metaSecurity.ts        # Validação HMAC (sem alteração)
│   └── apiAuth.ts             # Autenticação por API Key
├── services/
│   ├── db.service.ts          # SQLite — persistência de clientes
│   ├── router.service.ts      # Cache em memória + resolução de rotas
│   └── sender.service.ts      # Envio centralizado via Meta API
├── pages/
│   ├── privacy.ts             # Política de Privacidade
│   └── terms.ts               # Termos de Uso
├── routes/
│   └── router.ts              # Roteador HTTP (atualizado)
└── server.ts                  # Entry point
```

## Banco de Dados (SQLite)

```sql
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone_number_id TEXT UNIQUE NOT NULL,
  webhook_url TEXT NOT NULL,
  auth_token TEXT,
  meta_token TEXT NOT NULL,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

| Campo            | Descrição                                       |
|------------------|--------------------------------------------------|
| id               | UUID do cliente                                  |
| name             | Nome do cliente (ex: "HaruCode Bot")            |
| phone_number_id  | ID do número no Meta (ex: "968853216316915")    |
| webhook_url      | URL destino (n8n, GHL, bot custom)              |
| auth_token       | Token de autenticação para o destino (opcional) |
| meta_token       | Token da Meta para envio de mensagens           |
| active           | 1 = ativo, 0 = inativo                          |

## Rotas da API

### Existentes (sem alteração funcional)
| Método | Rota        | Descrição                     |
|--------|-------------|-------------------------------|
| GET    | /health     | Health check                  |
| GET    | /webhook    | Verificação Meta (challenge)  |
| POST   | /webhook    | Recepção de webhooks          |
| GET    | /privacy    | Política de Privacidade       |
| GET    | /terms      | Termos de Uso                 |

### Novas (API de gerenciamento)
| Método | Rota               | Descrição                      |
|--------|--------------------|---------------------------------|
| GET    | /api/clients       | Listar clientes                |
| POST   | /api/clients       | Cadastrar novo cliente         |
| PUT    | /api/clients/:id   | Atualizar cliente              |
| DELETE | /api/clients/:id   | Desativar cliente              |
| POST   | /api/send          | Enviar mensagem via Meta API   |

### Autenticação da API
Todas as rotas `/api/*` exigem o header:
```
Authorization: Bearer <GATEWAY_API_KEY>
```

## Variáveis de Ambiente (v2)

```env
# Servidor
PORT=3000

# Meta — Webhook
META_VERIFY_TOKEN=meu_token_secreto_123
META_APP_SECRET=chave_secreta_do_app

# Gateway API
GATEWAY_API_KEY=chave_para_acessar_api_de_gerenciamento

# Legado (será removido quando todos os clientes estiverem no DB)
WEBHOOK_URL_N8N=https://n8n.harucode.com.br/webhook/xxx
```

## Compatibilidade com Deploy Atual

- **Mesmo droplet**: SQLite roda embutido no Bun, zero configuração extra
- **Mesmo systemd**: `sudo systemctl restart wa-gateway` continua funcionando
- **Mesmo GitHub Actions**: O deploy.yml não precisa de alteração
- **Migração suave**: O cliente atual (n8n) será cadastrado no banco automaticamente no primeiro boot
- **Sem Redis**: SQLite + cache Map em memória é suficiente para centenas de clientes

## Evolução Futura

1. **Redis**: Substituir o cache Map por `Bun.redis` quando escalar para múltiplos processos
2. **GHL/LeadConnector**: Cadastrar como cliente com webhook_url do GHL
3. **Dashboard**: Frontend para gerenciar clientes visualmente
4. **Rate Limiting**: Controle de taxa por cliente
5. **Logs**: Histórico de mensagens por cliente no SQLite
