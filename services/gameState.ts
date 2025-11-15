import type { User, SharedGameState, GeneratedCard, GameMode, ScheduledGame } from '../types';
import { supabase } from './supabaseClient';

const GAME_STATE_ID = 'singleton'; // Use a fixed ID for our single row of state

class GameStateService {
  private state: SharedGameState;
  private listeners: Set<(state: SharedGameState) => void>;
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
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return Promise.resolve();

    // Fetch initial state from Supabase
    const { data, error } = await supabase
      .from('game_state')
      .select('state')
      .eq('id', GAME_STATE_ID)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = 'exact one row not found'
      console.error('Error fetching initial game state:', error);
      this.state = { ...this.initialState };
    } else if (data) {
      this.state = data.state;
    } else {
      // No state found, so create it
      console.log('No initial state found in DB, creating one.');
      this.state = { ...this.initialState };
      await this.updateState(this.state, true); // Force initial write
    }
    
    // Subscribe to real-time updates
    supabase
        .channel('game-state-changes')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'game_state', filter: `id=eq.${GAME_STATE_ID}` },
            (payload) => {
                this.state = (payload.new as any).state;
                this.notifyListeners();
            }
        )
        .subscribe();


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
  
  // --- Actions ---

  async registerUser(newUser: User): Promise<boolean> {
    if (this.state.users.some(u => u.name === newUser.name)) {
        return false;
    }
    await this.updateState({ users: [...this.state.users, newUser] });
    return true;
  }
  
  async login(name: string): Promise<void> {
     if (!this.state.onlineUsers.includes(name)) {
        await this.updateState({ onlineUsers: [...this.state.onlineUsers, name] });
    }
  }

  async logout(name: string): Promise<void> {
    await this.updateState({ onlineUsers: this.state.onlineUsers.filter(u => u !== name) });
  }

  async addCards(newCards: GeneratedCard[]): Promise<void> {
    await this.updateState({ generatedCards: [...this.state.generatedCards, ...newCards] });
  }

  async resetGame(): Promise<void> {
    await this.updateState({
        drawnNumbers: [],
        bingoWinner: null,
        isGameActive: false,
        preGameCountdown: null,
        gameStartingId: null,
        generatedCards: [], // Also clear cards on reset for a fresh game
        onlineUsers: [], // Clear online users as well
    });
  }

  async setGameMode(mode: GameMode): Promise<void> {
    await this.updateState({ gameMode: mode });
  }

  async addGame(startTime: string): Promise<void> {
     const newGame: ScheduledGame = { id: Date.now(), startTime };
     await this.updateState({ scheduledGames: [...this.state.scheduledGames, newGame] });
  }

  async removeGame(gameId: number): Promise<void> {
    await this.updateState({ scheduledGames: this.state.scheduledGames.filter(g => g.id !== gameId) });
  }
  
  async setGameStartingId(id: number | null): Promise<void> {
    await this.updateState({ gameStartingId: id });
  }

  async setPreGameCountdown(countdown: number | null): Promise<void> {
    await this.updateState({ preGameCountdown: countdown });
  }
  
  async startGame(gameId: number): Promise<void> {
      await this.updateState({
          isGameActive: true,
          preGameCountdown: null,
          scheduledGames: this.state.scheduledGames.filter(g => g.id !== gameId),
          gameStartingId: null,
      });
  }

  async addDrawnNumber(number: number): Promise<void> {
      await this.updateState({ drawnNumbers: [...this.state.drawnNumbers, number] });
  }

  async setWinner(winner: { cardId: string; playerName: string }): Promise<void> {
      await this.updateState({
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
  
  private async updateState(newState: Partial<SharedGameState>, isInitial: boolean = false): Promise<void> {
    const updatedState = { ...this.state, ...newState };
    this.state = updatedState; // Update locally immediately
    this.notifyListeners();

    if (isInitial) {
        const { error } = await supabase.from('game_state').insert({ id: GAME_STATE_ID, state: updatedState });
        if (error) console.error("Failed to create initial state in Supabase:", error);
    } else {
        const { error } = await supabase.from('game_state').update({ state: updatedState }).eq('id', GAME_STATE_ID);
        if (error) console.error("Failed to save state to Supabase:", error);
    }
  }
}

export const gameStateService = new GameStateService();
