import React from 'react';
import { Outlet, NavLink } from 'react-router-dom';

const NAV = [
  { to: '/painel/campanhas', label: 'Campanhas', icon: '📢' },
  { to: '/painel/templates', label: 'Templates', icon: '📋' },
  { to: '/painel/conversas', label: 'Conversas', icon: '💬' },
];

export default function Layout() {
  return (
    <div className="flex h-screen">
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <span className="font-bold text-indigo-600 text-sm">HaruCode</span>
          <span className="text-gray-400 text-xs ml-1">Painel</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
                }`
              }
            >
              <span>{item.icon}</span>{item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <a href="/admin" className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
            ⚙️ Admin
          </a>
        </div>
      </aside>
      <main className="flex-1 overflow-auto"><Outlet /></main>
    </div>
  );
}
