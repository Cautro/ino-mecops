// ==================== Основные типы ====================

export type Player = {
  telegram_id: number;
  username?: string;
  first_name: string;
  gold: number;
  created_at: string;
  passive_gold_per_hour?: number;
  passive_gold_claimed?: number;
  last_passive_claim_at?: string;
  owned_creature_count?: number;
};

export type Creature = {
  id: number;
  species_slug: string;
  obtained_at: string;
};

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type Species = {
  id: number;
  slug: string;
  name: string;
  description: string;
  image_url: string;
  rarity: Rarity;
  passive_gold_per_hour: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SpeciesInput = {
  slug: string;
  name: string;
  description: string;
  image_url: string;
  rarity: Rarity;
  passive_gold_per_hour: number;
};

export type SpeciesUpdateInput = Omit<SpeciesInput, 'slug'>;

// ==================== Типы промокодов и батчей ====================

export type RedeemResult = {
  gold_added: number;
  gold_balance: number;
  creature_slug?: string;
  redeemed_at: string;
};

export type SlotSpinResult = {
  symbols: [string, string, string];
  bet: number;
  payout: number;
  net: number;
  gold_balance: number;
  win_type: 'miss' | 'pair' | 'triple' | 'creature';
  multiplier: number;
  creature_slug?: string;
  creature_name?: string;
  message: string;
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

export type BatchCodesResponse = {
  batch_id: number;
  codes: { code: string; redeemed_at?: string }[];
  unavailable_count: number;
};

export type CreateBatchInput = {
  label: string;
  count: number;
  reward_preset: 'gold50' | 'gold500' | 'mecop150';
  expires_in_days: number;
};

// ==================== Демо-состояние и утилиты ====================

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
let demoSpeciesID = 2;

let demoSpecies: Species[] = [
  {
    id: 1,
    slug: 'ino-sprout',
    name: 'Иноспрут',
    description: 'Первый известный представитель иномеконов.',
    image_url: '',
    rarity: 'common',
    passive_gold_per_hour: 5,
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// ==================== Класс ошибок и функция запросов ====================

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
  if (DEMO_MODE) return demoRequest<T>(path, options);

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
      /* Preserve the HTTP status as a useful fallback. */
    }
    throw new APIError(message, response.status, code);
  }
  return (await response.json()) as T;
}

// ==================== API Клиент ====================

export const api = {
  me: (initData: string) => request<Player>('/api/v1/game/overview', initData),
  spinSlot: (initData: string, bet: number) =>
    request<SlotSpinResult>('/api/v1/game/slot', initData, { method: 'POST', body: { bet } }),
  creatures: (initData: string) => request<{ items: Creature[] }>('/api/v1/me/creatures', initData),

  redeem: (initData: string, code: string) =>
    request<RedeemResult>('/api/v1/codes/redeem', initData, { method: 'POST', body: { code } }),

  listBatches: (initData: string) =>
    request<{ items: Batch[] }>('/api/v1/admin/code-batches?limit=50&offset=0', initData),

  createBatch: (initData: string, payload: CreateBatchInput) =>
    request<CreatedBatch>('/api/v1/admin/code-batches', initData, { method: 'POST', body: payload }),

  batchCodes: (initData: string, id: number) =>
    request<BatchCodesResponse>(`/api/v1/admin/code-batches/${id}/codes`, initData),

  revokeBatch: (initData: string, id: number) =>
    request<{ ok: boolean; batch_id: number }>(`/api/v1/admin/code-batches/${id}/revoke`, initData, {
      method: 'POST',
      body: {},
    }),

  deleteBatch: (initData: string, id: number) =>
    request<{ ok: boolean; batch_id: number }>(`/api/v1/admin/code-batches/${id}`, initData, { method: 'DELETE' }),

  listSpecies: (initData: string, admin = true) =>
    request<{ items: Species[] }>(admin ? '/api/v1/admin/creatures' : '/api/v1/catalog/creatures', initData),

  createSpecies: (initData: string, payload: SpeciesInput) =>
    request<Species>('/api/v1/admin/creatures', initData, { method: 'POST', body: payload }),

  updateSpecies: (initData: string, id: number, payload: SpeciesUpdateInput) =>
    request<Species>(`/api/v1/admin/creatures/${id}`, initData, { method: 'PUT', body: payload }),

  archiveSpecies: (initData: string, id: number) =>
    request<{ ok: boolean; id: number }>(`/api/v1/admin/creatures/${id}`, initData, { method: 'DELETE' }),

  uploadImage: async (
    initData: string,
    file: File
  ): Promise<{ image_url: string; width: number; height: number; format: string }> => {
    if (DEMO_MODE) {
      const dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Не удалось прочитать изображение.'));
        reader.onerror = () => reject(new Error('Не удалось прочитать изображение.'));
        reader.readAsDataURL(file);
      });
      return { image_url: dataURL, width: 0, height: 0, format: file.type.split('/')[1] ?? 'image' };
    }

    const form = new FormData();
    form.append('image', file);

    const response = await fetch('/api/v1/admin/uploads/images', {
      method: 'POST',
      headers: { Authorization: `tma ${initData}` },
      body: form,
    });

    if (!response.ok) {
      let message = `Не удалось загрузить изображение (${response.status}).`;
      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        message = payload.error?.message ?? message;
      } catch {
        /* keep fallback */
      }
      throw new APIError(message, response.status);
    }
    return (await response.json()) as { image_url: string; width: number; height: number; format: string };
  },
};

