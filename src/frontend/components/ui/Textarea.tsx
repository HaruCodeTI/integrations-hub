// src/frontend/components/ui/Textarea.tsx
import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  maxLength?: number;
}

export function Textarea({ label, error, maxLength, className = '', id, value, onChange, ...props }: TextareaProps) {
  const textareaId = id ?? label?.toLowerCase().replace(/\s/g, '-');
  const currentLength = typeof value === 'string' ? value.length : 0;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={textareaId} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        value={value}
        onChange={onChange}
        maxLength={maxLength}
        {...props}
        className={`border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-y min-h-[80px] ${error ? 'border-red-500' : ''} ${className}`}
      />
      <div className="flex justify-between">
        {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
        {maxLength && (
          <p className="text-xs text-text-tertiary">{currentLength}/{maxLength}</p>
        )}
      </div>
    </div>
  );
}
