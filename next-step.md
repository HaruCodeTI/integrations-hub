Para ativar no deploy, você vai precisar:

Criar o app no GHL Marketplace e pegar GHL_CLIENT_ID e GHL_CLIENT_SECRET
Registrar o Conversation Provider e pegar o GHL_CONVERSATION_PROVIDER_ID
Configurar no GHL Marketplace a webhook URL: https://gateway.harucode.com.br/ghl/webhook/outbound
Adicionar as variáveis no .env do servidor
Acessar https://gateway.harucode.com.br/ghl/install para autorizar uma sub-account
Cadastrar um cliente tipo GHL via API: POST /api/clients com client_type: "ghl" e ghl_location_id