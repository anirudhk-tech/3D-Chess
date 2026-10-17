import { findBestMove, type SearchOptions } from './engine';

interface Request {
  fen: string;
  options: SearchOptions;
}

self.onmessage = (event: MessageEvent<Request>) => {
  const { fen, options } = event.data;
  self.postMessage(findBestMove(fen, options));
};
