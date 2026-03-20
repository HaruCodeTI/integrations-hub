// src/frontend/App.tsx
import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import NotFound from './pages/NotFound';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const ConversationList = lazy(() => import('./pages/conversations/ConversationList'));
const TemplateList = lazy(() => import('./pages/templates/TemplateList'));
const TemplateForm = lazy(() => import('./pages/templates/TemplateForm'));
const CampaignList = lazy(() => import('./pages/campaigns/CampaignList'));
const CampaignDetail = lazy(() => import('./pages/campaigns/CampaignDetail'));
const CampaignWizard = lazy(() => import('./pages/campaigns/CampaignWizard'));
const AccountList = lazy(() => import('./pages/accounts/AccountList'));
const Settings = lazy(() => import('./pages/settings/Settings'));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex h-screen items-center justify-center text-text-secondary text-sm">Carregando...</div>}>
        <Routes>
          <Route path="/painel" element={<Layout />}>
            <Route index element={<Navigate to="/painel/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="campanhas" element={<CampaignList />} />
            <Route path="campanhas/nova" element={<CampaignWizard />} />
            <Route path="campanhas/:id" element={<CampaignDetail />} />
            <Route path="templates" element={<TemplateList />} />
            <Route path="templates/novo" element={<TemplateForm />} />
            <Route path="conversas/*" element={<ConversationList />} />
            <Route path="contas" element={<AccountList />} />
            <Route path="configuracoes" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
