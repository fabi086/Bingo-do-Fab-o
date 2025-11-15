
import type { BingoCardData } from '../types';

// Programmatic function to create a valid bingo card
const createValidBingoCard = (): BingoCardData => {
    const card: BingoCardData = { B: [], I: [], N: [], G: [], O: [] };
    const columns: { key: keyof BingoCardData, min: number, max: number }[] = [
        { key: 'B', min: 1, max: 15 },
        { key: 'I', min: 16, max: 30 },
        { key: 'N', min: 31, max: 45 },
        { key: 'G', min: 46, max: 60 },
        { key: 'O', min: 61, max: 75 },
    ];
    
    for (const { key, min, max } of columns) {
        const colNumbers = new Set<number>();
        const count = key === 'N' ? 4 : 5;
        while (colNumbers.size < count) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            colNumbers.add(num);
        }
        card[key] = Array.from(colNumbers).sort((a,b) => a - b) as any;
    }

    // Insert 'LIVRE' into the middle of the 'N' column
    const nColumn = card.N as number[];
    nColumn.splice(2, 0, 'LIVRE' as any);
    
    return card;
};


export const generateBingoCard = async (): Promise<BingoCardData> => {
  // Directly return a programmatically created valid card.
  // This is faster, cheaper, and guarantees 100% correctness and adherence to bingo rules.
  return createValidBingoCard();
};
