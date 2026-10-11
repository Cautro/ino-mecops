export type Player = {
  telegram_id: number;
  username?: string;
  first_name: string;
  gold: number;
  created_at: string;
};

export type Creature = {
  id: number;
  species_slug: string;
  obtained_at: string;
};

export type RedeemResult = {
  gold_added: number;
  gold_balance: number;
  creature_slug?: string;
  redeemed_at: string;
};

export type Batch = {
  id: number;
  label: string;
  reward_gold: number;
  reward_creature_slug?: string;
  created_by: number;
  created_at: string;
  expires_at?: string;
  revoked_at?: string;
  code_count: number;
  redeemed_count: number;
};

export type CreatedBatch = {
  batch_id: number;
  label: string;
  count: number;
  reward_gold: number;
  reward_creature_slug?: string;
  expires_at?: string;
  codes: string[];
};

export type CreateBatchInput = {
  label: string;
  count: number;
  reward_preset: 'gold50' | 'gold500' | 'mecop150';
  expires_in_days: number;
};

type RequestOptions = {
  method?: string;
  body?: unknown;
};

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
let demoGold = 350;
let demoCreatures: Creature[] = [
  { id: 1, species_slug: 'ino-sprout', obtained_at: new Date().toISOString() },
];
let demoBatches: Batch[] = [
  {
    id: 1,
    label: 'Тестовая партия',
    reward_gold: 50,
    created_by: 100000001,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
    code_count: 24,
    redeemed_count: 16,
  },
];
let demoBatchID = 2;

export class APIError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, initData: string, options: RequestOptions = {}): Promise<T> {
  if (DEMO_MODE) {
    return demoRequest<T>(path, options);
  }

  const response = await fetch(path, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `tma ${initData}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    let message = `Запрос завершился ошибкой (${response.status}).`;
    let code: string | undefined;
    try {
      const payload = (await response.json()) as { error?: { message?: string; code?: string }; message?: string };
      message = payload.error?.message ?? payload.message ?? message;
      code = payload.error?.code;
    } catch {
      // Some proxy/server errors are plain text; keep the generic message.
    }
    throw new APIError(message, response.status, code);
  }

  return (await response.json()) as T;
}

export const api = {
  me: (initData: string) => request<Player>('/api/v1/me', initData),
  creatures: (initData: string) => request<{ items: Creature[] }>('/api/v1/me/creatures', initData),
  redeem: (initData: string, code: string) => request<RedeemResult>('/api/v1/codes/redeem', initData, {
    method: 'POST', body: { code },
  }),
  listBatches: (initData: string) => request<{ items: Batch[] }>('/api/v1/admin/code-batches?limit=50&offset=0', initData),
  createBatch: (initData: string, payload: CreateBatchInput) => request<CreatedBatch>('/api/v1/admin/code-batches', initData, {
    method: 'POST', body: payload,
  }),
  revokeBatch: (initData: string, id: number) => request<{ ok: boolean; batch_id: number }>(`/api/v1/admin/code-batches/${id}/revoke`, initData, {
    method: 'POST', body: {},
  }),
};

async function demoRequest<T>(path: string, options: RequestOptions): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 160));
  if (path === '/api/v1/me') {
    return {
      telegram_id: 100000001,
      username: 'demo_player',
      first_name: 'Игрок',
      gold: demoGold,
      created_at: new Date(Date.now() - 604_800_000).toISOString(),
    } as T;
  }
  if (path === '/api/v1/me/creatures') return { items: demoCreatures } as T;
  if (path === '/api/v1/codes/redeem') {
    const body = options.body as { code: string };
    if (!body.code.trim()) throw new APIError('Введите код с карточки.', 422);
    const goldAdded = body.code.toUpperCase().includes('500') ? 500 : body.code.toUpperCase().includes('MECOP') ? 150 : 50;
    demoGold += goldAdded;
    const creatureSlug = body.code.toUpperCase().includes('MECOP') ? 'ino-sprout' : undefined;
    if (creatureSlug) demoCreatures = [...demoCreatures, { id: Date.now(), species_slug: creatureSlug, obtained_at: new Date().toISOString() }];
    return { gold_added: goldAdded, gold_balance: demoGold, creature_slug: creatureSlug, redeemed_at: new Date().toISOString() } as T;
  }
  if (path.startsWith('/api/v1/admin/code-batches?')) return { items: demoBatches } as T;
  if (path === '/api/v1/admin/code-batches' && options.method === 'POST') {
    const payload = options.body as CreateBatchInput;
    const rewardGold = payload.reward_preset === 'gold500' ? 500 : payload.reward_preset === 'mecop150' ? 150 : 50;
    const creature = payload.reward_preset === 'mecop150' ? 'ino-sprout' : undefined;
    const codes = Array.from({ length: payload.count }, (_, i) => `INOME-DEMO-${demoBatchID}-${String(i + 1).padStart(3, '0')}`);
    const batch: Batch = {
      id: demoBatchID++, label: payload.label, reward_gold: rewardGold, reward_creature_slug: creature,
      created_by: 100000001, created_at: new Date().toISOString(),
      expires_at: payload.expires_in_days ? new Date(Date.now() + payload.expires_in_days * 86_400_000).toISOString() : undefined,
      code_count: payload.count, redeemed_count: 0,
    };
    demoBatches = [batch, ...demoBatches];
    return { batch_id: batch.id, label: batch.label, count: payload.count, reward_gold: rewardGold, reward_creature_slug: creature, expires_at: batch.expires_at, codes } as T;
  }
  const revokeMatch = path.match(/^\/api\/v1\/admin\/code-batches\/(\d+)\/revoke$/);
  if (revokeMatch) {
    const id = Number(revokeMatch[1]);
    const batch = demoBatches.find((item) => item.id === id);
    if (!batch || batch.revoked_at) throw new APIError('Партия не найдена или уже отозвана.', 404);
    batch.revoked_at = new Date().toISOString();
    return { ok: true, batch_id: id } as T;
  }
  throw new APIError('Маршрут не найден.', 404);
}

export const isDemoMode = DEMO_MODE;
