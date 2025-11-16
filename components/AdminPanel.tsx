import React, { useState, useEffect } from 'react';
import type { GameMode, ScheduledGame } from '../types';
import { gameStateService } from '../services/gameState';
import InfoCard from './InfoCard';

interface AdminPanelProps {
  onSwitchToPlayerView: () => void;
  onLogout: () => void;
  onResetGame: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onSwitchToPlayerView, onLogout, onResetGame }) => {
  const [gameState, setGameState] = useState(gameStateService.getState());
  const { gameMode, scheduledGames } = gameState;
  const [newGameTime, setNewGameTime] = useState('');

  useEffect(() => {
    const unsubscribe = gameStateService.subscribe(setGameState);
    return () => {
        if (unsubscribe) unsubscribe();
    };
  }, []);
  
  const handleAddGame = async () => {
    if (newGameTime) {
      await gameStateService.addGame(new Date(newGameTime).toISOString());
      setNewGameTime('');
    }
  };
  
  const sortedGames = [...scheduledGames].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

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
                onClick={onLogout}
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

        <InfoCard icon="🗓️" title="Agendar Jogos">
          <div className="space-y-4">
            <div>
              <label htmlFor="game-time" className="block text-sm font-medium text-gray-300 mb-2">
                Data e Hora do Novo Jogo:
              </label>
              <input
                id="game-time"
                type="datetime-local"
                value={newGameTime}
                onChange={(e) => setNewGameTime(e.target.value)}
                className="w-full bg-gray-700 text-white px-3 py-2 rounded-md border border-gray-600 focus:ring-2 focus:ring-sky-400 focus:outline-none"
              />
            </div>
            <button
              onClick={handleAddGame}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Agendar Novo Jogo
            </button>
             <button
              onClick={async () => await gameStateService.addGame(new Date(Date.now() + 30000).toISOString())}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
              Jogo Instantâneo (inicia em 30s)
            </button>
          </div>
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-2">Jogos Agendados:</h3>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {sortedGames.length > 0 ? sortedGames.map(game => (
                <li key={game.id} className="flex justify-between items-center bg-black/20 p-2 rounded-md">
                  <span className="font-medium">
                    {new Date(game.startTime).toLocaleString('pt-BR')}
                  </span>
                  <button onClick={async () => await gameStateService.removeGame(game.id)} className="text-red-400 hover:text-red-600 font-bold text-sm">
                    Remover
                  </button>
                </li>
              )) : <p className="text-gray-400">Nenhum jogo agendado.</p>}
            </ul>
          </div>
        </InfoCard>

        <InfoCard icon="🕹️" title="Controles da Sala">
            <button
                onClick={onResetGame}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
            >
                Reiniciar Jogo Atual
            </button>
        </InfoCard>
      </div>
    </div>
  );
};

export default AdminPanel;