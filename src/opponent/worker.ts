import { findBestMove, type SearchOptions } from './engine';

interface SearchRequest {
  fen: string;
  options: SearchOptions;
}

self.onmessage = (event: MessageEvent<SearchRequest>) => {
  const { fen, options } = event.data;
  self.postMessage(findBestMove(fen, options));
};
