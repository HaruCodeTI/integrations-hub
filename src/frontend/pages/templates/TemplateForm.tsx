import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export default function TemplateForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const phoneId = searchParams.get('phone') ?? '';

  const [form, setForm] = useState({
    name: '',
    category: 'MARKETING',
    language: 'pt_BR',
    headerText: '',
    body: '',
    footer: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Extrai variaveis {{1}} {{2}} do body
  const bodyVars = Array.from(new Set((form.body.match(/\{\{\d+\}\}/g) ?? [])));

  const [examples, setExamples] = useState<Record<string, string>>({});

  function setField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.name || !form.body) { setError('Nome e corpo sao obrigatorios'); return; }
    if (!phoneId) { setError('Selecione uma conta'); return; }

    const components: object[] = [];
    if (form.headerText) components.push({ type: 'HEADER', format: 'TEXT', text: form.headerText });
    components.push({
      type: 'BODY',
      text: form.body,
      ...(bodyVars.length > 0 ? {
        example: { body_text: [bodyVars.map(v => examples[v] ?? v)] }
      } : {}),
    });
    if (form.footer) components.push({ type: 'FOOTER', text: form.footer });

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/v2/templates/${phoneId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          language: form.language,
          components,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erro ao criar');
      navigate(`/painel/templates?phone=${phoneId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Novo Template</h1>
        <p className="text-sm text-gray-500">Configure a mensagem para aprovacao da Meta</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <div className="flex gap-3">
            {['MARKETING', 'UTILITY', 'AUTHENTICATION'].map(c => (
              <button key={c} onClick={() => setField('category', c)}
                className={`flex-1 py-2 px-3 border rounded-lg text-sm font-medium ${form.category === c ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600'}`}>
                {c === 'MARKETING' ? 'Marketing' : c === 'UTILITY' ? 'Utilidade' : 'Autenticacao'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Template *</label>
          <input type="text" value={form.name} onChange={e => setField('name', e.target.value.toLowerCase().replace(/\s+/g, '_'))}
            placeholder="ex: promocao_verao_2026"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mt-1">Apenas letras minusculas, numeros e underscores</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
          <select value={form.language} onChange={e => setField('language', e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="pt_BR">Portugues (Brasil)</option>
            <option value="en_US">Ingles (EUA)</option>
            <option value="es">Espanhol</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Cabecalho (opcional)</label>
          <input type="text" value={form.headerText} onChange={e => setField('headerText', e.target.value)}
            placeholder="Texto do cabecalho"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Corpo da Mensagem *</label>
          <textarea value={form.body} onChange={e => setField('body', e.target.value)} rows={4}
            placeholder="Ola, {{1}}, confira nossa promocao!"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-400 mt-1">Use {'{{1}}'} {'{{2}}'} para variaveis dinamicas</p>
        </div>

        {bodyVars.length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs font-medium text-yellow-800 mb-2">Exemplos das Variaveis (obrigatorio pela Meta)</p>
            {bodyVars.map(v => (
              <div key={v} className="flex items-center gap-2 mb-1">
                <span className="text-xs bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded font-mono">{v}</span>
                <input type="text" placeholder={`Exemplo para ${v}`} value={examples[v] ?? ''}
                  onChange={e => setExamples(prev => ({ ...prev, [v]: e.target.value }))}
                  className="flex-1 border border-yellow-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400" />
              </div>
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rodape (opcional)</label>
          <input type="text" value={form.footer} onChange={e => setField('footer', e.target.value)}
            placeholder="Enviado por HaruCode"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-xs font-medium text-gray-500 mb-2">Pre-visualizacao</p>
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 max-w-xs">
            {form.headerText && <p className="font-semibold text-sm mb-1">{form.headerText}</p>}
            <p className="text-sm">{form.body || 'Corpo da mensagem...'}</p>
            {form.footer && <p className="text-xs text-gray-400 mt-1">{form.footer}</p>}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={() => navigate(-1)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Enviando...' : 'Enviar para Aprovacao'}
          </button>
        </div>
      </div>
    </div>
  );
}
