import React, { useState, useEffect, useMemo } from 'react';
import type { GameMode, ScheduledGame, GeneratedCard } from '../types';
import { gameStateService } from '../services/gameState';
import InfoCard from './InfoCard';

// This function must be kept in sync with the one in App.tsx
const checkForWinner = (cards: GeneratedCard[], numbers: Set<number>, mode: GameMode) => {
    for (const card of cards) {
      const { B, I, N, G, O } = card.cardData;
      const allNumbersOnCard = [...B, ...I, ...N, ...G, ...O].filter(n => typeof n === 'number') as number[];
      
      const checkLine = (line: (number | string)[]) => line.every(num => num === 'LIVRE' || numbers.has(num as number));
      
      if (mode === 'full') {
        if (allNumbersOnCard.every(num => numbers.has(num))) return { cardId: card.id, playerName: card.owner };
      } else {
        const columns = [B, I, N, G, O];
        for(const col of columns) if(checkLine(col)) return { cardId: card.id, playerName: card.owner };
        for (let i = 0; i < 5; i++) {
            const row = columns.map(col => col[i]);
            if (checkLine(row)) return { cardId: card.id, playerName: card.owner };
        }
        const diag1 = [B[0], I[1], N[2], G[3], O[4]];
        const diag2 = [B[4], I[3], N[2], G[1], O[0]];
        if (checkLine(diag1) || checkLine(diag2)) return { cardId: card.id, playerName: card.owner };
      }
    }
    return null;
};

interface AdminPanelProps {
  onSwitchToPlayerView: () => void;
  onLogout: () => void;
  onResetGame: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ onSwitchToPlayerView, onLogout, onResetGame }) => {
  const [gameState, setGameState] = useState(gameStateService.getState());
  const { gameMode, scheduledGames, isGameActive, bingoClaim, generatedCards, drawnNumbers } = gameState;
  const [newGameTime, setNewGameTime] = useState('');

  useEffect(() => {
    const unsubscribe = gameStateService.subscribe(setGameState);
    return unsubscribe;
  }, []);
  
  // Automatically switch to player view when the game starts
  useEffect(() => {
    if (isGameActive) {
      onSwitchToPlayerView();
    }
  }, [isGameActive, onSwitchToPlayerView]);

  const handleAddGame = () => {
    if (newGameTime) {
      gameStateService.addGame(new Date(newGameTime).toISOString());
      setNewGameTime('');
    }
  };

  const isClaimValid = useMemo(() => {
    if (!bingoClaim) return null;
    const claimedCard = generatedCards.find(c => c.id === bingoClaim.cardId);
    if (!claimedCard) return false;
    return !!checkForWinner([claimedCard], new Set(drawnNumbers), gameMode);
  }, [bingoClaim, generatedCards, drawnNumbers, gameMode]);

  const handleConfirmBingo = () => {
    if (bingoClaim) {
        gameStateService.setWinner({ cardId: bingoClaim.cardId, playerName: bingoClaim.playerName });
    }
  }

  const handleRejectBingo = () => {
    gameStateService.clearBingoClaim();
  }
  
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

        {bingoClaim && (
            <InfoCard icon="❓" title="Verificação de BINGO">
                <div className="text-center p-4 bg-yellow-900/50 rounded-lg">
                    <p className="text-lg">O jogador <span className="font-bold text-yellow-300">{bingoClaim.playerName}</span> gritou BINGO!</p>
                    <p className={`text-2xl font-bold mt-2 ${isClaimValid ? 'text-green-400' : 'text-red-400'}`}>
                        Status: {isClaimValid ? 'BINGO VÁLIDO!' : 'BINGO INVÁLIDO'}
                    </p>
                    <div className="flex gap-4 mt-4 justify-center">
                        <button onClick={handleConfirmBingo} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                            Confirmar Vencedor
                        </button>
                        <button onClick={handleRejectBingo} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-6 rounded-lg transition-colors">
                            Rejeitar
                        </button>
                    </div>
                </div>
            </InfoCard>
        )}
        
        <InfoCard icon="⚙️" title="Modo de Jogo">
          <div className="flex justify-around p-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="gameMode" 
                value="line" 
                checked={gameMode === 'line'} 
                onChange={() => gameStateService.setGameMode('line')}
                className="form-radio h-5 w-5 text-sky-500 bg-gray-700 border-gray-600 focus:ring-sky-600"
              />
              <span className="text-lg font-semibold">Linha / Vertical / Diagonal</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" 
                name="gameMode" 
                value="full" 
                checked={gameMode === 'full'} 
                onChange={() => gameStateService.setGameMode('full')}
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
              onClick={() => gameStateService.addGame(new Date(Date.now() + 30000).toISOString())}
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
                  <button onClick={() => gameStateService.removeGame(game.id)} className="text-red-400 hover:text-red-600 font-bold text-sm">
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
