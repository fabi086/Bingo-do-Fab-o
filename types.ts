export interface Prize {
  id: number;
  name: string;
  value: string;
}

export interface BingoCardData {
  B: number[];
  I: number[];
  N: (number | string)[];
  G: number[];
  O: number[];
}

export interface GeneratedCard {
  id: string;
  cardData: BingoCardData;
  owner: string;
}

export interface User {
  name: string;
  password?: string;
  pixKey: string;
}

export interface PlayerWin {
    [playerName: string]: number;
}

export type GameMode = 'line' | 'full';

export interface ScheduledGame {
  id: number;
  startTime: string; // ISO string format
}

export interface PlayerPreferences {
  [playerName: string]: 'auto' | 'manual';
}

export interface Reaction {
  type: 'goodLuck' | 'shake';
  timestamp: number;
}

export interface SharedGameState {
  users: User[];
  onlineUsers: string[];
  generatedCards: GeneratedCard[];
  drawnNumbers: number[];
  isGameActive: boolean;
  bingoWinner: { cardId: string; playerName: string } | null;
  playerWins: PlayerWin;
  gameMode: GameMode;
  scheduledGames: ScheduledGame[];
  preGameCountdown: number | null;
  gameStartingId: number | null;
  playerPreferences: PlayerPreferences;
  invalidBingoClaim: { playerName: string; timestamp: number } | null;
  lastReaction: Reaction | null;
}