// ==================== Обработчик Демо-режима ====================

function creatureNameForDemo(slug: string): string {
  return demoSpecies.find((species) => species.slug === slug)?.name ?? slug.replaceAll('-', ' ');
}

async function demoRequest<T>(path: string, options: RequestOptions): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 100));

  if (path === '/api/v1/game/overview' || path === '/api/v1/me') {
    return {
      telegram_id: 100000001,
      username: 'demo_player',
      first_name: 'Игрок',
      gold: demoGold,
      created_at: new Date().toISOString(),
      passive_gold_per_hour: demoCreatures.length * 5,
      passive_gold_claimed: 0,
      last_passive_claim_at: new Date().toISOString(),
      owned_creature_count: demoCreatures.length,
    } as T;
  }

  if (path === '/api/v1/me/creatures') return { items: demoCreatures } as T;

  if (path === '/api/v1/game/slot' && options.method === 'POST') {
    const bet = Number((options.body as { bet?: number })?.bet);
    if (!Number.isInteger(bet) || bet < 10 || bet > 10000) {
      throw new APIError('Ставка должна быть от 10 до 10000 золота.', 400, 'invalid_bet');
    }
    if (demoGold < bet) throw new APIError('Не хватает золота для этой ставки.', 409, 'insufficient_gold');
    const symbols = ['🍒', '🍋', '💎', '⭐', '🧬'];
    const result = [0, 1, 2].map(() => symbols[Math.floor(Math.random() * symbols.length)]) as [string, string, string];
    let payout = 0;
    let winType: SlotSpinResult['win_type'] = 'miss';
    let multiplier = 0;
    let creatureSlug: string | undefined;
    if (result[0] === result[1] && result[1] === result[2]) {
      const multipliers: Record<string, number> = { '🍒': 4, '🍋': 5, '💎': 7, '⭐': 10, '🧬': 15 };
      multiplier = multipliers[result[0]];
      payout = bet * multiplier;
      winType = result[0] === '🧬' ? 'creature' : 'triple';
      if (winType === 'creature') {
        const available = demoSpecies.filter((species) => species.is_active);
        if (available.length) {
          creatureSlug = available[Math.floor(Math.random() * available.length)].slug;
          demoCreatures = [...demoCreatures, { id: Date.now(), species_slug: creatureSlug, obtained_at: new Date().toISOString() }];
        }
      }
    } else if (result[0] === result[1] || result[0] === result[2] || result[1] === result[2]) {
      payout = Math.floor((bet * 12) / 10);
      multiplier = 1.2;
      winType = 'pair';
    }
    demoGold = demoGold - bet + payout;
    const message = winType === 'miss'
      ? 'Мимо! Ставка сгорела. Крути ещё раз.'
      : winType === 'pair'
        ? 'Два одинаковых символа! Выплата ×1,2.'
        : winType === 'creature'
          ? creatureSlug
            ? `ДЖЕКПОТ! Три 🧬 — выплата ×15 и новый иномекон: ${creatureNameForDemo(creatureSlug)}!`
            : 'ДЖЕКПОТ! Три 🧬 — выплата ×15. В каталоге пока нет доступных иномеконов для награды.'
          : `Три ${result[0]}! Выплата ×${multiplier}.`;
    return {
      symbols: result,
      bet,
      payout,
      net: payout - bet,
      gold_balance: demoGold,
      win_type: winType,
      multiplier,
      creature_slug: creatureSlug,
      creature_name: creatureSlug ? creatureNameForDemo(creatureSlug) : undefined,
      message,
    } as T;
  }

  if (path === '/api/v1/codes/redeem') {
    const body = options.body as { code: string };
    if (!body.code.trim()) throw new APIError('В ссылке нет кода.', 422);

    const goldAdded = body.code.toUpperCase().includes('500') ? 500 : body.code.toUpperCase().includes('MECOP') ? 150 : 50;
    demoGold += goldAdded;
    const creatureSlug = body.code.toUpperCase().includes('MECOP') ? 'ino-sprout' : undefined;

    if (creatureSlug) {
      demoCreatures = [...demoCreatures, { id: Date.now(), species_slug: creatureSlug, obtained_at: new Date().toISOString() }];
    }
    return {
      gold_added: goldAdded,
      gold_balance: demoGold,
      creature_slug: creatureSlug,
      redeemed_at: new Date().toISOString(),
    } as T;
  }

  if (path.startsWith('/api/v1/admin/code-batches?')) return { items: demoBatches } as T;

  if (path === '/api/v1/admin/code-batches' && options.method === 'POST') {
    const payload = options.body as CreateBatchInput;
    const rewardGold = payload.reward_preset === 'gold500' ? 500 : payload.reward_preset === 'mecop150' ? 150 : 50;
    const creature = payload.reward_preset === 'mecop150' ? 'ino-sprout' : undefined;
    const codes = Array.from({ length: payload.count }, (_, i) => `INOME-DEMO-${demoBatchID}-${String(i + 1).padStart(3, '0')}`);

    const batch: Batch = {
      id: demoBatchID++,
      label: payload.label,
      reward_gold: rewardGold,
      reward_creature_slug: creature,
      created_by: 100000001,
      created_at: new Date().toISOString(),
      expires_at: payload.expires_in_days
        ? new Date(Date.now() + payload.expires_in_days * 86_400_000).toISOString()
        : undefined,
      code_count: payload.count,
      redeemed_count: 0,
    };

    demoBatches = [batch, ...demoBatches];
    return {
      batch_id: batch.id,
      label: batch.label,
      count: payload.count,
      reward_gold: rewardGold,
      reward_creature_slug: creature,
      expires_at: batch.expires_at,
      codes,
    } as T;
  }

  const batchCodesMatch = path.match(/^\/api\/v1\/admin\/code-batches\/(\d+)\/codes$/);
  if (batchCodesMatch) {
    const batch = demoBatches.find((item) => item.id === Number(batchCodesMatch[1]));
    if (!batch) throw new APIError('Партия не найдена.', 404);
    return {
      batch_id: batch.id,
      codes: Array.from({ length: batch.code_count }, (_, index) => ({
        code: `INOME-DEMO-${batch.id}-${String(index + 1).padStart(3, '0')}`,
      })),
      unavailable_count: 0,
    } as T;
  }

  const revokeBatchMatch = path.match(/^\/api\/v1\/admin\/code-batches\/(\d+)\/revoke$/);
  if (revokeBatchMatch) {
    const batch = demoBatches.find((item) => item.id === Number(revokeBatchMatch[1]));
    if (!batch || batch.revoked_at) throw new APIError('Партия не найдена или уже отозвана.', 404);
    batch.revoked_at = new Date().toISOString();
    return { ok: true, batch_id: batch.id } as T;
  }

  const deleteBatchMatch = path.match(/^\/api\/v1\/admin\/code-batches\/(\d+)$/);
  if (deleteBatchMatch && options.method === 'DELETE') {
    const id = Number(deleteBatchMatch[1]);
    const batch = demoBatches.find((item) => item.id === id);
    if (!batch) throw new APIError('Партия не найдена.', 404);
    if (batch.redeemed_count) throw new APIError('Нельзя удалить партию с активированными кодами.', 409);
    demoBatches = demoBatches.filter((item) => item.id !== id);
    return { ok: true, batch_id: id } as T;
  }

  if (path === '/api/v1/admin/creatures' || path === '/api/v1/catalog/creatures') {
    if (path === '/api/v1/catalog/creatures') {
      return { items: demoSpecies.filter((species) => species.is_active) } as T;
    }
    if (options.method === 'POST') {
      const input = options.body as SpeciesInput;
      if (demoSpecies.some((species) => species.slug === input.slug)) {
        throw new APIError('Такой slug уже существует.', 409);
      }

      const now = new Date().toISOString();
      const created: Species = {
        ...input,
        id: demoSpeciesID++,
        is_active: true,
        created_at: now,
        updated_at: now,
      };
      demoSpecies = [created, ...demoSpecies];
      return created as T;
    }
    return { items: demoSpecies } as T;
  }

  const speciesMatch = path.match(/^\/api\/v1\/admin\/creatures\/(\d+)$/);
  if (speciesMatch) {
    const id = Number(speciesMatch[1]);
    const item = demoSpecies.find((species) => species.id === id);
    if (!item) throw new APIError('Иномекон не найден.', 404);

    if (options.method === 'PUT') {
      const input = options.body as SpeciesUpdateInput;

      const updated: Species = {
        ...item,
        ...input,
        updated_at: new Date().toISOString(),
      };
      demoSpecies = demoSpecies.map((species) => (species.id === id ? updated : species));
      return updated as T;
    }
    if (options.method === 'DELETE') {
      item.is_active = false;
      item.updated_at = new Date().toISOString();
      return { ok: true, id } as T;
    }
  }

  throw new APIError('Маршрут не найден.', 404);
}

export const isDemoMode = DEMO_MODE;