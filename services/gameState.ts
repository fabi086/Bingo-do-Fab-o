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
       const { error: upsertError } = await supabase
        .from(TABLE_NAME)
        .upsert({ id: ROW_ID, state: this.state });
       if (upsertError) console.error('Failed to create initial state:', upsertError);
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
    let success = false;
    await this.fetchAndApplyUpdate(current => {
        if (current.users.some(u => u.name === newUser.name)) {
            success = false;
            return null; // No update
        }
        success = true;
        return { users: [...current.users, newUser] };
    });
    return success;
  }
  
  async login(name: string): Promise<void> {
     await this.fetchAndApplyUpdate(current => {
        if (!current.onlineUsers.includes(name)) {
            return { onlineUsers: [...current.onlineUsers, name] };
        }
        return null; // No update needed
    });
  }

  async logout(name: string): Promise<void> {
    await this.fetchAndApplyUpdate(current => {
        if (current.onlineUsers.includes(name)) {
            return { onlineUsers: current.onlineUsers.filter(u => u !== name) };
        }
        return null;
    });
  }

  async addCards(newCards: GeneratedCard[]): Promise<void> {
    await this.fetchAndApplyUpdate(current => ({ 
        generatedCards: [...current.generatedCards, ...newCards] 
    }));
  }

  async setGameMode(mode: GameMode): Promise<void> {
    await this.fetchAndApplyUpdate(() => ({ gameMode: mode }));
  }

  async setPreGameCountdown(countdown: number | null): Promise<void> {
    await this.fetchAndApplyUpdate(() => ({ preGameCountdown: countdown }));
  }
  
  async startGame(): Promise<void> {
      await this.fetchAndApplyUpdate(() => ({
          isGameActive: true,
          preGameCountdown: null,
      }));
  }

  async startNextGameCycle(): Promise<void> {
    await this.fetchAndApplyUpdate(() => ({
        drawnNumbers: [],
        bingoWinner: null,
        isGameActive: false,
        preGameCountdown: 20, // Start a 20-second countdown
        generatedCards: [],
        playerPreferences: {},
        invalidBingoClaim: null,
        lastReaction: null,
    }));
  }

  async drawNextNumber(): Promise<void> {
    await this.fetchAndApplyUpdate(current => {
        const { drawnNumbers, isGameActive, bingoWinner } = current;
        if (drawnNumbers.length >= 75 || !isGameActive || bingoWinner) {
          return null;
        }

        let newNumber;
        const drawnSet = new Set(drawnNumbers);
        do {
          newNumber = Math.floor(Math.random() * 75) + 1;
        } while (drawnSet.has(newNumber));

        return { drawnNumbers: [...drawnNumbers, newNumber], invalidBingoClaim: null };
    });
  }

  async setWinner(winner: { cardId: string; playerName: string }): Promise<void> {
      await this.fetchAndApplyUpdate(current => ({
          bingoWinner: winner,
          isGameActive: false,
          invalidBingoClaim: null,
          playerWins: {
              ...current.playerWins,
              [winner.playerName]: (current.playerWins[winner.playerName] || 0) + 1,
          }
      }));
  }
  
  async setPlayerPreference(playerName: string, preference: 'auto' | 'manual'): Promise<void> {
    await this.fetchAndApplyUpdate(current => ({
        playerPreferences: {
            ...current.playerPreferences,
            [playerName]: preference,
        }
    }));
  }

  async claimBingo(playerName: string, cardId: string, drawnNumbers: Set<number>, gameMode: GameMode): Promise<void> {
    let isInvalid = false;
    await this.fetchAndApplyUpdate(current => {
        if (current.bingoWinner || current.invalidBingoClaim?.playerName === playerName) return null;
        
        const claimedCard = current.generatedCards.find(c => c.id === cardId && c.owner === playerName);
        if (!claimedCard) return null;
        
        const isWinner = checkForWinner([claimedCard], drawnNumbers, gameMode);
        
        if (isWinner) {
            return {
                bingoWinner: { cardId, playerName },
                isGameActive: false,
                invalidBingoClaim: null,
                playerWins: {
                    ...current.playerWins,
                    [playerName]: (current.playerWins[playerName] || 0) + 1,
                }
            };
        } else {
            isInvalid = true;
            return { invalidBingoClaim: { playerName, timestamp: Date.now() } };
        }
    });

    if (isInvalid) {
        setTimeout(() => {
            this.clearInvalidBingoClaim(playerName);
        }, 5000);
    }
  }
  
  async clearInvalidBingoClaim(playerName: string): Promise<void> {
    await this.fetchAndApplyUpdate(current => {
        if (current.invalidBingoClaim?.playerName === playerName) {
            return { invalidBingoClaim: null };
        }
        return null;
    });
  }

  async triggerReaction(type: Reaction['type']): Promise<void> {
    await this.fetchAndApplyUpdate(current => ({ 
        lastReaction: { type, timestamp: Date.now() } 
    }));
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
                // Only update if the state has genuinely changed to avoid re-renders.
                if (JSON.stringify(this.state) !== JSON.stringify(newState)) {
                    this.state = { ...this.initialState, ...newState };
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
  
  private async fetchAndApplyUpdate(
    updateFn: (currentState: SharedGameState) => Partial<SharedGameState> | null
  ): Promise<void> {
    const { data, error: fetchError } = await supabase
        .from(TABLE_NAME)
        .select('state')
        .eq('id', ROW_ID)
        .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
        console.error('Failed to fetch state before update:', fetchError);
        return; // Early exit on fetch failure
    }

    const currentState = data?.state ? { ...this.initialState, ...data.state } : { ...this.initialState };

    const updates = updateFn(currentState);

    if (updates === null) {
        return; // No update needed
    }

    const newState = { ...currentState, ...updates };

    const { error: upsertError } = await supabase
        .from(TABLE_NAME)
        .upsert({ id: ROW_ID, state: newState });

    if (upsertError) {
        console.error('Failed to save atomic state update to Supabase:', upsertError);
    }
    
    // We don't update local state or notify listeners here.
    // The realtime subscription is the single source of truth and will trigger the update.
    // This prevents race conditions and ensures all clients are in sync.
  }
}

export const gameStateService = new GameStateService();