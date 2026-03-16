# Próximos Passos — Integrations Hub

## Situação atual (2026-03-16)

### ✅ Concluído

- **Gateway core** — recepção e roteamento de webhooks Meta com validação HMAC
- **Multi-tenant** — múltiplos clientes por `phone_number_id`, painel admin completo
- **Integração GHL** — Conversation Provider, OAuth, roteamento bidirecional GHL ↔ WhatsApp
- **Suporte a mídias** — imagens, áudios, documentos, stickers via WhatsApp Cloud API
- **Meta Embedded Signup** — onboarding automático de clientes via Facebook JS SDK
  - Admin gera link único → cliente autoriza WABA → números criados automaticamente
  - Long-lived token (~60 dias) com renovação automática por cron job diário (03:00)
  - 47 testes automatizados cobrindo todos os fluxos

---

## Próximos Passos Sugeridos

### 🔴 Alta prioridade

**1. Regeneração manual de token expirado no admin**
- Atualmente: badge vermelho "Expirado" aparece no dashboard mas sem ação
- O que fazer: botão "Regenerar" que redireciona o cliente para um novo fluxo de signup
- Arquivo a modificar: `src/pages/admin-dashboard.ts`, `src/controllers/admin.controller.ts`

**2. Ativar no deploy (variáveis de ambiente)**
- Adicionar ao `.env` do servidor:
  ```
  META_APP_ID=<app id público do seu app Meta>
  META_APP_SECRET=<já deve estar configurado>
  GATEWAY_PUBLIC_URL=https://gateway.harucode.com.br
  ```
- Criar o app no Meta for Developers com suporte a Embedded Signup habilitado
- Configurar domínios permitidos no app Meta para `gateway.harucode.com.br`

**3. Configurar GHL no deploy**
- Criar app no GHL Marketplace e obter `GHL_CLIENT_ID` e `GHL_CLIENT_SECRET`
- Registrar o Conversation Provider e obter `GHL_CONVERSATION_PROVIDER_ID`
- Configurar webhook URL no GHL: `https://gateway.harucode.com.br/ghl/webhook/outbound`
- Adicionar variáveis no `.env` do servidor
- Autorizar uma sub-account via `https://gateway.harucode.com.br/ghl/install`

---

### 🟡 Média prioridade

**4. Delivery reports e status updates**
- Capturar eventos de entrega/leitura da Meta (status: `sent`, `delivered`, `read`, `failed`)
- Repassar para o webhook do cliente ou armazenar para dashboard

**5. Fila de mensagens para resiliência**
- Se o webhook do cliente estiver indisponível, a mensagem é perdida
- Implementar retry com backoff exponencial (pode usar SQLite como fila simples)

**6. Alertas de token expirado**
- Notificar o admin por e-mail ou webhook quando `token_expired = 1`
- Evita clientes silenciosamente offline

---

### 🟢 Baixa prioridade / Backlog

**7. Dashboard de monitoramento**
- Volume de mensagens por cliente
- Status de saúde dos tokens
- Logs de erros recentes

**8. Rate limiting nas rotas públicas `/signup/*`**
- Proteção básica contra flood de requisições para a Meta API

**9. Suporte a mensagens interativas**
- Botões, listas, templates — atualmente só texto e mídias simples

---

## Referências

- Teste manual completo: [TESTING.md](./TESTING.md)
- Spec do Embedded Signup: [docs/superpowers/specs/2026-03-16-embedded-signup-design.md](./docs/superpowers/specs/2026-03-16-embedded-signup-design.md)
- Setup de deploy: [SETUP.md](./SETUP.md)
