import React, { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, FileText, ImageOff, RefreshCw, Paperclip, X } from 'lucide-react';

function MessageTick({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck className="inline h-3.5 w-3.5 text-blue-500 ml-1 shrink-0" />;
  if (status === 'delivered') return <CheckCheck className="inline h-3.5 w-3.5 text-gray-400 ml-1 shrink-0" />;
  return <Check className="inline h-3.5 w-3.5 text-gray-400 ml-1 shrink-0" />;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  type: string;
  content: string;
  status: string;
  created_at: string;
}

interface Props { phoneId: string; contact: string; }

// ─── Constantes de validação de arquivo (client-side, UX apenas) ─────────────

const ACCEPTED_MIMES = [
  'image/jpeg', 'image/png', 'image/webp',
  'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/opus',
  'video/mp4', 'video/3gpp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const CLIENT_MIME_TO_TYPE: Record<string, string> = {
  'image/jpeg': 'image', 'image/png': 'image', 'image/webp': 'image',
  'audio/mp4': 'audio', 'audio/mpeg': 'audio', 'audio/ogg': 'audio', 'audio/opus': 'audio',
  'video/mp4': 'video', 'video/3gpp': 'video',
  'application/pdf': 'document', 'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'text/plain': 'document',
};

const CLIENT_SIZE_LIMITS: Record<string, number> = {
  image: 16 * 1024 * 1024, audio: 16 * 1024 * 1024,
  video: 16 * 1024 * 1024, document: 100 * 1024 * 1024,
};

function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Helpers de proxy ─────────────────────────────────────────────────────────

function proxyUrl(mediaId: string, phoneId: string, filename?: string) {
  const params = new URLSearchParams({ phoneNumberId: phoneId });
  if (filename) params.set('filename', filename);
  return `/api/v2/media/proxy/${mediaId}?${params}`;
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
      onClick={onClose}
    >
      <img
        src={src}
        className="max-h-[90vh] max-w-[90vw] object-contain rounded"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}

// ─── MediaMessage ─────────────────────────────────────────────────────────────

function MediaMessage({ type, mediaId, phoneId, caption, filename }: {
  type: 'image' | 'audio' | 'video' | 'document' | 'sticker';
  mediaId: string;
  phoneId: string;
  caption?: string;
  filename?: string;
}) {
  const [errored, setErrored] = useState<false | 'transient' | 'expired'>(false);
  const [lightbox, setLightbox] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const url = proxyUrl(mediaId, phoneId, filename) + `&_k=${retryKey}`;

  async function handleMediaError() {
    try {
      const res = await fetch(proxyUrl(mediaId, phoneId, filename));
      if (res.status === 404) {
        const body = await res.json().catch(() => ({})) as any;
        setErrored(body.expired ? 'expired' : 'transient');
      } else {
        setErrored('transient');
      }
    } catch {
      setErrored('transient');
    }
  }

  if (errored) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 bg-gray-50 rounded-lg border border-gray-200 min-w-[180px]">
        <ImageOff className="h-8 w-8 text-gray-300" />
        <span className="text-xs text-gray-400 text-center">
          {errored === 'expired' ? 'Mídia expirada' : 'Mídia indisponível'}
        </span>
        {errored === 'transient' && (
          <button
            onClick={() => { setErrored(false); setRetryKey(k => k + 1); }}
            className="text-xs text-blue-600 flex items-center gap-1 hover:underline"
          >
            <RefreshCw className="h-3 w-3" /> Tentar novamente
          </button>
        )}
      </div>
    );
  }

  if (type === 'image' || type === 'sticker') {
    return (
      <div>
        {lightbox && <Lightbox src={url} onClose={() => setLightbox(false)} />}
        <img
          src={url}
          onError={handleMediaError}
          onClick={() => type === 'image' && setLightbox(true)}
          className={`max-w-[240px] max-h-[240px] rounded-lg object-cover block ${type === 'image' ? 'cursor-pointer hover:opacity-90' : ''}`}
        />
        {caption && <p className="text-xs text-gray-500 mt-1">{caption}</p>}
      </div>
    );
  }

  if (type === 'audio') {
    return <audio controls src={url} onError={handleMediaError} className="w-60 h-10" />;
  }

  if (type === 'video') {
    return (
      <div>
        <video
          controls src={url} onError={handleMediaError}
          className="max-w-[280px] rounded-lg"
          style={{ aspectRatio: '16/9' }}
        />
        {caption && <p className="text-xs text-gray-500 mt-1">{caption}</p>}
      </div>
    );
  }

  if (type === 'document') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 text-sm text-blue-700"
      >
        <FileText className="h-5 w-5 shrink-0" />
        <span className="truncate max-w-[180px]">{filename ?? 'Documento'}</span>
      </a>
    );
  }

  return null;
}

// ─── ConversationView ─────────────────────────────────────────────────────────

