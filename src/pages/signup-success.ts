export function signupSuccessHTML(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Conectado — HaruCode</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f0fdf4; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 16px; padding: 48px 40px; text-align: center; max-width: 420px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    .icon { font-size: 56px; margin-bottom: 20px; }
    h1 { font-size: 24px; color: #166534; margin-bottom: 12px; }
    p { color: #4b5563; font-size: 15px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">✅</div>
    <h1>Tudo certo!</h1>
    <p>Seu WhatsApp Business foi conectado com sucesso.<br>Em breve nossa equipe entrará em contato.</p>
  </div>
</body>
</html>`;
}
