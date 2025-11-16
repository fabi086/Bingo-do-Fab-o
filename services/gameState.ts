import type { User, SharedGameState, GeneratedCard, GameMode, Reaction } from '../types';
import { supabase } from './supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

const TABLE_NAME = 'game_state';
const ROW_ID = 'singleton'; // Using a single row to store the entire game state

// This utility function must be kept in sync with App.tsx
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
      }
    }
    return null;
};


class GameStateService {
  private state: SharedGameState;
  private listeners: Set<(state: SharedGameState) => void>;
  private channel: RealtimeChannel | null = null;

  private initialState: SharedGameState = {
    users: [{ name: 'admin', password: 'admin', pixKey: 'admin' }],
    onlineUsers: [],
    generatedCards: [],
    drawnNumbers: [],
    isGameActive: false,
    bingoWinner: null,
    playerWins: {},
    gameMode: 'line',
    preGameCountdown: null,
    playerPreferences: {},
    invalidBingoClaim: null,
    lastReaction: null,
  };

  constructor() {
    this.state = { ...this.initialState };
    this.listeners = new Set();
  }

  async initialize(): Promise<void> {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('state')
        .eq('id', ROW_ID)
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116: "exact one row not found"
      console.error('Error fetching game state:', error);
      this.state = { ...this.initialState };
    } else if (data) {
        this.state = { ...this.initialState, ...data.state };
    } else {
      // No state found, so create it
      this.state = { ...this.initialState };
      await this.updateState(this.state, true); // Force full state update
    }

    this.notifyListeners();
    this.setupRealtimeSubscription();
  }
  
  cleanup(): void {
    if (this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
    }
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

  async setGameMode(mode: GameMode): Promise<void> {
    await this.updateState({ gameMode: mode });
  }

  async setPreGameCountdown(countdown: number | null): Promise<void> {
    await this.updateState({ preGameCountdown: countdown });
  }
  
  async startGame(): Promise<void> {
      await this.updateState({
          isGameActive: true,
          preGameCountdown: null,
      });
  }

  async startNextGameCycle(): Promise<void> {
    // Resets the game and starts a countdown for the next one.
    await this.updateState({
        drawnNumbers: [],
        bingoWinner: null,
        isGameActive: false,
        preGameCountdown: 20, // Start a 20-second countdown
        generatedCards: [],
        playerPreferences: {},
        invalidBingoClaim: null,
        lastReaction: null,
    });
  }

  async drawNextNumber(): Promise<void> {
    const { drawnNumbers, isGameActive, bingoWinner } = this.state;
    if (drawnNumbers.length >= 75 || !isGameActive || bingoWinner) {
      return;
    }

    let newNumber;
    const drawnSet = new Set(drawnNumbers);
    do {
      newNumber = Math.floor(Math.random() * 75) + 1;
    } while (drawnSet.has(newNumber));

    await this.updateState({ drawnNumbers: [...drawnNumbers, newNumber], invalidBingoClaim: null });
  }

  async setWinner(winner: { cardId: string; playerName: string }): Promise<void> {
      await this.updateState({
          bingoWinner: winner,
          isGameActive: false,
          invalidBingoClaim: null,
          playerWins: {
              ...this.state.playerWins,
              [winner.playerName]: (this.state.playerWins[winner.playerName] || 0) + 1,
          }
      });
  }
  
  async setPlayerPreference(playerName: string, preference: 'auto' | 'manual'): Promise<void> {
    await this.updateState({
        playerPreferences: {
            ...this.state.playerPreferences,
            [playerName]: preference,
        }
    });
  }

  async claimBingo(playerName: string, cardId: string, drawnNumbers: Set<number>, gameMode: GameMode): Promise<void> {
    if (this.state.bingoWinner || this.state.invalidBingoClaim?.playerName === playerName) return;

    const claimedCard = this.state.generatedCards.find(c => c.id === cardId && c.owner === playerName);
    if (!claimedCard) return;

    const isWinner = checkForWinner([claimedCard], drawnNumbers, gameMode);

    if (isWinner) {
        await this.setWinner({ cardId, playerName });
    } else {
        await this.updateState({ invalidBingoClaim: { playerName, timestamp: Date.now() } });
        
        setTimeout(async () => {
            // Check if the claim is still the same one before clearing
            const currentState = this.getState();
            if (currentState.invalidBingoClaim?.playerName === playerName) {
                await this.clearInvalidBingoClaim();
            }
        }, 5000);
    }
  }
  
  async clearInvalidBingoClaim(): Promise<void> {
    await this.updateState({ invalidBingoClaim: null });
  }

  async triggerReaction(type: Reaction['type']): Promise<void> {
    await this.updateState({ lastReaction: { type, timestamp: Date.now() } });
  }


  // --- Private methods ---
  private setupRealtimeSubscription(): void {
    if (this.channel) return;

    this.channel = supabase
        .channel('game_state_channel')
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: TABLE_NAME, filter: `id=eq.${ROW_ID}` },
            (payload) => {
                const newState = (payload.new as { state: SharedGameState }).state;
                if (JSON.stringify(this.state) !== JSON.stringify(newState)) {
                    this.state = newState;
                    this.notifyListeners();
                }
            }
        )
        .subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
                console.log('Connected to real-time channel!');
            }
            if (err) {
                console.error('Real-time subscription error:', err);
            }
        });
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback(this.state));
  }
  
  private async updateState(newState: Partial<SharedGameState>, isFullState = false): Promise<void> {
    const updatedState = isFullState ? (newState as SharedGameState) : { ...this.state, ...newState };
    this.state = updatedState;
    
    const { error } = await supabase
        .from(TABLE_NAME)
        .upsert({ id: ROW_ID, state: updatedState });

    if (error) {
      console.error('Failed to save state to Supabase:', error);
    }

    // Notify local listeners immediately for better responsiveness.
    // Other clients will be notified by the real-time subscription.
    this.notifyListeners();
  }
}

export const gameStateService = new GameStateService();