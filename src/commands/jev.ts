import type { Choose, ChoiceAnswer } from './types';

const QUESTION = 'move';
const ERROR_DETAIL_LIMIT = 200;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function parseChoiceAnswer(body: unknown): ChoiceAnswer {
  const answers = isRecord(body) ? body.answers : undefined;
  const answer = isRecord(answers) ? answers[QUESTION] : undefined;
  if (!isRecord(answer) || typeof answer.choice !== 'string') {
    throw new Error('Jev returned an unexpected response: no choice for the move question');
  }
  const confidence =
    typeof answer.confidence === 'number' && Number.isFinite(answer.confidence)
      ? answer.confidence
      : 0;
  return { choice: answer.choice, confidence };
}

async function post(body: unknown): Promise<Response> {
  try {
    return await fetch('/api/jev/v1/systemone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    throw new Error(
      'Could not reach Jev. Check your connection and that the dev server is running.',
      { cause },
    );
  }
}

export const chooseWithJev: Choose = async ({ state, instructions, criteria }) => {
  const response = await post({
    model: __JEV_MODEL__,
    state,
    questions: { [QUESTION]: { type: 'choice', instructions, criteria } },
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Jev request failed (${response.status}): ${detail.slice(0, ERROR_DETAIL_LIMIT)}`,
    );
  }
  return parseChoiceAnswer(await response.json());
};
