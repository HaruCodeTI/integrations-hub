// src/frontend/components/TemplateBuilderModal.tsx
import React, { useState, useRef } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

interface ButtonItem {
  type: 'QUICK_REPLY' | 'URL' | 'COPY_CODE';
  text: string;
  url?: string;
  example?: string[];
}

interface TemplateBuilderModalProps {
  phoneNumberId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function TemplateBuilderModal({ phoneNumberId, onClose, onSuccess }: TemplateBuilderModalProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('MARKETING');
  const [language, setLanguage] = useState('pt_BR');
  const [header, setHeader] = useState('');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const [buttons, setButtons] = useState<ButtonItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = () => {
    const el = bodyRef.current;
    if (!el) return;
    const count = (body.match(/\{\{(\d+)\}\}/g) ?? []).length;
    const variable = `{{${count + 1}}}`;
    const pos = el.selectionStart;
    const newBody = body.slice(0, pos) + variable + body.slice(pos);
    setBody(newBody);
    setTimeout(() => { el.selectionStart = el.selectionEnd = pos + variable.length; el.focus(); }, 0);
  };

  const addButton = () => {
    if (buttons.length >= 3) return;
    setButtons(b => [...b, { type: 'QUICK_REPLY', text: '' }]);
  };

  const updateButton = (i: number, patch: Partial<ButtonItem>) => {
    setButtons(b => b.map((btn, j) => j === i ? { ...btn, ...patch } : btn));
  };

  const removeButton = (i: number) => {
    setButtons(b => b.filter((_, j) => j !== i));
  };

  const buildPreview = () => {
    let preview = body;
    const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
    matches.forEach((m, i) => { preview = preview.replace(m, `[variável ${i + 1}]`); });
    return preview;
  };

  const handleSubmit = async () => {
    setError('');
    if (!name || !body) { setError('Nome e corpo são obrigatórios'); return; }

    const components: object[] = [];
    if (header) components.push({ type: 'HEADER', format: 'TEXT', text: header });
    components.push({ type: 'BODY', text: body });
    if (footer) components.push({ type: 'FOOTER', text: footer });
    if (buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: buttons.map(b => {
          if (b.type === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.text };
          if (b.type === 'URL') return { type: 'URL', text: b.text, url: b.url };
          return { type: 'COPY_CODE', example: [b.example ?? ''] };
        }),
      });
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/v2/templates?phone_number_id=${phoneNumberId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, language, components }),
      });
      if (!res.ok) {
        const d = await res.json() as any;
        setError(d.error ?? 'Erro ao criar template');
        return;
      }
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold text-text-primary">Novo Template</h2>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body modal — 2 colunas */}
        <div className="flex flex-1 min-h-0">
          {/* Coluna esquerda: formulário */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 border-r border-border">
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Nome do template"
                value={name}
                onChange={e => setName(e.target.value.toLowerCase().replace(/\s/g, '_'))}
                placeholder="meu_template"
              />
              <Select label="Categoria" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="MARKETING">Marketing</option>
                <option value="UTILITY">Utilitário</option>
                <option value="AUTHENTICATION">Autenticação</option>
              </Select>
            </div>

            <Select label="Idioma" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="pt_BR">Português (BR)</option>
              <option value="en_US">English (US)</option>
              <option value="es">Español</option>
            </Select>

            <Input
              label="Cabeçalho (opcional)"
              value={header}
              onChange={e => setHeader(e.target.value)}
              placeholder="Título do template"
              maxLength={60}
            />

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-text-primary">Corpo *</label>
                <button
                  onClick={insertVariable}
                  className="text-xs text-primary hover:text-primary-dark font-medium"
                >
                  + Variável
                </button>
              </div>
              <textarea
                ref={bodyRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                maxLength={1024}
                placeholder="Olá {{1}}, sua mensagem aqui..."
                className="w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary resize-y min-h-[100px]"
              />
              <p className="text-xs text-text-tertiary text-right">{body.length}/1024</p>
            </div>

            <Input
              label="Rodapé (opcional)"
              value={footer}
              onChange={e => setFooter(e.target.value)}
              placeholder="Rodapé da mensagem"
              maxLength={60}
            />

            {/* Botões */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-text-primary">Botões (até 3)</label>
                {buttons.length < 3 && (
                  <button onClick={addButton} className="text-xs text-primary hover:text-primary-dark font-medium flex items-center gap-1">
                    <Plus className="h-3 w-3" /> Adicionar
                  </button>
                )}
              </div>
              {buttons.map((btn, i) => (
                <div key={i} className="border border-border rounded-lg p-3 mb-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={btn.type}
                      onChange={e => updateButton(i, { type: e.target.value as any })}
                      className="flex-1"
                    >
                      <option value="QUICK_REPLY">Resposta rápida</option>
                      <option value="URL">Acessar site</option>
                      <option value="COPY_CODE">Copiar código</option>
                    </Select>
                    <button onClick={() => removeButton(i)} className="text-red-500 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <Input
                    placeholder="Texto do botão"
                    value={btn.text}
                    onChange={e => updateButton(i, { text: e.target.value })}
                  />
                  {btn.type === 'URL' && (
                    <Input
                      placeholder="https://..."
                      value={btn.url ?? ''}
                      onChange={e => updateButton(i, { url: e.target.value })}
                    />
                  )}
                  {btn.type === 'COPY_CODE' && (
                    <Input
                      placeholder="Código de exemplo"
                      value={btn.example?.[0] ?? ''}
                      onChange={e => updateButton(i, { example: [e.target.value] })}
                    />
                  )}
                </div>
              ))}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>

          {/* Coluna direita: preview WhatsApp */}
          <div className="w-72 shrink-0 bg-bg-default p-6 overflow-y-auto">
            <p className="text-xs font-medium text-text-secondary mb-3 uppercase tracking-wide">Preview</p>
            <div className="bg-[#ECE5DD] rounded-xl p-3 min-h-[200px]">
              <div className="bg-white rounded-lg p-3 shadow-sm max-w-[220px] ml-auto">
                {header && <p className="font-semibold text-sm text-gray-900 mb-1">{header}</p>}
                <p className="text-sm text-gray-800 whitespace-pre-wrap">{buildPreview() || 'Corpo da mensagem...'}</p>
                {footer && <p className="text-xs text-gray-500 mt-1">{footer}</p>}
                {buttons.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                    {buttons.map((btn, i) => (
                      <button key={i} className="w-full text-center text-xs text-blue-500 font-medium py-1">
                        {btn.text || 'Botão'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer modal */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} loading={loading}>Criar Template</Button>
        </div>
      </div>
    </div>
  );
}
