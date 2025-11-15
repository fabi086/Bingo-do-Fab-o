
import React from 'react';

interface InfoCardProps {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}

const InfoCard: React.FC<InfoCardProps> = ({ icon, title, children, className = '' }) => {
  return (
    <div className={`bg-white/10 backdrop-blur-sm p-6 rounded-2xl border border-white/20 shadow-lg ${className}`}>
      <div className="flex items-center gap-4 mb-4">
        <div className="text-3xl text-cyan-300">{icon}</div>
        <h2 className="text-2xl font-bold text-white tracking-wide">{title}</h2>
      </div>
      <div className="text-gray-200 space-y-2">
        {children}
      </div>
    </div>
  );
};

export default InfoCard;
