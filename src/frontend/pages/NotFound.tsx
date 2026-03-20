import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="text-6xl mb-4">404</div>
      <div className="text-gray-500 mb-4">Pagina nao encontrada</div>
      <Link to="/painel/campanhas" className="text-blue-600 hover:underline text-sm">
        Voltar para campanhas
      </Link>
    </div>
  );
}
