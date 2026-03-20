// src/frontend/components/Sidebar.tsx
import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  MessageCircle,
  FileText,
  Megaphone,
  Smartphone,
  Settings,
} from 'lucide-react';

const NAV = [
  { to: '/painel/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/painel/conversas', label: 'Conversas', icon: MessageCircle },
  { to: '/painel/templates', label: 'Templates', icon: FileText },
  { to: '/painel/campanhas', label: 'Campanhas', icon: Megaphone },
  { to: '/painel/contas', label: 'Contas', icon: Smartphone },
  { to: '/painel/configuracoes', label: 'Configurações', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="w-56 bg-white border-r border-border flex flex-col shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <span className="font-bold text-primary text-sm">HaruCode</span>
        <span className="text-text-tertiary text-xs ml-1">Painel</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-primary-light text-primary font-semibold'
                  : 'text-text-secondary hover:bg-bg-default'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <a
          href="/admin"
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-text-tertiary hover:bg-bg-default transition-colors"
        >
          <Settings className="h-4 w-4 shrink-0" />
          Admin
        </a>
      </div>
    </aside>
  );
}
