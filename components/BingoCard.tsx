import React from 'react';
import type { BingoCardData } from '../types';
import BingoBall from './BingoBall';

interface BingoCardProps {
  cardData: BingoCardData;
  drawnNumbers: Set<number | string>;
  isAutoMarking: boolean;
  manualMarks: Set<number | string>;
  onCellClick: (num: number | string) => void;
}

const BingoCard: React.FC<BingoCardProps> = ({ cardData, drawnNumbers, isAutoMarking, manualMarks, onCellClick }) => {
  const headers = ['B', 'I', 'N', 'G', 'O'];
  const colors = ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7'];
  const freeSpaceText = 'LIVRE';

  const columns = [cardData.B, cardData.I, cardData.N, cardData.G, cardData.O];
  
  // Create a flat array of numbers in the correct row-by-row order for CSS Grid
  const gridNumbers: { num: number | string, colIndex: number }[] = [];
  for (let rowIndex = 0; rowIndex < 5; rowIndex++) {
    for (let colIndex = 0; colIndex < 5; colIndex++) {
        gridNumbers.push({
            num: columns[colIndex][rowIndex],
            colIndex: colIndex,
        });
    }
  }

  return (
    <div className="bg-slate-800/50 p-4 rounded-lg border-2 border-blue-500 shadow-2xl animate-fade-in">
      <div className="grid grid-cols-5 gap-2">
        {headers.map((letter, index) => (
          <div key={letter} className="flex justify-center items-center">
             <BingoBall letter={letter} color={colors[index]} className="w-12 h-12 md:w-16 md:h-16 text-3xl md:text-4xl" />
          </div>
        ))}
        {gridNumbers.map(({ num, colIndex }, index) => {
            const isDrawn = drawnNumbers.has(num);
            const isFreeSpace = num === freeSpaceText;
            const isMarked = isFreeSpace || (isAutoMarking ? isDrawn : manualMarks.has(num));

            const cellClasses = `relative flex items-center justify-center h-12 md:h-16 rounded-md font-bold text-xl md:text-2xl transition-all duration-300
              ${isFreeSpace 
                ? 'bg-sky-400 text-sky-900' 
                : 'bg-white/80 text-slate-900'
              }
              ${!isAutoMarking && typeof num === 'number' ? 'cursor-pointer hover:bg-white/100' : ''}
            `;

            return (
            <div
              key={`${colIndex}-${index}`}
              className={cellClasses}
              onClick={() => !isAutoMarking && typeof num === 'number' && onCellClick(num)}
              role="button"
              aria-pressed={isMarked}
              aria-label={`Número ${num}`}
            >
              {num}
              {isMarked && (
                  <div 
                  className="absolute inset-0 flex items-center justify-center rounded-md bg-opacity-70 transition-transform duration-300 scale-100 animate-pop-in"
                  style={{ backgroundColor: isFreeSpace ? '#38BDF8' : colors[colIndex] }}
                  >
                    <span className="text-white text-shadow-lg font-black text-3xl" style={{ textShadow: '1px 1px 2px black' }}>
                      {isFreeSpace ? '★' : num}
                    </span>
                  </div>
              )}
            </div>
          )})}
      </div>
    </div>
  );
};

export default BingoCard;