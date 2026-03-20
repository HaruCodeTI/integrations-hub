import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AccountSelector from '../../components/AccountSelector';

interface ParseResult {
  columns: string[];
  total: number;
  preview: Array<Record<string, string>>;
}

const LANGUAGES = [
  { value: 'pt_BR', label: 'Português (Brasil)' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'es_ES', label: 'Español (España)' },
];

export default function CampaignWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [phoneId, setPhoneId] = useState('');
  const [name, setName] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('pt_BR');
  const [delaySeconds, setDelaySeconds] = useState(5);
  const [scheduledAt, setScheduledAt] = useState('');

  // Step 2 state
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  // Variable mapping: index → column name
  const [mapping, setMapping] = useState<string[]>([]);
  const [variableCount, setVariableCount] = useState(0);

  // Step 3 state
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // ─── Step 1 ───────────────────────────────────────────────

  function step1Valid() {
    return phoneId && name.trim() && templateName.trim() && language;
  }

  // ─── Step 2 ───────────────────────────────────────────────

  async function handleFileParse() {
    if (!file) return;
    setParsing(true);
    setParseError(null);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/v2/campaigns/parse', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setParseError(data.error ?? 'Erro ao processar arquivo'); return; }
      setParseResult(data);
      // Initialize mapping with empty strings
      const vars = variableCount;
      setMapping(Array(vars).fill(''));
    } catch {
      setParseError('Erro de conexão');
    } finally {
      setParsing(false);
    }
  }

  function step2Valid() {
    return parseResult !== null && parseResult.total > 0;
  }

  // ─── Step 3 (Create) ──────────────────────────────────────

  async function createCampaign() {
    if (!parseResult) return;
    setCreating(true);
    setCreateError(null);

    const formData = new FormData();
    if (file) formData.append('file', file);
    formData.append('meta', JSON.stringify({
      name: name.trim(),
      phone_number_id: phoneId,
      template_name: templateName.trim(),
      template_language: language,
      variable_mapping: mapping,
      delay_seconds: delaySeconds,
      scheduled_at: scheduledAt || undefined,
    }));

    try {
      const res = await fetch('/api/v2/campaigns', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) { setCreateError(data.error ?? 'Erro ao criar campanha'); return; }
      navigate(`/painel/campanhas/${data.id}`);
    } catch {
      setCreateError('Erro de conexão');
    } finally {
      setCreating(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/painel/campanhas')} className="text-gray-400 hover:text-gray-600">
          ← Voltar
        </button>
        <h1 className="text-xl font-semibold text-gray-900">Nova Campanha</h1>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3].map(s => (
          <div key={s} className={`flex-1 h-1 rounded-full ${step >= s ? 'bg-blue-600' : 'bg-gray-200'}`} />
        ))}
      </div>

      {/* ── Step 1 ── */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-base font-medium text-gray-800">1. Configurações da campanha</h2>

          <AccountSelector value={phoneId} onChange={setPhoneId} label="Conta WhatsApp *" />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome da campanha *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Promoção Dezembro"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do template *</label>
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="Ex: hello_world"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Idioma do template *</label>
            <select
              value={language}
              onChange={e => setLanguage(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Número de variáveis do template</label>
            <input
              type="number"
              min={0}
              max={20}
              value={variableCount}
              onChange={e => setVariableCount(parseInt(e.target.value, 10) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">Quantidade de variáveis ({`{{1}}`}, {`{{2}}`}, ...) no corpo do template</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Intervalo entre mensagens (segundos)</label>
            <input
              type="number"
              min={1}
              max={60}
              value={delaySeconds}
              onChange={e => setDelaySeconds(parseInt(e.target.value, 10) || 5)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agendamento (opcional)</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="pt-4">
            <button
              onClick={() => setStep(2)}
              disabled={!step1Valid()}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-blue-700"
            >
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2 ── */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-base font-medium text-gray-800">2. Upload de contatos</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo CSV ou XLSX *</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setParseResult(null); }}
              className="w-full text-sm text-gray-600"
            />
            <p className="text-xs text-gray-400 mt-1">O arquivo deve ter uma coluna "telefone" com o número no formato 5541900000000</p>
          </div>

          {file && !parseResult && (
            <button
              onClick={handleFileParse}
              disabled={parsing}
              className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {parsing ? 'Processando...' : 'Processar arquivo'}
            </button>
          )}

          {parseError && <div className="text-red-500 text-sm">{parseError}</div>}

          {parseResult && (
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
                ✓ {parseResult.total} contatos encontrados
              </div>

              {/* Variable mapping */}
              {variableCount > 0 && (
                <div className="space-y-2">
                  <div className="text-sm font-medium text-gray-700">Mapeamento de variáveis</div>
                  {Array.from({ length: variableCount }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 w-16">{`{{${i + 1}}}`}</span>
                      <select
                        value={mapping[i] ?? ''}
                        onChange={e => {
                          const m = [...mapping];
                          m[i] = e.target.value;
                          setMapping(m);
                        }}
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Selecione uma coluna...</option>
                        {parseResult.columns.map(col => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {/* Preview */}
              <div className="text-sm font-medium text-gray-700">Preview (primeiros {parseResult.preview.length})</div>
              <div className="overflow-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {parseResult.columns.map(col => (
                        <th key={col} className="px-3 py-2 text-left font-medium text-gray-600">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parseResult.preview.map((row, i) => (
                      <tr key={i}>
                        {parseResult.columns.map(col => (
                          <td key={col} className="px-3 py-2 text-gray-700">{row[col]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <button onClick={() => setStep(1)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              ← Voltar
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!step2Valid()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-blue-700"
            >
              Próximo →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3 ── */}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-base font-medium text-gray-800">3. Confirmar e criar</h2>

          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Nome:</span>
              <span className="font-medium">{name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Template:</span>
              <span className="font-medium">{templateName} ({language})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Contatos:</span>
              <span className="font-medium">{parseResult?.total ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Intervalo:</span>
              <span className="font-medium">{delaySeconds}s entre mensagens</span>
            </div>
            {scheduledAt && (
              <div className="flex justify-between">
                <span className="text-gray-500">Agendado para:</span>
                <span className="font-medium">{new Date(scheduledAt).toLocaleString('pt-BR')}</span>
              </div>
            )}
          </div>

          {createError && <div className="text-red-500 text-sm">{createError}</div>}

          <div className="flex gap-2 pt-4">
            <button onClick={() => setStep(2)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
              ← Voltar
            </button>
            <button
              onClick={createCampaign}
              disabled={creating}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm disabled:opacity-50 hover:bg-green-700"
            >
              {creating ? 'Criando...' : 'Criar Campanha'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
