// src/frontend/components/ui/Select.tsx
import React from 'react';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export function Select({ label, error, className = '', id, children, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s/g, '-');
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          {...props}
          className={`w-full border border-border rounded-lg px-3 py-2 text-sm text-text-primary appearance-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent bg-white pr-8 ${error ? 'border-red-500' : ''} ${className}`}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
