import type { User, SharedGameState, GeneratedCard, GameMode, ScheduledGame } from '../types';

const GAME_STATE_KEY = 'bingoGameState';

class GameStateService {
  private state: SharedGameState;
  private listeners: Set<(state: SharedGameState) => void>;
  private channel: BroadcastChannel;
  private isInitialized = false;

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
  };

  constructor() {
    this.state = { ...this.initialState };
    this.listeners = new Set();
    this.channel = new BroadcastChannel('bingo-game-state');
    
    this.channel.onmessage = (event) => {
      // Received an update from another tab
      this.state = event.data;
      this.notifyListeners();
    };
  }

  initialize(): Promise<void> {
    if (this.isInitialized) return Promise.resolve();

    try {
        const storedState = localStorage.getItem(GAME_STATE_KEY);
        if (storedState) {
            this.state = JSON.parse(storedState);
        } else {
            // No state in storage, so let's use the initial one and save it
            this.state = { ...this.initialState };
            localStorage.setItem(GAME_STATE_KEY, JSON.stringify(this.state));
        }
    } catch (error) {
        console.error("Error loading state from localStorage:", error);
        this.state = { ...this.initialState };
    }
    
    this.isInitialized = true;
    this.notifyListeners(); // Notify with the loaded state
    return Promise.resolve();
  }

  // --- Public API for components ---

  subscribe(callback: (state: SharedGameState) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  getState(): SharedGameState {
    return this.state;
  }

  // --- Authentication Actions ---
  
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
    const updatedState = { ...this.state, ...newState };
    this.state = updatedState; // Update locally first
    
    try {
        localStorage.setItem(GAME_STATE_KEY, JSON.stringify(updatedState));
        this.channel.postMessage(updatedState); // Broadcast to other tabs
    } catch (error) {
        console.error("Failed to save state to localStorage:", error);
    }
    
    // Notify local listeners immediately
    this.notifyListeners();
  }
}

export const gameStateService = new GameStateService();
