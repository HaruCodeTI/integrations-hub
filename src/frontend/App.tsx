import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import NotFound from './pages/NotFound';
import ConversationList from './pages/conversations/ConversationList';
import TemplateList from './pages/templates/TemplateList';
import TemplateForm from './pages/templates/TemplateForm';

// Placeholders substituidos nos planos 3-4
const CampaignList = () => <div className="p-8 text-gray-500">Campanhas (plano 4)</div>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/painel" element={<Layout />}>
          <Route index element={<Navigate to="/painel/campanhas" replace />} />
          <Route path="campanhas/*" element={<CampaignList />} />
          <Route path="templates" element={<TemplateList />} />
          <Route path="templates/novo" element={<TemplateForm />} />
          <Route path="conversas/*" element={<ConversationList />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
