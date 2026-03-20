import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import NotFound from './pages/NotFound';
import ConversationList from './pages/conversations/ConversationList';
import TemplateList from './pages/templates/TemplateList';
import TemplateForm from './pages/templates/TemplateForm';
import CampaignList from './pages/campaigns/CampaignList';
import CampaignDetail from './pages/campaigns/CampaignDetail';

// Placeholder for Task 19
const CampaignWizard = () => <div className="p-8 text-gray-500">Nova Campanha (plano 4 - tarefa 5)</div>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/painel" element={<Layout />}>
          <Route index element={<Navigate to="/painel/campanhas" replace />} />
          <Route path="campanhas" element={<CampaignList />} />
          <Route path="campanhas/nova" element={<CampaignWizard />} />
          <Route path="campanhas/:id" element={<CampaignDetail />} />
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
