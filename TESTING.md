# Guia de Testes — Integrations Hub

## Testes Automatizados

```bash
bun test
```

47 testes cobrindo DB, meta-oauth service, signup controller e token-refresh job.

---

## Teste Manual: Embedded Signup (end-to-end)

### Pré-requisitos

No `.env`:

```env
META_APP_ID=<seu app id público>
META_APP_SECRET=<seu app secret>
GATEWAY_PUBLIC_URL=https://gateway.harucode.com.br
ADMIN_PASSWORD=<sua senha admin>
```

Como obter `META_APP_ID` e `META_APP_SECRET`:
- Acesse [developers.facebook.com](https://developers.facebook.com) → seu app → **Configurações → Básico**
- App ID = `META_APP_ID` (público, aparece no topo)
- Chave Secreta do Aplicativo = `META_APP_SECRET` (clique em "Mostrar")

### Passo 1 — Gerar link de onboarding

1. Acesse `/admin` → faça login
2. Clique em **"🔗 Gerar link de onboarding"**
3. Copie o link exibido no banner verde (ex: `https://gateway.harucode.com.br/signup/uuid-aqui`)
4. O link expira em **7 dias**

### Passo 2 — Fluxo do cliente

1. Abra o link (pode ser em aba anônima para simular cliente)
2. Clique em **"Conectar WhatsApp"**
3. O Facebook abrirá um popup — siga os passos para autorizar o WABA
4. Após autorizar, a página exibirá os números disponíveis
5. Selecione os números desejados e clique em **"Confirmar seleção"**
6. Deve redirecionar para `/signup/success` com mensagem de confirmação

### Passo 3 — Verificar resultado no admin

1. Volte ao `/admin`
2. Os clientes criados aparecem na tabela com:
   - Tipo: `WEBHOOK`
   - Status: `ativo`
   - Token: `OK` (verde)

---

## Casos de Erro para Testar

| Cenário | Como reproduzir | Resultado esperado |
|---|---|---|
| Link expirado | Editar `expires_at` no DB para data passada | Página "Link inválido ou já utilizado" |
| Link já usado | Completar o fluxo e tentar abrir o link novamente | Página "Link inválido ou já utilizado" |
| Code inválido | No DevTools → Network → interceptar POST `/exchange`, reenviar com `code: "invalido"` | HTTP 400 com mensagem de erro inline |
| WABA sem números | Conta sem números associados | HTTP 400 "Nenhum número encontrado" |
| Signup cancelado | Fechar o popup do Facebook antes de concluir | Mensagem inline de cancelamento, token permanece válido |

---

## Testar o Job de Renovação de Token

### Forçar renovação via DB

```sql
-- Atualiza um cliente para ter token vencendo em 3 dias (dentro do threshold de 7)
UPDATE clients
SET meta_token_expires_at = datetime('now', '+3 days')
WHERE id = 'SEU_CLIENT_ID';
```

### Rodar o job manualmente

```bash
bun -e "import { runTokenRefreshJob } from './src/jobs/token-refresh.job'; await runTokenRefreshJob();"
```

### Resultado esperado
- Log: `[TokenRefresh] Renovando token para: NomeDoCliente`
- `meta_token_expires_at` atualizado para ~60 dias no futuro
- `token_expired` permanece `0`

### Simular falha na renovação

```sql
-- Token inválido vai causar erro na Meta API
UPDATE clients SET meta_token = 'token_invalido_xxxxxxxxxxx' WHERE id = 'SEU_CLIENT_ID';
```

Após rodar o job:
- Log de erro no console
- `token_expired = 1` no banco
- Badge **Expirado** (vermelho) aparece no dashboard admin

---

## Inspecionar o Banco de Dados

```bash
# Abrir o SQLite interativo
bun -e "import { Database } from 'bun:sqlite'; const db = new Database('gateway.db'); console.log(db.query('SELECT * FROM signup_tokens').all());"

# Ver clientes com token expirando em breve
bun -e "import { Database } from 'bun:sqlite'; const db = new Database('gateway.db'); console.log(db.query(\"SELECT id, name, meta_token_expires_at, token_expired FROM clients WHERE meta_token_expires_at IS NOT NULL\").all());"
```