export default function ConversationView({ phoneId, contact }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const url = `/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`;
    fetch(url, { signal: controller.signal })
      .then(r => r.json())
      .then(setMessages)
      .catch(() => {});
    const timer = setInterval(() => {
      fetch(url, { signal: controller.signal })
        .then(r => r.json()).then(setMessages).catch(() => {});
    }, 3000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [phoneId, contact]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Renderiza o corpo da mensagem — suporta texto e mídia, retrocompatível com formato antigo
  function renderBody(content: string): React.ReactNode {
    try {
      const c = JSON.parse(content);

      // Retrocompatibilidade: mensagens antigas sem campo 'type' mas com text.body
      if (!c?.type && c?.text?.body !== undefined) {
        return <span>{c.text.body}</span>;
      }

      const type = c?.type;
      if (type === 'text') return <span>{c.text?.body ?? ''}</span>;

      const mediaTypes = ['image', 'audio', 'video', 'document', 'sticker'] as const;
      type MediaType = typeof mediaTypes[number];
      if (mediaTypes.includes(type as MediaType)) {
        const block = c[type];
        return (
          <MediaMessage
            type={type as MediaType}
            mediaId={block?.id ?? ''}
            phoneId={phoneId}
            caption={block?.caption}
            filename={block?.filename}
          />
        );
      }

      return <span className="italic text-gray-400">[{type ?? 'mídia'}]</span>;
    } catch {
      return <span className="italic text-gray-400">[conteúdo]</span>;
    }
  }

  function handleFileSelect(file: File) {
    if (!ACCEPTED_MIMES.includes(file.type)) {
      setError(`Tipo de arquivo não suportado: ${file.type}`);
      return;
    }
    const mediaType = CLIENT_MIME_TO_TYPE[file.type];
    const limit = CLIENT_SIZE_LIMITS[mediaType] ?? 16 * 1024 * 1024;
    if (file.size > limit) {
      setError(`Arquivo excede o limite de ${formatBytes(limit)}`);
      return;
    }
    setAttachment(file);
    setError(null);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  async function sendMessage() {
    const hasText = text.trim().length > 0;
    const hasFile = !!attachment;
    if (!hasText && !hasFile) return;

    const caption = hasFile && hasText ? text.trim() : undefined;
    const textBody = !hasFile ? text.trim() : '';

    setText('');
    setSending(true);
    setError(null);

    // Optimistic update: para mídia, mostra placeholder em vez de tentar renderizar
    // a mídia antes de ter o media_id — evita request inválido ao proxy
    const tempId = `temp-${Date.now()}`;
    const tempContent = hasFile
      ? JSON.stringify({ type: 'text', text: { body: '⏳ Enviando mídia…' } })
      : JSON.stringify({ type: 'text', text: { body: textBody } });

    const tempMsg: Message = {
      id: tempId,
      direction: 'outbound',
      type: 'text',
      content: tempContent,
      status: 'sent',
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMsg]);

    try {
      let sendBody: Record<string, any>;

      if (hasFile) {
        setUploading(true);
        setUploadProgress(0);

        const form = new FormData();
        form.append('file', attachment!);
        form.append('phoneNumberId', phoneId);

        const uploadResult = await new Promise<{
          media_id: string; type: string; filename: string;
        }>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', '/api/v2/media/upload');
          xhr.upload.onprogress = e => {
            if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              try {
                reject(new Error(JSON.parse(xhr.responseText)?.error ?? 'Falha no upload'));
              } catch {
                reject(new Error('Falha no upload'));
              }
            }
          };
          xhr.onerror = () => reject(new Error('Erro de conexão'));
          xhr.send(form);
        });

        setUploading(false);
        // Não limpa o attachment ainda — só limpa após a confirmação do envio
        sendBody = {
          type: uploadResult.type,
          media_id: uploadResult.media_id,
          filename: uploadResult.filename,
          ...(caption ? { caption } : {}),
        };
      } else {
        sendBody = { message: textBody };
      }

      const res = await fetch(
        `/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sendBody) },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as any;
        setError(err.error ?? 'Erro ao enviar mensagem');
        setMessages(prev => prev.filter(m => m.id !== tempId));
        return;
      }

      setAttachment(null);
      const updated = await fetch(`/api/v2/conversations/${phoneId}/${encodeURIComponent(contact)}`).then(r => r.json());
      setMessages(updated);

    } catch (err: any) {
      setError(err.message ?? 'Erro de conexão');
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setUploading(false);
    } finally {
      setSending(false);
      setUploadProgress(0);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white">
        <div className="font-medium">{contact}</div>
      </div>

      {/* Mensagens */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs px-3 py-2 rounded-2xl text-sm ${
              msg.direction === 'outbound' ? 'bg-green-100 text-gray-800' : 'bg-white border border-gray-200 text-gray-800'
            }`}>
              <div>{renderBody(msg.content)}</div>
              <div className="text-xs text-gray-400 mt-1 flex items-center justify-end gap-0.5">
                {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {msg.direction === 'outbound' && <MessageTick status={msg.status} />}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Drag & drop wrapper */}
      <div
        className="flex flex-col"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Preview do anexo pendente */}
        {attachment && (
          <div className="px-4 pt-3 pb-2 bg-gray-50 border-t border-gray-200">
            <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-3 py-2">
              <FileText className="h-5 w-5 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 truncate">{attachment.name}</p>
                <p className="text-xs text-gray-400">{formatBytes(attachment.size)}</p>
              </div>
              {uploading ? (
                <div className="w-20 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAttachment(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Erro de envio */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200 text-red-600 text-xs">{error}</div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-gray-200 bg-white flex gap-2 items-center">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIMES.join(',')}
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFileSelect(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 shrink-0"
            title="Anexar arquivo"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder={attachment ? 'Adicionar legenda…' : 'Digite uma mensagem...'}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={uploading}
          />
          <button
            onClick={sendMessage}
            disabled={sending || uploading || (!text.trim() && !attachment)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50"
          >
            {uploading ? `${uploadProgress}%` : sending ? '…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );
}
