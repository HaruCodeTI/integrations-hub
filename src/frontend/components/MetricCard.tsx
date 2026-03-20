import React from 'react';

interface Props {
  label: string; value: number; total?: number;
  color: 'blue' | 'green' | 'purple' | 'red' | 'gray';
  icon: string; onClick?: () => void; active?: boolean;
}

const COLORS = { blue: 'bg-blue-600', green: 'bg-green-500', purple: 'bg-purple-500', red: 'bg-red-500', gray: 'bg-gray-600' };

export default function MetricCard({ label, value, total, color, icon, onClick, active }: Props) {
  const pct = total && total > 0 ? Math.round((value / total) * 100) : null;
  return (
    <button
      onClick={onClick}
      className={`flex-1 min-w-[140px] p-4 rounded-xl border-2 text-left ${active ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
    >
      <span className={`inline-flex items-center justify-center w-10 h-10 rounded-xl text-white text-lg ${COLORS[color]}`}>{icon}</span>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
      {pct !== null && <div className="text-xs text-gray-400 mt-0.5">{pct}%</div>}
    </button>
  );
}
