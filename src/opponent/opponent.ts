import type { SearchOptions, SearchResult } from './engine';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTIES: Record<Difficulty, SearchOptions> = {
  easy: { maxDepth: 2, timeMs: 500 },
  normal: { maxDepth: 3, timeMs: 1500 },
  hard: { maxDepth: 5, timeMs: 4000 },
};

export class Opponent {
  private worker?: Worker;

  choose(fen: string, difficulty: Difficulty): Promise<SearchResult | null> {
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const worker = this.worker;
    return new Promise((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<SearchResult | null>) => resolve(event.data);
      worker.onerror = (event) => reject(new Error(event.message || 'Opponent crashed'));
      worker.postMessage({ fen, options: DIFFICULTIES[difficulty] });
    });
  }
}
