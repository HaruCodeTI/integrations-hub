function escHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function signupHTML(tokenId: string, metaAppId: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conectar WhatsApp — HaruCode</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: white; border-radius: 16px; padding: 40px; max-width: 480px; width: 100%; box-shadow: 0 4px 24px rgba(0,0,0,0.07); }
    h1 { font-size: 22px; color: #1a1a2e; margin-bottom: 8px; }
    .subtitle { color: #6b7280; font-size: 14px; margin-bottom: 32px; line-height: 1.5; }
    .btn-connect { width: 100%; padding: 14px; background: #25d366; color: white; border: none; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; }
    .btn-connect:disabled { background: #9ca3af; cursor: not-allowed; }
    .error-msg { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-top: 16px; display: none; }
    .error-msg.show { display: block; }
    #step-numbers { display: none; margin-top: 24px; }
    #step-numbers.show { display: block; }
    #step-numbers h2 { font-size: 16px; margin-bottom: 16px; }
    .number-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 8px; cursor: pointer; }
    .number-item:hover { border-color: #4f46e5; }
    .number-item input[type="checkbox"] { width: 18px; height: 18px; }
    .number-name { font-size: 14px; font-weight: 600; color: #1a1a2e; }
    .number-phone { font-size: 13px; color: #6b7280; }
    .btn-confirm { width: 100%; margin-top: 16px; padding: 12px; background: #4f46e5; color: white; border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; }
    .btn-confirm:disabled { background: #9ca3af; cursor: not-allowed; }
  </style>
</head>
<body>
  <div class="card">
    <h1>&#x1F4AC; Conectar WhatsApp Business</h1>
    <p class="subtitle">Clique no botão abaixo para autorizar a conexão do seu WhatsApp Business com a plataforma HaruCode.</p>
    <button class="btn-connect" id="btn-connect" onclick="launchSignup()">Conectar com WhatsApp Business</button>
    <div class="error-msg" id="error-msg"></div>
    <div id="step-numbers">
      <h2>Selecione os números a conectar:</h2>
      <div id="numbers-list"></div>
      <button class="btn-confirm" id="btn-confirm" onclick="confirmNumbers()">Confirmar seleção</button>
    </div>
  </div>

  <script>
    window.fbAsyncInit = function() {
      FB.init({ appId: '${escHtml(metaAppId)}', autoLogAppEvents: true, xfbml: true, version: 'v21.0' });
    };
  </script>
  <script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js"></script>

  <script>
    var TOKEN_ID = '${escHtml(tokenId)}';

    function showError(msg) { var e = document.getElementById('error-msg'); e.textContent = msg; e.classList.add('show'); }
    function hideError() { document.getElementById('error-msg').classList.remove('show'); }

    function launchSignup() {
      hideError();
      document.getElementById('btn-connect').disabled = true;
      FB.login(function() {}, {
        scope: 'whatsapp_business_management,whatsapp_business_messaging',
        response_type: 'code',
        extras: { setup: {}, featureType: '', sessionInfoVersion: '3' }
      });
    }

    window.addEventListener('message', async function(event) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      var data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return;

      if (data.event === 'CANCEL' || data.event === 'ERROR') {
        document.getElementById('btn-connect').disabled = false;
        showError('Autorização cancelada. Você pode tentar novamente.');
        return;
      }
      if (data.event === 'FINISH') {
        try {
          var res = await fetch('/signup/' + TOKEN_ID + '/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: data.data.code, waba_id: data.data.waba_id }),
          });
          var result = await res.json();
          if (!res.ok) {
            document.getElementById('btn-connect').disabled = false;
            showError(result.error || 'Algo deu errado. Recarregue e tente novamente.');
            return;
          }
          renderNumbers(result.numbers);
          document.getElementById('btn-connect').style.display = 'none';
          document.getElementById('step-numbers').classList.add('show');
        } catch {
          document.getElementById('btn-connect').disabled = false;
          showError('Algo deu errado. Recarregue e tente novamente.');
        }
      }
    });

    function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    function renderNumbers(numbers) {
      document.getElementById('numbers-list').innerHTML = numbers.map(function(n, i) {
        return '<div class="number-item"><input type="checkbox" id="n'+i+'" value="'+esc(n.id)+'" checked>' +
          '<label for="n'+i+'"><div class="number-name">'+esc(n.verified_name)+'</div>' +
          '<div class="number-phone">'+esc(n.display_phone_number)+'</div></label></div>';
      }).join('');
    }

    async function confirmNumbers() {
      hideError();
      var ids = Array.from(document.querySelectorAll('#numbers-list input:checked')).map(function(cb) { return cb.value; });
      if (ids.length === 0) { showError('Selecione ao menos um número.'); return; }
      var btn = document.getElementById('btn-confirm');
      btn.disabled = true; btn.textContent = 'Aguarde...';
      try {
        var res = await fetch('/signup/' + TOKEN_ID + '/confirm', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone_number_ids: ids }),
        });
        var result = await res.json();
        if (!res.ok) { btn.disabled = false; btn.textContent = 'Confirmar seleção'; showError(result.error || 'Erro.'); return; }
        window.location.href = '/signup/success';
      } catch { btn.disabled = false; btn.textContent = 'Confirmar seleção'; showError('Erro ao confirmar.'); }
    }
  </script>
</body>
</html>`;
}

export function signupErrorHTML(message: string): string {
  const e = (s: string) => s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Link Inválido — HaruCode</title>
  <style>* { margin:0;padding:0;box-sizing:border-box; } body { font-family:-apple-system,sans-serif;background:#f5f5f5;display:flex;align-items:center;justify-content:center;min-height:100vh; } .card { background:white;border-radius:16px;padding:48px 40px;text-align:center;max-width:420px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,0.07); } h1 { font-size:20px;color:#dc2626;margin-bottom:12px; } p { color:#4b5563;font-size:14px;line-height:1.6; }</style>
  </head><body><div class="card"><div style="font-size:48px;margin-bottom:20px">&#x26A0;&#xFE0F;</div><h1>Link inválido</h1><p>${e(message)}</p></div></body></html>`;
}
