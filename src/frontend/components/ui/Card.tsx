// src/frontend/components/ui/Card.tsx
import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  padding?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

const paddings = { sm: 'p-3', md: 'p-4', lg: 'p-6' };

export function Card({ children, className = '', hover, padding = 'md', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-border rounded-lg ${paddings[padding]} ${hover ? 'hover:shadow-md cursor-pointer transition-shadow' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
