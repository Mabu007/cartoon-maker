import { chatProvider, openRouterEndpoint } from '../src/engine/creativeModel.js';
import type { AiTask } from '../src/engine/filmmakerAI.js';

const modelKeys: Record<AiTask, string> = { brainstorm: 'TOONROOM_BRAINSTORM_MODEL', screenplay: 'TOONROOM_SCREENPLAY_MODEL', direct: 'TOONROOM_DIRECTION_MODEL' };

export function connection(task: AiTask) {
  const openRouter = process.env.OPENROUTER_API_KEY;
  const key = openRouter || process.env.DIRECTOR_API_KEY;
  const model = process.env[modelKeys[task]] || (openRouter ? process.env.TOONROOM_DEFAULT_MODEL || 'openrouter/free' : process.env.DIRECTOR_MODEL);
  if (!key || !model) return undefined;
  const endpoint = openRouter ? openRouterEndpoint : process.env.DIRECTOR_BASE_URL || 'https://api.openai.com/v1';
  return { provider: chatProvider(endpoint, key, Boolean(openRouter)), model };
}
