import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { Prize, GeneratedCard, User, GameMode } from './types';
import { generateBingoCard } from './services/geminiService';
import { gameStateService } from './services/gameState';
import BingoBall from './components/BingoBall';
import InfoCard from './components/InfoCard';
import BingoCard from './components/BingoCard';
import Auth from './components/Auth';
import AdminPanel from './components/AdminPanel';

const prizes: Prize[] = [
  { id: 1, name: '1º Prêmio', value: 'R$ 500,00' },
  { id: 2, name: '2º Prêmio', value: 'R$ 300,00' },
  { id: 3, name: '3º Prêmio', value: 'R$ 200,00' },
  { id: 4, name: '4º Prêmio', value: 'R$ 150,00' },
  { id: 5, name: '5º Prêmio', value: 'Extra' },
];

const prices = { single: 20, double: 30 };
const DRAW_INTERVAL_MS = 1500; // Reduced for better pacing

// More enthusiastic narrator phrases
const callerPhrases = [
    "E a bolinha da vez é...", 
    "Saindo quentinha do globo...", 
    "Atenção para a pedra...", 
    "E o número que saiu é...", 
    "Para agitar a galera, número...", 
    "Vem que tem, número...", 
    "Olha elaaa, a bolinha de número...", 
    "Pode marcar na cartela...",
    "E agora, o número da sorte é...",
    "Que rufem os tambores para o número...",
    "Prepara a caneta, que saiu o número...",
    "Direto do globo para a sua cartela!",
    "Vamos ver, vamos ver... o número é...",
    "Segura o coração, que saiu o...",
    "Mais uma pedrinha da sorte!",
    "Marcando e ganhando, com o número...",
    "Atenção total para o número...",
    "É agora! O número é...",
    "VAI, NÚMERO...",
    "PRA FAZER BINGO!",
    "ACELERA, NÚMERO...",
    "ESQUENTOU, SAIU O NÚMERO...",
];

const useLocalStorage = <T,>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) { console.error(error); return initialValue; }
  });

  const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) { console.error(error); }
  };
  return [storedValue, setValue];
};

const getLetterForNumber = (number: number): string => {
  if (number <= 15) return 'B'; if (number <= 30) return 'I'; if (number <= 45) return 'N';
  if (number <= 60) return 'G'; if (number <= 75) return 'O'; return '';
};

const Confetti: React.FC = () => (
    <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-50">
      {Array.from({ length: 150 }).map((_, i) => (
        <div key={i} className="absolute" style={{
            left: `${Math.random() * 100}%`, top: `${-10 - Math.random() * 20}%`,
            width: `${Math.random() * 10 + 5}px`, height: `${Math.random() * 10 + 5}px`,
            backgroundColor: ['#EF4444', '#3B82F6', '#22C55E', '#EAB308', '#A855F7'][i % 5],
            animation: `fall ${Math.random() * 3 + 4}s ${Math.random() * 2}s linear infinite`,
          }}/>
      ))}
      <style>{`@keyframes fall { to { transform: translateY(100vh) rotate(${Math.random() * 720}deg); opacity: 0; } }`}</style>
    </div>
);

// Authoritative bingo check function - independent of local user settings
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


