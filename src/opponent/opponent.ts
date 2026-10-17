import type { SearchOptions, SearchResult } from './engine';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: Record<Difficulty, SearchOptions> = {
  easy: { maxDepth: 2, timeMs: 500 },
  normal: { maxDepth: 3, timeMs: 1500 },
  hard: { maxDepth: 5, timeMs: 4000 },
};

export class Opponent {
  private worker?: Worker;
  private thinking = false;

  choose(fen: string, difficulty: Difficulty): Promise<SearchResult | null> {
    if (this.thinking) throw new Error('Opponent is already choosing a move');
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const worker = this.worker;
    this.thinking = true;
    return new Promise((resolve, reject) => {
      const settle = () => {
        this.thinking = false;
        worker.onmessage = null;
        worker.onerror = null;
      };
      worker.onmessage = (event: MessageEvent<SearchResult | null>) => {
        settle();
        resolve(event.data);
      };
      worker.onerror = (event) => {
        settle();
        reject(new Error(event.message || 'The opponent stopped unexpectedly'));
      };
      worker.postMessage({ fen, options: DIFFICULTIES[difficulty] });
    });
  }
}
