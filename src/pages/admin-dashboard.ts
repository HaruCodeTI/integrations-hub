import type { Client } from "../services/db.service";

export type FormValues = {
  name?: string;
  client_type?: string;
  phone_number_id?: string;
  meta_token?: string;
  ghl_location_id?: string;
  webhook_url?: string;
};

export function adminDashboardHTML(
  clients: Client[],
  message?: { type: "success" | "error"; text: string },
  formValues?: FormValues
): string {
  const fv = formValues || {};
  const isWebhook = fv.client_type === "webhook";
  const rows = clients.map(c => `
    <tr>
      <td>${escHtml(c.name)}</td>
      <td><span class="badge badge-${c.client_type}">${c.client_type.toUpperCase()}</span></td>
      <td><code>${escHtml(c.phone_number_id)}</code></td>
      <td><span class="status ${c.active ? 'active' : 'inactive'}">${c.active ? 'ativo' : 'inativo'}</span></td>
      <td>
        ${c.active
          ? `<form method="POST" action="/admin/clients/${c.id}/deactivate" style="display:inline">
               <button type="submit" class="btn-danger" onclick="return confirm('Desativar ${escHtml(c.name)}?')">Desativar</button>
             </form>`
          : `<form method="POST" action="/admin/clients/${c.id}/reactivate" style="display:inline">
               <button type="submit" class="btn-secondary">Reativar</button>
             </form>`
        }
      </td>
    </tr>
  `).join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin — HaruCode Gateway</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #1a1a2e; }
    header { background: #4f46e5; color: white; padding: 16px 32px; display: flex; align-items: center; justify-content: space-between; }
    header h1 { font-size: 18px; font-weight: 700; }
    header form button { background: rgba(255,255,255,0.15); color: white; border: 1px solid rgba(255,255,255,0.3); padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px; }
    header form button:hover { background: rgba(255,255,255,0.25); }
    main { max-width: 1100px; margin: 32px auto; padding: 0 24px; }
    .banner { padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; font-weight: 500; }
    .banner.success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
    .banner.error { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }
    .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .section-header h2 { font-size: 18px; }
    table { width: 100%; background: white; border-radius: 10px; border-collapse: collapse; box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow: hidden; }
    th { background: #f9fafb; text-align: left; padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
    td { padding: 14px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
    .badge-ghl { background: #dbeafe; color: #1d4ed8; }
    .badge-webhook { background: #f3e8ff; color: #7c3aed; }
    .status { font-size: 13px; font-weight: 600; }
    .status.active { color: #16a34a; }
    .status.inactive { color: #9ca3af; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }
    .btn-danger { background: #fee2e2; color: #dc2626; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-danger:hover { background: #fecaca; }
    .btn-secondary { background: #e5e7eb; color: #374151; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .btn-secondary:hover { background: #d1d5db; }
    .btn-primary { background: #4f46e5; color: white; border: none; padding: 9px 18px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; }
    .btn-primary:hover { background: #4338ca; }
    #form-novo-cliente { display: none; background: white; border-radius: 10px; padding: 28px; margin-top: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
    #form-novo-cliente.open { display: block; }
    #form-novo-cliente h3 { font-size: 16px; margin-bottom: 20px; }
    .form-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group.full { grid-column: 1 / -1; }
    .form-group label { font-size: 13px; font-weight: 600; color: #374151; }
    .form-group input, .form-group select {
      padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px;
      font-size: 14px; outline: none; transition: border-color 0.2s;
    }
    .form-group input:focus, .form-group select:focus { border-color: #4f46e5; }
    .form-actions { grid-column: 1 / -1; display: flex; gap: 12px; margin-top: 8px; }
    #guia-meta { margin-top: 24px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; overflow: hidden; }
    #guia-meta summary { padding: 14px 20px; cursor: pointer; font-size: 14px; font-weight: 600; color: #92400e; user-select: none; }
    #guia-meta summary:hover { background: #fef3c7; }
    .guia-content { padding: 0 20px 20px; }
    .guia-content h4 { font-size: 13px; font-weight: 700; color: #78350f; margin: 16px 0 8px; }
    .guia-content ol { padding-left: 20px; }
    .guia-content li { font-size: 13px; color: #713f12; line-height: 1.8; }
  </style>
</head>
<body>
  <header>
    <h1>🔧 HaruCode Gateway Admin</h1>
    <form method="POST" action="/admin/logout">
      <button type="submit">Sair</button>
    </form>
  </header>

  <main>
    ${message ? `<div class="banner ${message.type}">${escHtml(message.text)}</div>` : ""}

    <div class="section-header">
      <h2>Clientes (${clients.length})</h2>
      <button class="btn-primary" onclick="toggleForm()">+ Novo Cliente</button>
    </div>

    <table>
      <thead>
        <tr>
          <th>Nome</th>
          <th>Tipo</th>
          <th>Phone Number ID</th>
          <th>Status</th>
          <th>Ações</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:32px">Nenhum cliente cadastrado ainda.</td></tr>'}
      </tbody>
    </table>

    <div id="form-novo-cliente" ${formValues ? 'class="open"' : ''}>
      <h3>Novo Cliente</h3>
      <form method="POST" action="/admin/clients">
        <div class="form-layout">
          <div class="form-group">
            <label for="name">Nome *</label>
            <input type="text" id="name" name="name" required placeholder="Ex: Empresa X" value="${escHtml(fv.name || '')}">
          </div>
          <div class="form-group">
            <label for="client_type">Tipo *</label>
            <select id="client_type" name="client_type" onchange="onTypeChange(this.value)" required>
              <option value="ghl" ${!isWebhook ? 'selected' : ''}>GHL (GoHighLevel)</option>
              <option value="webhook" ${isWebhook ? 'selected' : ''}>Webhook (n8n, bot, etc)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="phone_number_id">Phone Number ID *</label>
            <input type="text" id="phone_number_id" name="phone_number_id" required placeholder="Ex: 123456789012345" value="${escHtml(fv.phone_number_id || '')}">
          </div>
          <div class="form-group">
            <label for="meta_token">Meta Token (System User) *</label>
            <input type="text" id="meta_token" name="meta_token" required placeholder="EAAxxxxxx..." value="${escHtml(fv.meta_token || '')}">
          </div>
          <div class="form-group" id="field-ghl-location" ${isWebhook ? 'style="display:none"' : ''}>
            <label for="ghl_location_id">GHL Location ID *</label>
            <input type="text" id="ghl_location_id" name="ghl_location_id" placeholder="Ex: AbCdEfGhIj..." value="${escHtml(fv.ghl_location_id || '')}">
          </div>
          <div class="form-group" id="field-webhook-url" ${!isWebhook ? 'style="display:none"' : ''}>
            <label for="webhook_url">Webhook URL *</label>
            <input type="url" id="webhook_url" name="webhook_url" placeholder="https://..." value="${escHtml(fv.webhook_url || '')}">
          </div>
          <div class="form-actions">
            <button type="submit" class="btn-primary">Cadastrar</button>
            <button type="button" class="btn-secondary" onclick="toggleForm()">Cancelar</button>
          </div>
        </div>
      </form>
    </div>

    <details id="guia-meta">
      <summary>📖 Guia: onde encontrar os dados no Meta</summary>
      <div class="guia-content">
        <h4>Como obter o Phone Number ID</h4>
        <ol>
          <li>Acesse <a href="https://developers.facebook.com" target="_blank">developers.facebook.com</a> → seu app</li>
          <li>Menu lateral: <strong>WhatsApp → API Setup</strong></li>
          <li>Na seção "From", selecione o número — o Phone Number ID aparece abaixo</li>
        </ol>
        <h4>Como gerar o Meta Token (System User)</h4>
        <ol>
          <li>Acesse <a href="https://business.facebook.com" target="_blank">business.facebook.com</a> → Configurações do Negócio</li>
          <li>Usuários → <strong>Usuários do Sistema</strong> → criar ou selecionar um usuário admin</li>
          <li>Clique em <strong>"Gerar novo token"</strong> → selecione seu app</li>
          <li>Permissões necessárias: <code>whatsapp_business_management</code> e <code>whatsapp_business_messaging</code></li>
          <li>Copie o token gerado — <strong>ele não é exibido novamente</strong></li>
        </ol>
      </div>
    </details>
  </main>

  <script>
    function toggleForm() {
      const form = document.getElementById('form-novo-cliente');
      form.classList.toggle('open');
    }
    function onTypeChange(value) {
      document.getElementById('field-ghl-location').style.display = value === 'ghl' ? '' : 'none';
      document.getElementById('field-webhook-url').style.display = value === 'webhook' ? '' : 'none';
      document.getElementById('ghl_location_id').required = value === 'ghl';
      document.getElementById('webhook_url').required = value === 'webhook';
    }
  </script>
</body>
</html>`;
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