const App: React.FC = () => {
  // --- Shared State from Service ---
  const [gameState, setGameState] = useState(gameStateService.getState());
  const { users, onlineUsers, generatedCards, drawnNumbers, isGameActive, bingoWinner, gameMode, scheduledGames, preGameCountdown, gameStartingId, playerPreferences, invalidBingoClaim } = gameState;

  // --- Local State (per-device/user) ---
  const [currentUser, setCurrentUser] = useLocalStorage<User | null>('bingoCurrentUser', null);
  const [cardQuantity, setCardQuantity] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [isMuted, setIsMuted] = useLocalStorage('isMuted', false);
  const [volume, setVolume] = useLocalStorage('narratorVolume', 0.8);
  const [manualMarks, setManualMarks] = useLocalStorage<Record<string, (number|string)[]>>('manualMarks', {});
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [cardViewMode, setCardViewMode] = useLocalStorage<'carousel' | 'grid'>('cardViewMode', 'carousel');
  const [isAdminInPlayerView, setIsAdminInPlayerView] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSpeechBlocked, setIsSpeechBlocked] = useState(false);
  const [speechQueue, setSpeechQueue] = useState<number[]>([]);
  const [narratedNumbers, setNarratedNumbers] = useState<number[]>([]);
  const [currentlySpeaking, setCurrentlySpeaking] = useState<number | null>(null);

  const applauseRef = useRef<HTMLAudioElement>(null);
  const cheeringRef = useRef<HTMLAudioElement>(null);
  const drawTimeoutRef = useRef<number | null>(null);
  const prevDrawnNumbersRef = useRef<number[]>([]);
  const prevBingoWinnerRef = useRef(bingoWinner);
  const lastUtteranceRef = useRef<string | null>(null);
  const isNarratingRef = useRef(false);
  
  // --- Memos and Derived State ---
  const { playerWins } = gameState; // Destructure here to satisfy dependency arrays
  const myCards = useMemo(() => generatedCards.filter(c => c.owner === currentUser?.name), [generatedCards, currentUser]);
  const isAutoMarking = useMemo(() => (playerPreferences[currentUser?.name ?? ''] ?? 'auto') === 'auto', [playerPreferences, currentUser]);
  const nextGame = useMemo(() => scheduledGames.filter(g => new Date(g.startTime).getTime() > Date.now()).sort((a,b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0] || null, [scheduledGames]);
  const allPlayers = useMemo(() => onlineUsers.map(u => u === 'admin' ? 'Fábio' : u).sort(), [onlineUsers]);
  const totalPrice = useMemo(() => (Math.floor(cardQuantity / 2) * prices.double) + (cardQuantity % 2 * prices.single), [cardQuantity]);
  const lastNumberForDisplay = currentlySpeaking ?? (narratedNumbers.length > 0 ? narratedNumbers[narratedNumbers.length - 1] : null);
  const isMyBingoInvalid = invalidBingoClaim?.playerName === currentUser?.name;

  // --- Effects ---

  // Initialize and Subscribe to game state service
  useEffect(() => {
    const initialize = async () => {
        await gameStateService.initialize();
        setIsLoading(false);
        const unsubscribe = gameStateService.subscribe(setGameState);
        // On initial load, sync the narrated numbers with the drawn numbers
        // so if a user joins mid-game, their card is correctly marked up to that point.
        setNarratedNumbers(gameStateService.getState().drawnNumbers);
        return unsubscribe;
    }
    const unsubPromise = initialize();
    
    return () => {
        unsubPromise.then(unsub => unsub && unsub());
        gameStateService.cleanup();
    };
  }, []);

  // Handle user login/logout for online status
  useEffect(() => {
    if (currentUser) gameStateService.login(currentUser.name);
    const handleBeforeUnload = () => { if (currentUser) gameStateService.logout(currentUser.name); };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [currentUser]);

  // Speak function for one-off announcements (e.g., countdowns, winners)
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
        if (!('speechSynthesis' in window) || isMuted) {
            return resolve();
        }

        if (isSpeechBlocked) {
            lastUtteranceRef.current = text;
            return resolve();
        }
        
        // If a number is currently being narrated, pause the queue.
        if (isNarratingRef.current) {
            window.speechSynthesis.cancel(); // Interrupts the number
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'pt-BR';
        utterance.rate = 1.3;
        utterance.pitch = 1.4;
        utterance.volume = volume;
        
        utterance.onend = () => {
            lastUtteranceRef.current = null;
            resolve();
        };

        utterance.onerror = (e) => {
            if (e.error === 'not-allowed') {
                console.warn('Speech synthesis was not allowed. Needs user interaction.');
                setIsSpeechBlocked(true);
                lastUtteranceRef.current = text;
            } else if (e.error !== 'interrupted' && e.error !== 'canceled') {
                 console.error('Speech error:', e.error);
            }
            resolve();
        };
        
        window.speechSynthesis.speak(utterance);
    });
  }, [isMuted, volume, isSpeechBlocked]);

  // --- Reactive Narration: Populates a speech queue to handle numbers correctly ---
  useEffect(() => {
    const newNumbers = drawnNumbers.filter(num => !prevDrawnNumbersRef.current.includes(num));
    if (newNumbers.length > 0 && isGameActive && !bingoWinner) {
        setSpeechQueue(prevQueue => [...prevQueue, ...newNumbers]);
    }
    prevDrawnNumbersRef.current = drawnNumbers;
  }, [drawnNumbers, isGameActive, bingoWinner]);
  
  // --- Number Narration Queue Processor ---
  useEffect(() => {
    if (speechQueue.length === 0 || isNarratingRef.current || isSpeechBlocked || isMuted || window.speechSynthesis.speaking) {
        return;
    }

    isNarratingRef.current = true;

    const numberToSpeak = speechQueue[0];
    setCurrentlySpeaking(numberToSpeak);

    const phrase = callerPhrases[Math.floor(Math.random() * callerPhrases.length)];
    const letter = getLetterForNumber(numberToSpeak);
    const textToSpeak = `${phrase} Letra ${letter}... ${numberToSpeak}!`;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.5;
    utterance.pitch = 1.7;
    utterance.volume = volume;

    utterance.onend = () => {
        isNarratingRef.current = false;
        setCurrentlySpeaking(null);
        setNarratedNumbers(prev => [...prev, numberToSpeak]); // Officially add to the marked list
        setSpeechQueue(prevQueue => prevQueue.slice(1));

        // If I am the admin, trigger the next draw after a delay.
        // This creates a synchronized loop: draw -> narrate -> draw -> narrate...
        if (currentUser?.name === 'admin') {
            const currentState = gameStateService.getState();
            if (currentState.isGameActive && !currentState.bingoWinner) {
                 if (drawTimeoutRef.current) clearTimeout(drawTimeoutRef.current);
                 drawTimeoutRef.current = window.setTimeout(async () => {
                    await gameStateService.drawNextNumber();
                }, DRAW_INTERVAL_MS);
            }
        }
    };

    utterance.onerror = (e) => {
        isNarratingRef.current = false;
        setCurrentlySpeaking(null);

        if (e.error === 'not-allowed') {
            console.warn('Speech narration was not allowed. Needs user interaction.');
            setIsSpeechBlocked(true);
            // Do not remove the number from the queue. It will be re-attempted once speech is unblocked.
            return;
        }
        
        if (e.error === 'interrupted' || e.error === 'canceled') {
            console.log('Narration interrupted, will retry.');
        } else {
            console.error('Speech error during narration:', e.error);
            // Fallback: If another error occurs, mark the number and move on so the game isn't stuck.
            setNarratedNumbers(prev => [...prev, numberToSpeak]);
            setSpeechQueue(prevQueue => prevQueue.slice(1));
        }
    };

    window.speechSynthesis.speak(utterance);

  }, [speechQueue, isSpeechBlocked, isMuted, volume, currentUser]);

  // --- Reactive Winner Check (for Auto-Marking players): Admin checks for winner when numbers change ---
  useEffect(() => {
    const checkWinnerAsync = async () => {
        if (currentUser?.name !== 'admin' || !isGameActive || bingoWinner || drawnNumbers.length < 5) return;
    
        // Only check for winners among players using auto-marking
        const autoMarkingPlayers = new Set(Object.keys(playerPreferences).filter(p => playerPreferences[p] === 'auto'));
        // Include players who haven't set a preference yet (defaults to auto)
        const allPlayerNames = new Set(generatedCards.map(c => c.owner));
        allPlayerNames.forEach(name => {
            if(playerPreferences[name] === undefined) {
                autoMarkingPlayers.add(name);
            }
        });

        const cardsToCheck = generatedCards.filter(card => autoMarkingPlayers.has(card.owner));

        const winner = checkForWinner(cardsToCheck, new Set(drawnNumbers), gameMode);
        if (winner) {
          await gameStateService.setWinner(winner);
        }
    }
    checkWinnerAsync();
  }, [drawnNumbers, isGameActive, bingoWinner, currentUser, gameMode, generatedCards, playerPreferences]);
  
  // --- Reactive Winner Celebration: Trigger effects when a winner is declared ---
  useEffect(() => {
      if (bingoWinner && !prevBingoWinnerRef.current) {
          if (drawTimeoutRef.current) clearTimeout(drawTimeoutRef.current); // Stop drawing new numbers
          setShowConfetti(true);
          setSpeechQueue([]); // Clear any pending numbers to be called
          setCurrentlySpeaking(null); // Clear any number being spoken
          applauseRef.current?.play().catch(e => console.error("Audio error:", e));
          cheeringRef.current?.play().catch(e => console.error("Audio error:", e));
          const winnerName = bingoWinner.playerName === 'admin' ? 'Fábio' : bingoWinner.playerName;
          
          const speakWinner = async () => {
            await new Promise(resolve => setTimeout(resolve, 250)); 
            speak(`BINGOOOOO! TEMOS UM VENCEDOR! Parabéns para ${winnerName}! Que sorte!`);
          }
          speakWinner();
      }
      prevBingoWinnerRef.current = bingoWinner;
  }, [bingoWinner, speak]);
  
  // Countdown timer for next scheduled game
  useEffect(() => {
    if (isGameActive || !nextGame || bingoWinner || gameStartingId) return; 
    const timer = setInterval(async () => {
      const distance = new Date(nextGame.startTime).getTime() - Date.now();
      if (distance <= 1000) {
        setCountdown("O jogo vai começar!");
        if (currentUser?.name === 'admin') {
            await gameStateService.setGameStartingId(nextGame.id);
            await speak(`Atenção, o bingo vai começar em 10 segundos. Boa sorte!`);
            await gameStateService.setPreGameCountdown(10);
        }
        clearInterval(timer);
        return;
      }
      const d = Math.floor(distance / 864e5), h = Math.floor((distance % 864e5) / 36e5), m = Math.floor((distance % 36e5) / 6e4), s = Math.floor((distance % 6e4) / 1000);
      setCountdown([d > 0 && `${d}d`, h > 0 && `${h}h`, `${m}m`, `${s}s`].filter(Boolean).join(' '));
    }, 1000);
    return () => clearInterval(timer);
  }, [isGameActive, bingoWinner, nextGame, gameStartingId, currentUser, speak]);

  // 10-second pre-game countdown (driven by admin client)
  useEffect(() => {
    if (preGameCountdown === null || isGameActive || currentUser?.name !== 'admin') return;
  
    const countdownLogic = async () => {
        if (preGameCountdown === 0) {
          if (gameStartingId) {
              await speak("Começou!");
              await gameStateService.startGame(gameStartingId);
              setTimeout(async () => {
                if (gameStateService.getState().isGameActive) {
                  await gameStateService.drawNextNumber();
                }
              }, 1500);
          }
          return;
        }
      
        const timer = setTimeout(async () => {
          const newCountdown = preGameCountdown - 1;
          await gameStateService.setPreGameCountdown(newCountdown);
          if (newCountdown > 0) {
            speak(String(newCountdown));
          }
        }, 1000);
      
        return () => clearTimeout(timer);
    }
    countdownLogic();
  }, [preGameCountdown, isGameActive, speak, gameStartingId, currentUser]);


  // --- Other handlers ---
  
  const handleUnlockSpeech = () => {
    if (!('speechSynthesis' in window)) return;
    
    // Message to confirm audio is working. Use the last missed one for better UX.
    const messageToSpeak = lastUtteranceRef.current || "Som ativado!";

    const unlockUtterance = new SpeechSynthesisUtterance(messageToSpeak);
    unlockUtterance.volume = isMuted ? 0 : volume;
    unlockUtterance.lang = 'pt-BR';
    unlockUtterance.rate = 1.2;
    unlockUtterance.pitch = 1.3;
    
    unlockUtterance.onend = () => {
        // Crucially, unblock the state only after a successful speech event
        setIsSpeechBlocked(false);
        lastUtteranceRef.current = null;
    };

    unlockUtterance.onerror = (e) => {
        console.error("Failed to unlock speech synthesis on user click:", e.error);
        // If it still fails, keep the banner up.
    };
    
    // This call is inside a user-initiated event handler, which is what browsers require.
    window.speechSynthesis.speak(unlockUtterance);
};


  const handleLogout = () => {
    if (currentUser) gameStateService.logout(currentUser.name);
    setCurrentUser(null);
    setIsAdminInPlayerView(false);
  };
  
  const handleGenerateCards = useCallback(async (quantity: number) => {
    if (quantity <= 0 || !currentUser) return;
    setIsGenerating(true); setError(null);
    try {
      const existingCards = gameStateService.getState().generatedCards;
      const existingCardSignatures = new Set(existingCards.map(c => JSON.stringify([...c.cardData.B, ...c.cardData.I, ...c.cardData.N, ...c.cardData.G, ...c.cardData.O].filter(n => typeof n === 'number').sort())));
      const newCards: GeneratedCard[] = [];
      for (let i = 0; i < quantity; i++) {
        let newCardData, signature, attempts = 0;
        do {
          newCardData = await generateBingoCard();
          signature = JSON.stringify([...newCardData.B, ...newCardData.I, ...newCardData.N, ...newCardData.G, ...newCardData.O].filter(n => typeof n === 'number').sort());
          if (++attempts > 100) throw new Error('Não foi possível gerar uma cartela única.');
        } while (existingCardSignatures.has(signature));
        existingCardSignatures.add(signature);
        newCards.push({ id: `card-${Date.now()}-${i}`, cardData: newCardData, owner: currentUser.name });
      }
      await gameStateService.addCards(newCards);
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha ao gerar cartela.'); } 
    finally { setIsGenerating(false); }
  }, [currentUser]);

  const handleBuyCards = async () => {
    if (!currentUser) return;
    await handleGenerateCards(cardQuantity);
    setCardQuantity(1);
  };

  const handleResetGame = async () => {
    await gameStateService.resetGame();
    setShowConfetti(false); setManualMarks({});
    setSpeechQueue([]);
    setNarratedNumbers([]);
    setCurrentlySpeaking(null);
    window.speechSynthesis.cancel();
    if (applauseRef.current) { applauseRef.current.currentTime = 0; applauseRef.current.pause(); }
    if (cheeringRef.current) { cheeringRef.current.currentTime = 0; cheeringRef.current.pause(); }
  }

  const handleToggleAutoMarking = async () => {
    if (!currentUser) return;
    const newPreference = isAutoMarking ? 'manual' : 'auto';

    if (newPreference === 'manual') { // Switched TO manual
        const newManualMarks: Record<string, (number | string)[]> = {};
        const narratedNumbersSet = new Set(narratedNumbers);
        myCards.forEach(card => {
            const marksForCard: Set<number|string> = new Set(['LIVRE']);
            [...card.cardData.B, ...card.cardData.I, ...card.cardData.N, ...card.cardData.G, ...card.cardData.O].forEach(num => {
                if (narratedNumbersSet.has(num as number)) marksForCard.add(num);
            });
            newManualMarks[card.id] = Array.from(marksForCard);
        });
        setManualMarks(prev => ({ ...prev, ...newManualMarks }));
    }
    await gameStateService.setPlayerPreference(currentUser.name, newPreference);
  };

  const handleCellClick = (cardId: string, num: number | string) => {
    if (isAutoMarking || typeof num !== 'number') return;
    setManualMarks(prev => {
        const existingMarks = new Set(prev[cardId] || ['LIVRE']);
        existingMarks.has(num) ? existingMarks.delete(num) : existingMarks.add(num);
        return { ...prev, [cardId]: Array.from(existingMarks) };
    });
  };

  const handleClaimBingo = async () => {
    if (!currentUser || myCards.length === 0 || bingoWinner || isMyBingoInvalid) return;
    const currentCard = myCards[currentCardIndex];
    if (currentCard) {
        await gameStateService.claimBingo(currentUser.name, currentCard.id, new Set(narratedNumbers), gameMode);
    }
  };


  useEffect(() => {
    if (bingoWinner) {
      const winnerIndex = myCards.findIndex(card => card.id === bingoWinner.cardId);
      if (winnerIndex > -1) setCurrentCardIndex(winnerIndex);
    }
  }, [bingoWinner, myCards]);

  if (isLoading) return <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center text-2xl font-bold">Carregando o Bingo do Fabão...</div>;
  if (!currentUser) return <Auth onLoginSuccess={setCurrentUser} allUsers={users} />;
  if (currentUser.name === 'admin' && !isAdminInPlayerView) return <AdminPanel onSwitchToPlayerView={() => setIsAdminInPlayerView(true)} onLogout={handleLogout} onResetGame={handleResetGame} />;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-8 bg-[radial-gradient(circle_at_top_left,_rgba(30,_58,_138,_0.4),_transparent_30%),_radial-gradient(circle_at_bottom_right,_rgba(17,_24,_39,_0.3),_transparent_40%)]">
      {isSpeechBlocked && (
        <div className="fixed top-0 left-0 right-0 bg-yellow-500 text-slate-900 p-4 text-center z-[100] shadow-lg flex items-center justify-center gap-4">
            <p className="font-bold">A narração de voz está bloqueada.</p>
            <button 
                onClick={handleUnlockSpeech}
                className="bg-slate-900 text-white font-bold py-2 px-4 rounded-lg hover:bg-slate-800 transition-colors"
            >
                Clique aqui para ativar
            </button>
        </div>
      )}
      {showConfetti && <Confetti />}
      <audio ref={applauseRef} src="https://cdn.pixabay.com/audio/2021/08/04/audio_12b0c7443c.mp3" preload="auto"></audio>
      <audio ref={cheeringRef} src="https://cdn.pixabay.com/audio/2022/08/25/audio_5217983350.mp3" preload="auto"></audio>
      
      <div className="max-w-7xl mx-auto relative">
        <div className="absolute top-2 right-2 flex gap-2 z-20">
            {currentUser.name === 'admin' && (
                 <button onClick={() => setIsAdminInPlayerView(false)} className="bg-blue-500/80 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-lg text-sm transition-colors flex items-center gap-2" aria-label="Voltar ao painel do administrador" >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 9a4 4 0 100 8 4 4 0 000-8zm-2 9a9 9 0 005.464 2.949m5.464-2.949a9 9 0 01-10.928 0m10.928 0L14.536 14M4.536 14L2 11.464M3.515 9.015l2.525.505m11.92 0l2.525-.505M6.04 4.536L8.5 2m7.5 2.536L13.96 4.5M9.015 3.515l.505 2.525m5.95-.505l-.505 2.525" /></svg>
                    <span>Painel</span>
                </button>
            )}
            <button onClick={handleLogout} className="bg-red-500/80 hover:bg-red-600 text-white font-bold py-2 px-3 rounded-lg text-sm transition-colors flex items-center gap-2" aria-label="Sair do sistema">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                <span>Sair</span>
            </button>
        </div>

        <header className="text-center mb-12">
          <div className="flex justify-center items-center gap-2 mb-4">
            <BingoBall letter="B" color="#EF4444" className="w-16 h-16 text-4xl" /> <BingoBall letter="I" color="#3B82F6" className="w-16 h-16 text-4xl" />
            <BingoBall letter="N" color="#22C55E" className="w-16 h-16 text-4xl" /> <BingoBall letter="G" color="#EAB308" className="w-16 h-16 text-4xl" />
            <BingoBall letter="O" color="#A855F7" className="w-16 h-16 text-4xl" />
          </div>
          <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-500">Bingo do Fabão</h1>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="relative bg-slate-800/50 backdrop-blur-sm p-6 rounded-2xl border border-blue-500/30 shadow-lg">
                <div className="absolute top-4 right-4 flex items-center gap-3">
                    <input type="range" min="0" max="1" step="0.1" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} className="w-24 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                    <button onClick={() => setIsMuted(!isMuted)} className={`p-2 rounded-full transition-colors ${isMuted ? 'bg-red-500/80' : 'bg-gray-600/50 hover:bg-gray-500/50'}`} aria-label={isMuted ? "Ativar som" : "Desativar som"}>
                        {isMuted ? <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l4-4m0 4l-4-4" /></svg> : <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>}
                    </button>
                </div>
                <h2 className="text-3xl font-bold text-white mb-4 text-center">Painel de Sorteio</h2>
                {!isGameActive && !bingoWinner && (
                    <div className='text-center'>
                        {preGameCountdown !== null ? (
                             <><p className="text-xl text-gray-300 mb-2">O jogo começa em:</p><p className="text-6xl font-bold text-sky-300 tracking-widest mb-4 animate-pulse">{preGameCountdown}</p></>
                        ) : nextGame ? (
                            <><p className="text-xl text-gray-300 mb-2">Próximo jogo em:</p><p className="text-4xl font-bold text-sky-300 tracking-widest mb-4">{countdown}</p></>
                        ) : (<p className="text-xl text-gray-300">Nenhum jogo agendado. Volte mais tarde!</p>)}
                    </div>
                )}
                {(isGameActive || drawnNumbers.length > 0) && (
                     <div className='text-center'>
                        <div className="mb-4">
                            <p className="text-lg text-gray-300">Último número sorteado:</p>
                            <p className="text-8xl font-black text-sky-300 my-4 animate-pop-in">{lastNumberForDisplay ?? (drawnNumbers.length > 0 ? drawnNumbers[drawnNumbers.length - 1] : '-')}</p>
                        </div>
                        <div className="bg-black/20 p-4 rounded-lg">
                           <p className="text-sm text-gray-400 mb-2">Números Sorteados ({narratedNumbers.length}/75):</p>
                           <div className="flex flex-wrap gap-2 justify-center h-48 overflow-y-auto">{Array.from({length: 75}, (_, i) => i + 1).map(num => (<div key={num} className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${narratedNumbers.includes(num) ? 'bg-sky-400 text-slate-900' : 'bg-gray-700/50 text-gray-400'}`}>{num}</div>))}</div>
                        </div>
                     </div>
                )}
                 {bingoWinner && (
                     <div className="mt-6 text-center bg-green-500/20 border-2 border-green-400 p-6 rounded-xl">
                        <p className="text-6xl font-black text-white animate-bounce">BINGO!</p>
                        <p className="text-xl text-green-200 mt-2">Vencedor: {bingoWinner.playerName === 'admin' ? 'Fábio' : bingoWinner.playerName}!</p>
                     </div>
                 )}
            </div>

            {myCards.length === 0 && !isGameActive && (
              <InfoCard icon="🎟️" title="Adquira suas Cartelas">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-black/20 p-4 rounded-lg">
                  <div className="flex items-center gap-4">
                    <label className="font-bold text-lg">Quantidade:</label>
                    <div className="flex items-center">
                        <button onClick={() => setCardQuantity(p => Math.max(1, p - 1))} className="w-10 h-10 bg-blue-600 text-white font-bold text-2xl rounded-l-md hover:bg-blue-700 disabled:bg-gray-600" aria-label="Diminuir">-</button>
                        <span className="w-16 h-10 flex items-center justify-center bg-gray-700 text-white font-bold text-xl">{cardQuantity}</span>
                        <button onClick={() => setCardQuantity(p => p + 1)} className="w-10 h-10 bg-blue-600 text-white font-bold text-2xl rounded-r-md hover:bg-blue-700" aria-label="Aumentar">+</button>
                    </div>
                  </div>
                  <div className="text-center sm:text-right"><p className="text-2xl font-bold text-sky-300">Total: R$ {totalPrice.toFixed(2)}</p><p className="text-sm text-gray-400">(2 por R$ 30,00)</p></div>
                </div>
                <button onClick={handleBuyCards} disabled={isGenerating} className="mt-4 w-full bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold py-3 px-4 rounded-lg text-lg transition-all transform hover:scale-105 disabled:opacity-50">{isGenerating ? 'Gerando...' : 'Comprar e Gerar Cartelas'}</button>
                {error && <p className="text-red-400 mt-2">{error}</p>}
              </InfoCard>
            )}
            
            {myCards.length > 0 && (
              <div className="relative">
                <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                  <h2 className="text-3xl font-bold text-white">Minhas Cartelas ({currentUser.name === 'admin' ? 'Fábio' : currentUser.name})</h2>
                  <div className="flex items-center gap-4">
                     <div className="flex items-center bg-gray-700 rounded-full p-1"><button onClick={() => setCardViewMode('carousel')} className={`px-3 py-1 text-sm rounded-full ${cardViewMode === 'carousel' ? 'bg-sky-500 text-black' : 'text-gray-300'}`}>Carrossel</button><button onClick={() => setCardViewMode('grid')} className={`px-3 py-1 text-sm rounded-full ${cardViewMode === 'grid' ? 'bg-sky-500 text-black' : 'text-gray-300'}`}>Grade</button></div>
                      <label className="flex items-center cursor-pointer"><span className="mr-3 text-sm font-medium text-gray-300">Marcar Auto.</span><div className="relative"><input type="checkbox" className="sr-only" checked={isAutoMarking} onChange={handleToggleAutoMarking} /><div className="block bg-gray-600 w-14 h-8 rounded-full"></div><div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isAutoMarking ? 'transform translate-x-6 bg-sky-400' : ''}`}></div></div></label>
                  </div>
                </div>

                {cardViewMode === 'carousel' ? (
                     <div className="relative max-w-md mx-auto">
                          <div className={`${bingoWinner?.cardId === myCards[currentCardIndex]?.id ? 'ring-4 ring-sky-400 animate-pulse' : ''} rounded-lg`}>
                            {myCards[currentCardIndex] && <BingoCard cardData={myCards[currentCardIndex].cardData} drawnNumbers={new Set(narratedNumbers)} isAutoMarking={isAutoMarking} manualMarks={new Set(manualMarks[myCards[currentCardIndex].id] || ['LIVRE'])} onCellClick={(num) => handleCellClick(myCards[currentCardIndex].id, num)} />}
                          </div>
                          {myCards.length > 1 && (<>
                             <button onClick={() => setCurrentCardIndex(p => (p - 1 + myCards.length) % myCards.length)} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 bg-gray-800/80 hover:bg-gray-700 text-white rounded-full w-12 h-12 flex items-center justify-center z-10">&#x276E;</button>
                             <button onClick={() => setCurrentCardIndex(p => (p + 1) % myCards.length)} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 bg-gray-800/80 hover:bg-gray-700 text-white rounded-full w-12 h-12 flex items-center justify-center z-10">&#x276F;</button>
                             <p className="text-center mt-4 text-gray-300 font-semibold text-lg">Cartela {currentCardIndex + 1} de {myCards.length}</p>
                          </>)}
                    </div>
                ) : (
                    <div className="space-y-6 max-w-md mx-auto">{myCards.map((card, index) => (<div key={card.id}><h3 className="text-center font-bold text-lg text-gray-300 mb-2">Cartela {index + 1}</h3><div className={`${bingoWinner?.cardId === card.id ? 'ring-4 ring-sky-400 animate-pulse' : ''} rounded-lg`}><BingoCard cardData={card.cardData} drawnNumbers={new Set(narratedNumbers)} isAutoMarking={isAutoMarking} manualMarks={new Set(manualMarks[card.id] || ['LIVRE'])} onCellClick={(num) => handleCellClick(card.id, num)} /></div></div>))}</div>
                )}
                {!isAutoMarking && isGameActive && !bingoWinner && (
                    <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-lg p-4 z-30">
                         <button 
                            onClick={handleClaimBingo}
                            disabled={isMyBingoInvalid}
                            className="w-full text-center text-5xl font-black text-white bg-gradient-to-r from-green-400 to-teal-500 rounded-lg shadow-2xl py-4 transform transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed animate-pulse"
                         >
                            BINGO!
                         </button>
                         {isMyBingoInvalid && <p className="text-center text-red-400 mt-2 font-semibold">BINGO inválido! Continue jogando.</p>}
                    </div>
                )}
              </div>
            )}
          </div>
          <aside className="space-y-8">
            <InfoCard icon="🗓️" title="Próximo Jogo"><p className="text-lg font-semibold">{nextGame ? new Date(nextGame.startTime).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A'}</p><p>Início às {nextGame ? new Date(nextGame.startTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</p></InfoCard>
            <InfoCard icon="🏆" title="Prêmios">{prizes.map(p => (<div key={p.id} className="flex justify-between items-center border-b border-white/10 pb-2 last:border-b-0"><span>{p.name}</span><span className="font-bold text-sky-300">{p.value}</span></div>))}</InfoCard>
            <InfoCard icon="👥" title="Jogadores na Sala">
                <ul className="space-y-2 max-h-48 overflow-y-auto">
                    {allPlayers.map(name => {
                        const originalName = name === 'Fábio' ? 'admin' : name;
                        const isWinner = bingoWinner?.playerName === originalName;
                        return (
                            <li key={name} className={`flex items-center justify-between gap-3 p-1 rounded ${isWinner ? 'bg-sky-400/20' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <span className={`w-3 h-3 rounded-full ${isWinner ? 'bg-sky-400' : 'bg-green-400'} animate-pulse`}></span>
                                    <span className="font-medium text-gray-200">{name}</span>
                                </div>
                                <div className="flex items-center gap-1 text-sky-400">
                                    {Array.from({length: playerWins[originalName] || 0}).map((_, i) => <span key={i}>⭐</span>)}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            </InfoCard>
          </aside>
        </main>
      </div>
    </div>
  );
};

export default App;
