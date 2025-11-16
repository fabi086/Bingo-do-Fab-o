import React, { useState, useEffect } from 'react';
import type { GameMode } from '../types';
import { gameStateService } from '../services/gameState';
import InfoCard from './InfoCard';

interface AdminPanelProps {
  onSwitchToPlayerView: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onSwitchToPlayerView }) => {
  const [gameState, setGameState] = useState(gameStateService.getState());
  const { gameMode } = gameState;

  useEffect(() => {
    const unsubscribe = gameStateService.subscribe(setGameState);
    return () => {
        if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleLogout = () => {
    const currentUser = gameStateService.getState().users.find(u => u.name === 'admin');
    if (currentUser) {
        gameStateService.logout(currentUser.name);
    }
    // Note: The actual logout (clearing local storage) happens in the App component
  };
  
  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-2xl space-y-8 relative">
        <div className="absolute top-0 right-0 flex gap-2">
            <button
                onClick={onSwitchToPlayerView}
                className="bg-blue-500/80 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-lg text-sm transition-colors flex items-center gap-2"
                aria-label="Ver o jogo como jogador"
            >
                Ver Jogo
            </button>
            <button
                onClick={handleLogout}
                className="bg-red-500/80 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg text-sm transition-colors flex items-center gap-2"
                aria-label="Sair do sistema"
            >
                Sair
            </button>
        </div>

        <h1 className="text-4xl font-black text-center text-sky-300 pt-12 sm:pt-0">Painel do Administrador</h1>
        
        <InfoCard icon="⚙️" title="Modo de Jogo">
          <div className="flex justify-around p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="gameMode" 
                value="line" 
                checked={gameMode === 'line'} 
                onChange={async () => await gameStateService.setGameMode('line')}
                className="form-radio h-5 w-5 text-sky-500 bg-gray-700 border-gray-600 focus:ring-sky-600"
              />
              <span className="text-lg font-semibold">Linha / Vertical</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="gameMode" 
                value="full" 
                checked={gameMode === 'full'} 
                onChange={async () => await gameStateService.setGameMode('full')}
                className="form-radio h-5 w-5 text-sky-500 bg-gray-700 border-gray-600 focus:ring-sky-600"
              />
              <span className="text-lg font-semibold">Cartela Cheia</span>
            </label>
          </div>
        </InfoCard>

        <InfoCard icon="🕹️" title="Controles da Sala">
            <button
                onClick={async () => await gameStateService.startNextGameCycle()}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
                Iniciar Novo Jogo
            </button>
        </InfoCard>
      </div>
    </div>
  );
};

export default AdminPanel;