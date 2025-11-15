
import React from 'react';

interface BingoBallProps {
  letter: string;
  color: string;
  className?: string;
}

const BingoBall: React.FC<BingoBallProps> = ({ letter, color, className = '' }) => {
  return (
    <div
      className={`relative flex items-center justify-center rounded-full text-white font-black shadow-lg transition-transform duration-300 hover:scale-110 ${className}`}
      style={{ background: `radial-gradient(circle at 35% 35%, #ffffff, ${color} 70%)` }}
    >
      <span className="z-10 text-shadow" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>{letter}</span>
      <div className="absolute top-1/4 left-1/4 w-1/4 h-1/4 bg-white opacity-40 rounded-full blur-sm"></div>
    </div>
  );
};

export default BingoBall;
