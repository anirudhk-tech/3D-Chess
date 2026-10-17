import { RESPONSE_SCHEMA } from './prompt';
import type { ChatMessage } from './types';

export async function completeWithOpenAI(messages: ChatMessage[]): Promise<string> {
  const response = await fetch('/api/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: __OPENAI_MODEL__,
      messages,
      temperature: 0,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'chess_command', strict: true, schema: RESPONSE_SCHEMA },
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}
