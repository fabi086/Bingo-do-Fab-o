import type { User, SharedGameState, GeneratedCard, GameMode, ScheduledGame } from '../types';

class GameStateService {
  private state: SharedGameState;
  private readonly channel: BroadcastChannel;
  private listeners: Set<(state: SharedGameState) => void>;

  constructor() {
    this.state = this.loadStateFromLocalStorage();
    this.channel = new BroadcastChannel('bingo-game-state');
    this.listeners = new Set();

    this.channel.onmessage = (event) => {
      this.state = event.data;
      this.saveStateToLocalStorage();
      this.notifyListeners();
    };
  }

  // --- Public API for components ---

  subscribe(callback: (state: SharedGameState) => void): () => void {
    this.listeners.add(callback);
    // Return an unsubscribe function
    return () => this.listeners.delete(callback);
  }

  getState(): SharedGameState {
    return this.state;
  }

  // --- Authentication Actions ---
  
  registerUser(newUser: User): boolean {
    if (this.state.users.some(u => u.name === newUser.name)) {
        return false; // User already exists
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

  // --- Game Actions ---

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

  addDrawnNumber(number: number): void {
      this.updateState({ drawnNumbers: [...this.state.drawnNumbers, number] });
  }

  setWinner(winner: { cardId: string; playerName: string }): void {
      this.updateState({
          bingoWinner: winner,
          isGameActive: false,
          playerWins: {
              ...this.state.playerWins,
              [winner.playerName]: (this.state.playerWins[winner.playerName] || 0) + 1,
          }
      });
  }


  // --- Private methods ---

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback(this.state));
  }

  private updateState(newState: Partial<SharedGameState>): void {
    this.state = { ...this.state, ...newState };
    this.saveStateToLocalStorage();
    this.channel.postMessage(this.state);
    this.notifyListeners();
  }

  private saveStateToLocalStorage(): void {
    try {
      localStorage.setItem('bingoSharedState', JSON.stringify(this.state));
    } catch (error) {
      console.error("Failed to save shared state to localStorage:", error);
    }
  }

  private loadStateFromLocalStorage(): SharedGameState {
    try {
      const saved = localStorage.getItem('bingoSharedState');
      const initialState: SharedGameState = {
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
      };
      // On load, reset online users as we don't know who is actually online
      const loadedState = saved ? JSON.parse(saved) : initialState;
      loadedState.onlineUsers = []; 
      return loadedState;
    } catch (error) {
      console.error("Failed to load shared state from localStorage:", error);
      // Fallback to a clean initial state
      return {
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
      };
    }
  }
}

export const gameStateService = new GameStateService();
