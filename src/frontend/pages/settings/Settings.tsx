// src/frontend/pages/settings/Settings.tsx
import React, { useState, useEffect } from 'react';
import { Copy, Check } from 'lucide-react';
import { Card } from '../../components/ui/Card';

interface Config {
  version: string;
  base_url: string;
  webhook_url: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available or denied
    }
  };
  return (
    <button onClick={copy} className="p-1.5 rounded hover:bg-bg-default text-text-tertiary transition-colors">
      {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card padding="lg">
      <h2 className="text-sm font-semibold text-text-primary mb-4">{title}</h2>
      <div className="space-y-3">{children}</div>
    </Card>
  );
}

function Field({ label, value, masked }: { label: string; value: string; masked?: boolean }) {
  const display = masked ? '••••••••' + value.slice(-4) : value;
  return (
    <div>
      <p className="text-xs text-text-secondary mb-1">{label}</p>
      <div className="flex items-center gap-2 bg-bg-default rounded-lg px-3 py-2">
        <code className="text-sm text-text-primary flex-1 min-w-0 truncate">{display}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

export default function Settings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/v2/config')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setConfig)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <div className="p-6 text-sm text-red-600">Erro ao carregar configurações: {error}</div>;
  if (!config) return <div className="p-6 text-sm text-text-secondary">Carregando...</div>;

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-text-primary">Configurações</h1>

      <Section title="Sistema">
        <Field label="Versão" value={config.version} />
        <Field label="URL Base" value={config.base_url} />
      </Section>

      <Section title="Webhook">
        <Field label="URL do Webhook" value={config.webhook_url} />
      </Section>
    </div>
  );
}
