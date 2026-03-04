# Troubleshooting — Problemas Comuns e Soluções

Guia de diagnóstico baseado em problemas reais enfrentados durante a configuração e operação do WhatsApp Omni Gateway.

---

## 1. Mensagens não chegam no celular (erro 131031)

**Sintoma:** Você envia mensagem via API ou painel de teste, a Meta aceita a requisição (retorna um `wamid`), mas a mensagem nunca chega no celular. O webhook de status mostra:

```json
{
  "status": "failed",
  "errors": [{
    "code": 131031,
    "title": "Business Account locked",
    "message": "Business Account locked"
  }]
}
```

**Causa:** A conta WhatsApp Business (WABA) está bloqueada pela Meta, possivelmente por violação de política, problema de verificação, ou PIN de autenticação em duas etapas incorreto.

**Solução:**

1. Acesse o [Business Support Home](https://business.facebook.com/business-support-home) e verifique se há violações listadas.
2. Se houver violação, clique em **"Solicitar revisão"** e explique a situação.
3. Verifique o status detalhado via API:
   ```bash
   curl "https://graph.facebook.com/v25.0/SEU_PHONE_NUMBER_ID?fields=health_status&access_token=SEU_TOKEN"
   ```
4. Se o painel de suporte não mostrar nada, abra um ticket diretamente com a Meta mencionando o erro `#131031` e o WABA ID.
5. **Alternativa:** Crie uma nova WABA e registre um número limpo nela (ver seção 2).

**Nota:** O painel "Account Overview" nem sempre reflete o estado real da API. É possível ver "No account issues" e ainda ter o erro 131031 ativo.

---

## 2. Webhooks não batem no servidor

**Sintoma:** Você configura o webhook na Meta, o campo `messages` está assinado, mas quando alguém envia mensagem para o número, nada aparece no log do servidor.

**Causas possíveis e soluções:**

### 2.1 WABA não inscrita no app

Este é o problema mais comum. Mesmo com webhook configurado, cada WABA precisa ser inscrita individualmente:

```bash
curl -X POST \
  "https://graph.facebook.com/v25.0/SEU_WABA_ID/subscribed_apps" \
  -H "Authorization: Bearer SEU_TOKEN"
```

**Como encontrar o WABA ID:** Business Manager → Configurações → Contas do WhatsApp → clique na conta → "Identificador da conta".

### 2.2 App Secret incorreto (respostas 401)

Se o `META_APP_SECRET` no `.env` estiver errado ou for um placeholder, toda requisição da Meta será rejeitada com 401.

**Diagnóstico:** Verifique os logs:
```bash
journalctl -u wa-gateway -f
```

Se aparecer `[🔴 Alerta de Segurança] Tentativa de injeção bloqueada!`, o App Secret está incorreto.

**Solução:** Copie o App Secret correto em Meta Developers → Seu App → Configurações → Básico.

### 2.3 Campo messages não assinado

No painel do app em WhatsApp → Configuração → Campos do webhook, o campo `messages` precisa estar com toggle ativo (mostrar "Assinado", não "Cancelou a assinatura").

### 2.4 Webhook apontando para URL errada

Verifique se a Callback URL está correta e acessível:
```bash
# Teste externo
curl -I https://gateway.suaempresa.com.br/webhook
```

Deve retornar status `404` (pois é GET sem os parâmetros de challenge). Se retornar erro de conexão, o problema é no Nginx/DNS/SSL.

---

## 3. Webhooks batem no servidor mas não chegam no n8n

**Sintoma:** O log do servidor mostra `[✅ Autenticado] Mensagem de ...` mas o n8n não registra execução.

### 3.1 URL de teste vs. produção no n8n

**Causa:** A URL do n8n no `.env` usa `/webhook-test/` em vez de `/webhook/`.

- `/webhook-test/` — Só funciona enquanto o workflow está no modo "listening" (botão "Test workflow" ativo no editor).
- `/webhook/` — Funciona permanentemente quando o workflow está ativo.

**Solução:** Troque no `.env`:
```env
# ERRADO
WEBHOOK_URL_N8N=https://n8n.suaempresa.com.br/webhook-test/seu-id

# CORRETO
WEBHOOK_URL_N8N=https://n8n.suaempresa.com.br/webhook/seu-id
```

Reinicie o gateway: `systemctl restart wa-gateway`

### 3.2 Workflow não está ativo no n8n

O workflow precisa estar ativo (toggle no canto superior direito do editor do n8n). Se estiver desligado, o endpoint de produção não responde.

### 3.3 O código só repassa mensagens, não status updates

O webhook controller atual só repassa para o n8n quando o payload contém `messages`. Webhooks de status (delivery, read, failed) não são repassados. Isso é intencional no momento, mas significa que erros de entrega não aparecem no n8n.

---

## 4. n8n recebe webhook mas a resposta não chega

**Sintoma:** O n8n mostra execução bem-sucedida, a API da Meta retorna um `message_id`, mas a mensagem não chega no celular.

### 4.1 Token expirado

Se estiver usando o token temporário do painel de teste (expira em ~1 hora):

**Solução:** Use o token permanente do System User. Veja [SETUP.md](./SETUP.md#25-criar-system-user-e-token-permanente).

### 4.2 Número do destinatário com formato incorreto

A API da Meta espera o número sem `+` e sem espaços:
- Correto: `556799587200`
- Incorreto: `+55 67 99958 7200`
- Incorreto: `5567999587200` (com o 9 extra — o WhatsApp normaliza removendo)

**Dica:** Use o campo `from` do webhook recebido, que já vem no formato correto.

### 4.3 Erro 131031 (conta bloqueada)

Veja a seção 1 deste documento.

---

## 5. Expressões do n8n não resolvem

**Sintoma:** O n8n mostra erro "Object with ID 'messages' does not exist" ou similar.

**Causa:** O payload do gateway chega no n8n Webhook node dentro de `$json.body`, não direto em `$json`. O Webhook node do n8n separa automaticamente em `headers`, `params`, `query` e `body`.

**Expressões corretas:**

| Dado | Expressão n8n |
|------|---------------|
| Remetente | `{{ $json.body.entry[0].changes[0].value.messages[0].from }}` |
| Phone Number ID | `{{ $json.body.entry[0].changes[0].value.metadata.phone_number_id }}` |
| Texto da mensagem | `{{ $json.body.entry[0].changes[0].value.messages[0].text.body }}` |
| Nome do contato | `{{ $json.body.entry[0].changes[0].value.contacts[0].profile.name }}` |
| WABA ID | `{{ $json.body.entry[0].id }}` |
| Tipo da mensagem | `{{ $json.body.entry[0].changes[0].value.messages[0].type }}` |

**Estrutura completa do `$json` no n8n:**
```json
{
  "headers": { "host": "...", "content-type": "application/json", ... },
  "params": {},
  "query": {},
  "body": {
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "WABA_ID",
      "changes": [{
        "value": {
          "messaging_product": "whatsapp",
          "metadata": {
            "display_phone_number": "5567920015827",
            "phone_number_id": "968853216316915"
          },
          "contacts": [{ "profile": { "name": "Nome" }, "wa_id": "556799587200" }],
          "messages": [{
            "from": "556799587200",
            "id": "wamid.xxx",
            "timestamp": "1772635680",
            "text": { "body": "Oi" },
            "type": "text"
          }]
        },
        "field": "messages"
      }]
    }]
  }
}
```

---

## 6. Painel de teste não mostra número real

**Sintoma:** No Meta Developers → WhatsApp → Teste de API, o dropdown de "número de origem" só mostra o número de teste da Meta (+1 555 152 6827), não seu número registrado.

**Explicação:** Isso é o comportamento esperado. O painel de teste é exclusivo para o número de teste da Meta. Para enviar mensagens com seu número real, use a API diretamente (Postman, curl, ou n8n).

```bash
curl -X POST \
  "https://graph.facebook.com/v25.0/SEU_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "NUMERO_DESTINO",
    "type": "text",
    "text": { "body": "Teste com número real!" }
  }'
```

---

## 7. ERR_INVALID_URL no log do servidor

**Sintoma:** O log mostra `code: "ERR_INVALID_URL"` no router.

**Causa:** O `WEBHOOK_URL_N8N` no `.env` está vazio ou mal formatado.

**Solução:** Verifique o `.env`:
```bash
cat .env
```
A URL deve ser completa, com `https://` e sem espaços ou aspas extras.

---

## 8. Comandos úteis para diagnóstico

```bash
# Status do serviço
systemctl status wa-gateway

# Logs em tempo real
journalctl -u wa-gateway -f

# Últimos 50 logs
journalctl -u wa-gateway -n 50

# Reiniciar o serviço
systemctl restart wa-gateway

# Testar health check
curl https://gateway.suaempresa.com.br/health

# Testar se Nginx está OK
nginx -t

# Verificar certificado SSL
curl -vI https://gateway.suaempresa.com.br 2>&1 | grep -E "SSL|expire"

# Verificar se a porta 3000 está escutando
ss -tlnp | grep 3000

# Testar webhook manualmente (simulando Meta)
curl -X POST https://gateway.suaempresa.com.br/webhook \
  -H "Content-Type: application/json" \
  -d '{"object":"whatsapp_business_account","entry":[{"id":"test"}]}'
```

---

## 9. Erros comuns da API da Meta

| Código | Mensagem | Causa | Solução |
|--------|----------|-------|---------|
| 131031 | Business Account locked | WABA bloqueada | Ver seção 1 |
| 131047 | Re-engagement message | Fora da janela de 24h | Usar template em vez de texto livre |
| 131051 | Unsupported message type | Tipo de mensagem inválido | Verificar formato do body |
| 100 | Invalid parameter | Parâmetro mal formado | Verificar JSON e phone_number_id |
| 190 | Invalid OAuth access token | Token expirado/inválido | Gerar novo token do System User |
| 368 | Temporarily blocked | Rate limit | Aguardar e reduzir volume |
| 131026 | Message undeliverable | Número não existe no WhatsApp | Verificar número do destinatário |

---

## 10. Fluxo de diagnóstico rápido

Quando algo não funciona, siga esta ordem:

1. **Servidor rodando?** → `systemctl status wa-gateway`
2. **Logs mostram erro?** → `journalctl -u wa-gateway -f`
3. **Webhook bate no servidor?** → Envie mensagem e observe o log
4. **Assinatura válida?** → Se log mostra "Alerta de Segurança", App Secret está errado
5. **n8n recebe?** → Verifique execuções no n8n. Se não, cheque URL (test vs prod) e workflow ativo
6. **API aceita a resposta?** → Verifique output do HTTP Request node no n8n
7. **Mensagem chega no celular?** → Se API aceita mas não chega, veja status webhook (pode ser 131031)
