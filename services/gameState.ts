import type { User, SharedGameState, GeneratedCard, GameMode, ScheduledGame } from '../types';

const GAME_STATE_KEY = 'bingoGameState';

// This utility function must be kept in sync between App.tsx and AdminPanel.tsx
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


class GameStateService {
  private state: SharedGameState;
  private listeners: Set<(state: SharedGameState) => void>;
  private channel: BroadcastChannel;

  private initialState: SharedGameState = {
    users: [{ name: 'admin', password: 'admin', pixKey: 'admin' }],
    onlineUsers: [],
    generatedCards: [],
    drawnNumbers: [],
    isGameActive: false,
    bingoWinner: null,
    playerWins: {},
    gameMode: 'line',
    scheduledGames: [],
    preGameCountdown: null,
    gameStartingId: null,
    playerPreferences: {},
    invalidBingoClaim: null,
  };

  constructor() {
    this.state = { ...this.initialState };
    this.listeners = new Set();
    this.channel = new BroadcastChannel('bingo-game-state-channel');

    // Listen for updates from other tabs
    this.channel.onmessage = (event) => {
      if (JSON.stringify(this.state) !== JSON.stringify(event.data)) {
         this.state = event.data;
         this.notifyListeners();
      }
    };
  }

  initialize(): void {
    try {
      const storedState = localStorage.getItem(GAME_STATE_KEY);
      if (storedState) {
        const parsedState = JSON.parse(storedState);
        const validatedState = { ...this.initialState, ...parsedState };
        this.state = validatedState;
      } else {
        this.state = { ...this.initialState };
        localStorage.setItem(GAME_STATE_KEY, JSON.stringify(this.state));
      }
    } catch (error) {
      console.error('Failed to load state from localStorage:', error);
      this.state = { ...this.initialState };
    }
    this.notifyListeners();
  }
  
  // --- Public API for components ---

  subscribe(callback: (state: SharedGameState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getState(): SharedGameState {
    return this.state;
  }
  
  // --- Actions ---

  registerUser(newUser: User): boolean {
    if (this.state.users.some(u => u.name === newUser.name)) {
        return false;
    }
    this.updateState({ users: [...this.state.users, newUser] });
    return true;
  }
  
  login(name: string): void {
     if (!this.state.onlineUsers.includes(name)) {
        this.updateState({ onlineUsers: [...this.state.onlineUsers, name] });
    }
  }

  logout(name: string): void {
    this.updateState({ onlineUsers: this.state.onlineUsers.filter(u => u !== name) });
  }

  addCards(newCards: GeneratedCard[]): void {
    this.updateState({ generatedCards: [...this.state.generatedCards, ...newCards] });
  }

  resetGame(): void {
    this.updateState({
        drawnNumbers: [],
        bingoWinner: null,
        isGameActive: false,
        preGameCountdown: null,
        gameStartingId: null,
        generatedCards: [],
        onlineUsers: [],
        playerWins: {},
        playerPreferences: {},
        invalidBingoClaim: null,
    });
  }

  setGameMode(mode: GameMode): void {
    this.updateState({ gameMode: mode });
  }

  addGame(startTime: string): void {
     const newGame: ScheduledGame = { id: Date.now(), startTime };
     this.updateState({ scheduledGames: [...this.state.scheduledGames, newGame] });
  }

  removeGame(gameId: number): void {
    this.updateState({ scheduledGames: this.state.scheduledGames.filter(g => g.id !== gameId) });
  }
  
  setGameStartingId(id: number | null): void {
    this.updateState({ gameStartingId: id });
  }

  setPreGameCountdown(countdown: number | null): void {
    this.updateState({ preGameCountdown: countdown });
  }
  
  startGame(gameId: number): void {
      this.updateState({
          isGameActive: true,
          preGameCountdown: null,
          scheduledGames: this.state.scheduledGames.filter(g => g.id !== gameId),
          gameStartingId: null,
      });
  }

  drawNextNumber(): void {
    const { drawnNumbers, isGameActive, bingoWinner } = this.state;
    if (drawnNumbers.length >= 75 || !isGameActive || bingoWinner) {
      return;
    }

    let newNumber;
    const drawnSet = new Set(drawnNumbers);
    do {
      newNumber = Math.floor(Math.random() * 75) + 1;
    } while (drawnSet.has(newNumber));

    this.updateState({ drawnNumbers: [...drawnNumbers, newNumber], invalidBingoClaim: null });
  }

  setWinner(winner: { cardId: string; playerName: string }): void {
      this.updateState({
          bingoWinner: winner,
          isGameActive: false,
          invalidBingoClaim: null,
          playerWins: {
              ...this.state.playerWins,
              [winner.playerName]: (this.state.playerWins[winner.playerName] || 0) + 1,
          }
      });
  }
  
  setPlayerPreference(playerName: string, preference: 'auto' | 'manual'): void {
    this.updateState({
        playerPreferences: {
            ...this.state.playerPreferences,
            [playerName]: preference,
        }
    });
  }

  claimBingo(playerName: string, cardId: string, drawnNumbers: Set<number>, gameMode: GameMode): void {
    // Prevent claims after game ends or if another claim is active for this player
    if (this.state.bingoWinner || this.state.invalidBingoClaim?.playerName === playerName) return;

    const claimedCard = this.state.generatedCards.find(c => c.id === cardId && c.owner === playerName);
    if (!claimedCard) return; // Card not found or doesn't belong to player

    const isWinner = checkForWinner([claimedCard], drawnNumbers, gameMode);

    if (isWinner) {
        this.setWinner({ cardId, playerName });
    } else {
        // It's a false alarm: set the claim and schedule its removal
        this.updateState({ invalidBingoClaim: { playerName, timestamp: Date.now() } });
        
        setTimeout(() => {
            // Only clear it if it's still the same user's claim, to avoid race conditions
            if (this.state.invalidBingoClaim?.playerName === playerName) {
                this.clearInvalidBingoClaim();
            }
        }, 5000); // Cooldown period of 5 seconds
    }
  }
  
  clearInvalidBingoClaim(): void {
    this.updateState({ invalidBingoClaim: null });
  }


  // --- Private methods ---

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback(this.state));
  }
  
  private updateState(newState: Partial<SharedGameState>): void {
    const updatedState = { ...this.state, ...newState };
    this.state = updatedState;
    
    try {
      localStorage.setItem(GAME_STATE_KEY, JSON.stringify(updatedState));
      this.channel.postMessage(updatedState);
    } catch (error) {
      console.error('Failed to save or broadcast state:', error);
    }

    this.notifyListeners();
  }
}

export const gameStateService = new GameStateService();