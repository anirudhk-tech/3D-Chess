import type { Choose } from './types';

const QUESTION = 'move';

export const chooseWithJev: Choose = async ({ state, instructions, criteria }) => {
  const response = await fetch('/api/jev/v1/systemone', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: __JEV_MODEL__,
      state,
      questions: {
        [QUESTION]: { type: 'choice', instructions, criteria },
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Jev request failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  const answer = data.answers?.[QUESTION];
  return {
    choice: String(answer?.choice ?? ''),
    confidence: Number(answer?.confidence ?? 0),
  };
};
