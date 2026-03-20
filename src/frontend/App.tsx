import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import NotFound from './pages/NotFound';

// Placeholders substituidos nos planos 2-4
const ConversationList = () => <div className="p-8 text-gray-500">Conversas (plano 2)</div>;
const TemplateList = () => <div className="p-8 text-gray-500">Templates (plano 3)</div>;
const CampaignList = () => <div className="p-8 text-gray-500">Campanhas (plano 4)</div>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/painel" element={<Layout />}>
          <Route index element={<Navigate to="/painel/campanhas" replace />} />
          <Route path="campanhas/*" element={<CampaignList />} />
          <Route path="templates/*" element={<TemplateList />} />
          <Route path="conversas/*" element={<ConversationList />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
