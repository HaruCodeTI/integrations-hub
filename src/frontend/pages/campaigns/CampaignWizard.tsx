// src/frontend/pages/campaigns/CampaignWizard.tsx
import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, ChevronRight, ChevronLeft, AlertTriangle } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';

interface Account { name: string; phone_number_id: string; }
interface Template { name: string; status: string; language: string; components?: any[]; }
// parse API returns: { columns, total, preview }
interface ParsedData { columns: string[]; preview: Record<string, string>[]; total: number; }

const STEPS = ['Upload da Lista', 'Canal & Template', 'Confirmar Disparo'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div className={`flex items-center gap-2 ${i <= current ? 'text-primary' : 'text-text-tertiary'}`}>
            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
              i < current ? 'bg-primary border-primary text-white' :
              i === current ? 'border-primary text-primary' :
              'border-border text-text-tertiary'
            }`}>
              {i < current ? '✓' : i + 1}
            </div>
            <span className="text-sm font-medium hidden sm:block">{label}</span>
          </div>
          {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// Step 1: Upload
function Step1({ campaignName, setCampaignName, parsedData, setParsedData, fileRef, setFileRef, onNext }: any) {
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const parseFile = async (file: File) => {
    setLoading(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/v2/campaigns/parse', { method: 'POST', body: fd });
      const data = await res.json() as any;
      if (!res.ok) { setError(data.error ?? 'Erro ao processar arquivo'); return; }
      if (!data.columns?.includes('telefone')) { setError('O arquivo deve ter uma coluna "telefone"'); return; }
      setFileRef(file);
      setParsedData(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, []);

  return (
    <div className="space-y-4">
      <Input
        label="Nome da campanha"
        value={campaignName}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCampaignName(e.target.value)}
        placeholder="Ex: Black Friday 2026"
      />

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${dragging ? 'border-primary bg-primary-light' : 'border-border hover:border-primary'}`}
      >
        <Upload className="h-8 w-8 mx-auto mb-2 text-text-tertiary" />
        <p className="text-sm text-text-secondary mb-2">Arraste um arquivo CSV ou XLSX, ou</p>
        <label className="cursor-pointer text-sm text-primary font-medium hover:underline">
          escolha um arquivo
          <input type="file" accept=".csv,.xlsx" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) parseFile(f); }} />
        </label>
        <p className="text-xs text-text-tertiary mt-1">Coluna obrigatória: <code>telefone</code></p>
      </div>

      {loading && <p className="text-sm text-text-secondary">Processando arquivo...</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {parsedData && (
        <Card padding="sm">
          <p className="text-sm font-medium text-text-primary mb-2">
            {parsedData.total} contatos — Colunas: {parsedData.columns.join(', ')}
          </p>
          <div className="overflow-x-auto">
            <table className="text-xs w-full">
              <thead>
                <tr className="border-b border-border">
                  {parsedData.columns.map((h: string) => <th key={h} className="text-left py-1 pr-3 text-text-secondary font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {parsedData.preview.slice(0, 5).map((row: any, i: number) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    {parsedData.columns.map((h: string) => <td key={h} className="py-1 pr-3 text-text-primary">{row[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={onNext} disabled={!campaignName || !parsedData}>
          Próximo <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Step 2: Canal + Template
function Step2({ accounts, selectedPhone, setSelectedPhone, templates, loadingTemplates, selectedTemplate, setSelectedTemplate, varMapping, setVarMapping, parsedData, onBack, onNext }: any) {
  const bodyComponent = selectedTemplate?.components?.find((c: any) => c.type === 'BODY');
  // Detecta variáveis {{1}}, {{nome}}, etc. — únicas, em ordem de aparição
  const variables: string[] = [...new Set<string>(bodyComponent?.text?.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) ?? [])];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-text-primary mb-2">Selecionar Canal</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {accounts.map((a: Account) => (
            <Card
              key={a.phone_number_id}
              hover
              onClick={() => setSelectedPhone(a.phone_number_id)}
              className={selectedPhone === a.phone_number_id ? 'ring-2 ring-primary' : ''}
            >
              <p className="font-medium text-text-primary text-sm">{a.name}</p>
              <p className="text-xs text-text-tertiary">{a.phone_number_id}</p>
            </Card>
          ))}
        </div>
      </div>

      {selectedPhone && (
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Selecionar Template</p>
          {loadingTemplates ? (
            <p className="text-sm text-text-secondary">Carregando templates...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
              {templates.filter((t: Template) => t.status === 'APPROVED').map((t: Template) => (
                <Card
                  key={t.name}
                  hover
                  onClick={() => { setSelectedTemplate(t); setVarMapping([]); }}
                  className={selectedTemplate?.name === t.name ? 'ring-2 ring-primary' : ''}
                >
                  <p className="font-medium text-text-primary text-sm">{t.name}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="success">Aprovado</Badge>
                    <span className="text-xs text-text-tertiary">{t.language}</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {variables.length > 0 && parsedData && (
        <div>
          <p className="text-sm font-medium text-text-primary mb-2">Mapeamento de Variáveis</p>
          <div className="space-y-2">
            {variables.map((v: string, i: number) => (
              <div key={v} className="flex items-center gap-3">
                <span className="text-sm text-text-secondary w-12 shrink-0">{v}</span>
                <Select
                  value={varMapping[i] ?? ''}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    const m = [...varMapping];
                    m[i] = e.target.value;
                    setVarMapping(m);
                  }}
                  className="flex-1"
                >
                  <option value="">Selecionar coluna...</option>
                  {parsedData.columns.map((h: string) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
        <Button onClick={onNext} disabled={!selectedPhone || !selectedTemplate}>
          Próximo <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// Step 3: Confirmar
function Step3({ campaignName, selectedPhone, accounts, selectedTemplate, parsedData, varMapping, fileRef, onBack, onSubmit, loading }: any) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [sendNow, setSendNow] = useState(true);

  const account = accounts.find((a: Account) => a.phone_number_id === selectedPhone);
  const firstRow = parsedData?.preview?.[0] ?? {};
  const bodyText = selectedTemplate?.components?.find((c: any) => c.type === 'BODY')?.text ?? '';
  const allVars: string[] = [...new Set<string>(bodyText.match(/\{\{([a-zA-Z0-9_]+)\}\}/g) ?? [])];
  const preview = bodyText.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match: string) => {
    const idx = allVars.indexOf(match);
    const col = varMapping[idx];
    return col ? (firstRow[col] ?? match) : match;
  });

  return (
    <div className="space-y-4">
      <Card padding="lg">
        <h3 className="font-medium text-text-primary mb-3">Resumo do Disparo</h3>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-text-secondary">Campanha</dt><dd className="font-medium">{campaignName}</dd></div>
          <div className="flex justify-between"><dt className="text-text-secondary">Contatos</dt><dd className="font-medium">{parsedData?.total}</dd></div>
          <div className="flex justify-between"><dt className="text-text-secondary">Canal</dt><dd className="font-medium">{account?.name}</dd></div>
          <div className="flex justify-between"><dt className="text-text-secondary">Template</dt><dd className="font-medium">{selectedTemplate?.name}</dd></div>
        </dl>
      </Card>

      <Card>
        <p className="text-sm font-medium text-text-primary mb-2">Agendamento</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={sendNow} onChange={() => setSendNow(true)} />
            <span className="text-sm">Enviar agora</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={!sendNow} onChange={() => setSendNow(false)} />
            <span className="text-sm">Agendar para</span>
          </label>
          {!sendNow && (
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={e => setScheduledAt(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm w-full"
            />
          )}
        </div>
      </Card>

      {preview && (
        <Card>
          <p className="text-sm font-medium text-text-primary mb-2">Preview (1º contato)</p>
          <div className="bg-[#ECE5DD] rounded-lg p-3">
            <div className="bg-white rounded-lg p-3 shadow-sm max-w-[240px] ml-auto">
              <p className="text-sm text-gray-800 whitespace-pre-wrap">{preview}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
        <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0" />
        <p className="text-xs text-yellow-700">Esta ação é irreversível. Confirme antes de prosseguir.</p>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}><ChevronLeft className="h-4 w-4" /> Voltar</Button>
        <Button onClick={() => onSubmit(sendNow ? null : scheduledAt)} loading={loading}>
          Confirmar Envio
        </Button>
      </div>
    </div>
  );
}

export default function CampaignWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [campaignName, setCampaignName] = useState('');
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [fileRef, setFileRef] = useState<File | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  // varMapping is an array: index i → column name for {{i+1}}
  const [varMapping, setVarMapping] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    fetch('/api/v2/accounts')
      .then(r => r.json())
      .then(setAccounts)
      .catch(console.error);
  }, []);

  React.useEffect(() => {
    if (!selectedPhone) return;
    setLoadingTemplates(true);
    fetch(`/api/v2/templates/${selectedPhone}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setTemplates(data); })
      .catch(console.error)
      .finally(() => setLoadingTemplates(false));
  }, [selectedPhone]);

  // Submit via multipart/form-data: file + meta JSON (controller expects this format)
  const handleSubmit = async (scheduledAt: string | null) => {
    if (!fileRef || !selectedTemplate) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', fileRef);
      formData.append('meta', JSON.stringify({
        name: campaignName,
        phone_number_id: selectedPhone,
        template_name: selectedTemplate.name,
        template_language: selectedTemplate.language,
        variable_mapping: varMapping,
        scheduled_at: scheduledAt ?? undefined,
      }));

      const res = await fetch('/api/v2/campaigns', { method: 'POST', body: formData });
      if (!res.ok) { const e = await res.json() as any; alert(e.error ?? 'Erro ao criar campanha'); return; }
      const data = await res.json() as any;
      navigate(`/painel/campanhas/${data.id}`);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-text-primary mb-6">Nova Campanha</h1>
      <StepIndicator current={step} />

      {step === 0 && (
        <Step1
          campaignName={campaignName}
          setCampaignName={setCampaignName}
          parsedData={parsedData}
          setParsedData={setParsedData}
          fileRef={fileRef}
          setFileRef={setFileRef}
          onNext={() => setStep(1)}
        />
      )}
      {step === 1 && (
        <Step2
          accounts={accounts}
          selectedPhone={selectedPhone}
          setSelectedPhone={setSelectedPhone}
          templates={templates}
          loadingTemplates={loadingTemplates}
          selectedTemplate={selectedTemplate}
          setSelectedTemplate={setSelectedTemplate}
          varMapping={varMapping}
          setVarMapping={setVarMapping}
          parsedData={parsedData}
          onBack={() => setStep(0)}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step3
          campaignName={campaignName}
          selectedPhone={selectedPhone}
          accounts={accounts}
          selectedTemplate={selectedTemplate}
          parsedData={parsedData}
          varMapping={varMapping}
          fileRef={fileRef}
          onBack={() => setStep(1)}
          onSubmit={handleSubmit}
          loading={submitting}
        />
      )}
    </div>
  );
}
