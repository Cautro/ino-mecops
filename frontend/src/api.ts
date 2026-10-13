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

export type EggOffer = {
  rarity: Rarity;
  label: string;
  price_gold: number;
  available: boolean;
  available_species: number;
};

export type OwnedEgg = {
  id: number;
  rarity: Rarity;
  price_gold: number;
  purchased_at: string;
};

export type ShopData = { egg_offers: EggOffer[]; eggs: OwnedEgg[] };
export type BuyEggResult = { egg: OwnedEgg; gold_balance: number };
export type HatchEggResult = {
  egg_id: number;
  creature_id: number;
  species_slug: string;
  name: string;
  image_url: string;
  rarity: Rarity;
  sell_price_gold: number;
  gold_balance: number;
};
export type SellCreatureResult = {
  creature_id: number;
  species_slug: string;
  name: string;
  gold_added: number;
  gold_balance: number;
};

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type CollectionSpecies = {
  id: number;
  locked: boolean;
  slug?: string;
  name?: string;
  description?: string;
  image_url?: string;
  sell_price_gold?: number;
  rarity?: Rarity;
  passive_gold_per_hour?: number;
  health?: number;
  damage?: number;
  crit_chance?: number;
  ability_id?: number;
  ability_name?: string;
  ability_slug?: string;
};

export type Species = {
  id: number;
  slug: string;
  name: string;
  description: string;
  image_url: string;
  sell_price_gold: number;
  rarity: Rarity;
  passive_gold_per_hour: number;
  health: number;
  damage: number;
  crit_chance: number;
  ability_id: number;
  ability_name: string;
  ability_slug: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type SpeciesInput = {
  slug: string;
  name: string;
  description: string;
  image_url: string;
  sell_price_gold: number;
  rarity: Rarity;
  passive_gold_per_hour: number;
  health: number;
  damage: number;
  crit_chance: number;
  ability_id: number;
};

export type SpeciesUpdateInput = Omit<SpeciesInput, 'slug'>;

export type Ability = {
  id: number;
  slug: string;
  name: string;
  description: string;
  element: 'meteor' | 'wind' | 'earth' | 'water' | 'arcane' | 'custom';
  power: number;
  accuracy_percent: number;
  cooldown_seconds: number;
  effect_type: 'none' | 'burn' | 'slow' | 'stun' | 'weaken' | 'shield';
  effect_value: number;
  effect_duration_turns: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type AbilityInput = Omit<Ability, 'id' | 'is_default' | 'created_at' | 'updated_at'>;
export type AbilityUpdateInput = Omit<AbilityInput, 'slug'>;

// ==================== Типы промокодов и батчей ====================

export type RedeemResult = {
  reward_name?: string;
  reward_rarity?: string;
  gold_added: number;
  gold_balance: number;
  creature_slug?: string;
  redeemed_at: string;
};

export type SlotCreatureReward = {
  slug: string;
  name: string;
};

export type SlotSpinRequest =
  | { bet_type: 'gold'; bet: number }
  | { bet_type: 'creature'; creature_id: number };

export type SlotSpinResult = {
  symbols: [string, string, string];
  bet_type: 'gold' | 'creature';
  bet: number;
  payout: number;
  net: number;
  gold_balance: number;
  win_type: 'miss' | 'pair' | 'triple' | 'creature';
  multiplier: number;
  creature_slug?: string;
  creature_name?: string;
  bet_creature_id?: number;
  bet_creature_slug?: string;
  bet_creature_name?: string;
  creature_stake_lost?: boolean;
  creature_rewards?: SlotCreatureReward[];
  message: string;
};

export type Batch = {
  id: number;
  label: string;
  reward_name: string;
  reward_rarity: string;
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
  reward_name: string;
  reward_rarity: string;
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
  reward_name: string;
  reward_rarity: string;
  reward_gold: number;
  reward_creature_slug?: string;
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
    reward_name: 'Золотой запас',
    reward_rarity: 'Обычная',
    reward_gold: 50,
    created_by: 100000001,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
    code_count: 24,
    redeemed_count: 16,
  },
];

let demoBatchID = 2;
let demoSpeciesID = 4;
let demoEggID = 1;
let demoEggs: OwnedEgg[] = [];
let demoDiscoveredSlugs = new Set<string>(['ino-sprout']);

let demoSpecies: Species[] = [
  {
    id: 1,
    slug: 'ino-sprout',
    name: 'Иноспрут',
    description: 'Первый известный представитель иномеконов.',
    image_url: '',
    sell_price_gold: 25,
    rarity: 'common',
    passive_gold_per_hour: 5,
    health: 100,
    damage: 10,
    crit_chance: 5,
    ability_id: 1,
    ability_name: 'Искра',
    ability_slug: 'spark',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 2,
    slug: 'voltik',
    name: 'Вольтик',
    description: 'Маленький биоэлектрический проказник с кристальными усиками.',
    image_url: '',
    sell_price_gold: 100,
    rarity: 'rare',
    passive_gold_per_hour: 12,
    health: 85,
    damage: 18,
    crit_chance: 9,
    ability_id: 1,
    ability_name: 'Искра',
    ability_slug: 'spark',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 3,
    slug: 'mossbyte',
    name: 'Моссбайт',
    description: 'Живой минерал с мхом на голове и светящимися глазами.',
    image_url: '',
    sell_price_gold: 250,
    rarity: 'epic',
    passive_gold_per_hour: 25,
    health: 160,
    damage: 12,
    crit_chance: 4,
    ability_id: 1,
    ability_name: 'Искра',
    ability_slug: 'spark',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

let demoAbilities: Ability[] = [
  {
    id: 1,
    slug: 'spark',
    name: 'Искра',
    description: 'Базовая энергия иномекона.',
    element: 'meteor',
    power: 10,
    accuracy_percent: 95,
    cooldown_seconds: 0,
    effect_type: 'none',
    effect_value: 0,
    effect_duration_turns: 0,
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];
let demoAbilityID = 2;

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
  spinSlot: (initData: string, payload: SlotSpinRequest) =>
    request<SlotSpinResult>('/api/v1/game/slot', initData, { method: 'POST', body: payload }),
  creatures: (initData: string) => request<{ items: Creature[] }>('/api/v1/me/creatures', initData),
  shop: (initData: string) => request<ShopData>('/api/v1/shop', initData),
  buyEgg: (initData: string, rarity: Rarity) =>
    request<BuyEggResult>('/api/v1/shop/eggs/buy', initData, { method: 'POST', body: { rarity } }),
  hatchEgg: (initData: string, id: number) =>
    request<HatchEggResult>(`/api/v1/shop/eggs/${id}/hatch`, initData, { method: 'POST', body: {} }),
  sellCreature: (initData: string, id: number) =>
    request<SellCreatureResult>(`/api/v1/shop/creatures/${id}/sell`, initData, { method: 'POST', body: {} }),

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

  listAdminSpecies: (initData: string) =>
    request<{ items: Species[] }>('/api/v1/admin/creatures', initData),
  collectionCatalog: (initData: string) =>
    request<{ items: CollectionSpecies[] }>('/api/v1/catalog/creatures', initData),

  listAbilities: (initData: string) => request<{ items: Ability[] }>('/api/v1/admin/abilities', initData),
  createAbility: (initData: string, payload: AbilityInput) =>
    request<Ability>('/api/v1/admin/abilities', initData, { method: 'POST', body: payload }),
  updateAbility: (initData: string, id: number, payload: AbilityUpdateInput) =>
    request<Ability>(`/api/v1/admin/abilities/${id}`, initData, { method: 'PUT', body: payload }),
  deleteAbility: (initData: string, id: number) =>
    request<{ ok: boolean; id: number }>(`/api/v1/admin/abilities/${id}`, initData, { method: 'DELETE' }),

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

  if (path === '/api/v1/shop' && options.method !== 'POST') {
    const prices: { rarity: Rarity; label: string; price_gold: number }[] = [
      { rarity: 'common', label: 'Обычное', price_gold: 250 },
      { rarity: 'rare', label: 'Редкое', price_gold: 1000 },
      { rarity: 'epic', label: 'Эпическое', price_gold: 2500 },
      { rarity: 'legendary', label: 'Легендарное', price_gold: 7500 },
      { rarity: 'mythic', label: 'Мифическое', price_gold: 15000 },
    ];
    return {
      egg_offers: prices.map((item) => {
        const count = demoSpecies.filter((species) => species.is_active && species.rarity === item.rarity).length;
        return { ...item, available: count > 0, available_species: count };
      }),
      eggs: demoEggs,
    } as T;
  }

  if (path === '/api/v1/shop/eggs/buy' && options.method === 'POST') {
    const payload = options.body as { rarity: Rarity };
    const priceByRarity: Record<Rarity, number> = { common: 250, rare: 1000, epic: 2500, legendary: 7500, mythic: 15000 };
    const offer = demoSpecies.some((species) => species.is_active && species.rarity === payload.rarity);
    if (!offer) throw new APIError('В этой редкости пока нет активных иномеконов. Сначала добавь такой вид в каталог.', 409, 'egg_unavailable');
    const price = priceByRarity[payload.rarity];
    if (!price) throw new APIError('Неизвестная редкость яйца.', 400);
    if (demoGold < price) throw new APIError('Не хватает золота для покупки этого яйца.', 409, 'insufficient_gold');
    demoGold -= price;
    const egg: OwnedEgg = { id: demoEggID++, rarity: payload.rarity, price_gold: price, purchased_at: new Date().toISOString() };
    demoEggs = [egg, ...demoEggs];
    return { egg, gold_balance: demoGold } as T;
  }

  const hatchMatch = path.match(/^\/api\/v1\/shop\/eggs\/(\d+)\/hatch$/);
  if (hatchMatch && options.method === 'POST') {
    const eggID = Number(hatchMatch[1]);
    const egg = demoEggs.find((item) => item.id === eggID);
    if (!egg) throw new APIError('Это яйцо не найдено в твоём инвентаре.', 404, 'egg_not_owned');
    const possible = demoSpecies.filter((item) => item.is_active && item.rarity === egg.rarity);
    if (!possible.length) throw new APIError('В каталоге нет активных иномеконов этой редкости. Яйцо сохранено.', 409);
    const picked = possible[Math.floor(Math.random() * possible.length)];
    demoEggs = demoEggs.filter((item) => item.id !== eggID);
    const creature: Creature = { id: Date.now(), species_slug: picked.slug, obtained_at: new Date().toISOString() };
    demoCreatures = [creature, ...demoCreatures];
    demoDiscoveredSlugs.add(picked.slug);
    return { egg_id: eggID, creature_id: creature.id, species_slug: picked.slug, name: picked.name, image_url: picked.image_url, rarity: picked.rarity, sell_price_gold: picked.sell_price_gold, gold_balance: demoGold } as T;
  }

  const sellMatch = path.match(/^\/api\/v1\/shop\/creatures\/(\d+)\/sell$/);
  if (sellMatch && options.method === 'POST') {
    const creatureID = Number(sellMatch[1]);
    const creature = demoCreatures.find((item) => item.id === creatureID);
    if (!creature) throw new APIError('Этот иномекон уже отсутствует в твоей коллекции.', 404, 'creature_not_owned');
    const species = demoSpecies.find((item) => item.slug === creature.species_slug);
    if (!species || species.sell_price_gold <= 0) throw new APIError('Для этого вида не задана цена продажи.', 409, 'creature_not_for_sale');
    demoCreatures = demoCreatures.filter((item) => item.id !== creatureID);
    demoGold += species.sell_price_gold;
    demoDiscoveredSlugs.add(species.slug);
    return { creature_id: creatureID, species_slug: species.slug, name: species.name, gold_added: species.sell_price_gold, gold_balance: demoGold } as T;
  }

  if (path === '/api/v1/me/creatures') return { items: demoCreatures } as T;

  if (path === '/api/v1/game/slot' && options.method === 'POST') {
    const payload = (options.body ?? {}) as Partial<SlotSpinRequest> & { bet?: number };
    const betType = payload.bet_type ?? 'gold';
    const symbols = ['🍒', '🍋', '💎', '⭐', '🧬'];
    const result = [0, 1, 2].map(() => symbols[Math.floor(Math.random() * symbols.length)]) as [string, string, string];
    let payout = 0;
    let winType: SlotSpinResult['win_type'] = 'miss';
    let multiplier = 0;

    if (result[0] === result[1] && result[1] === result[2]) {
      const multipliers: Record<string, number> = { '🍒': 4, '🍋': 5, '💎': 7, '⭐': 10, '🧬': 15 };
      multiplier = multipliers[result[0]];
      winType = result[0] === '🧬' ? 'creature' : 'triple';
    } else if (result[0] === result[1] || result[0] === result[2] || result[1] === result[2]) {
      winType = 'pair';
      multiplier = 1.2;
    }

    if (betType === 'creature') {
      const creatureID = Number((payload as { creature_id?: number }).creature_id);
      const staked = demoCreatures.find((creature) => creature.id === creatureID);
      if (!Number.isInteger(creatureID) || !staked) {
        throw new APIError('Этот иномекон уже недоступен для ставки. Обнови коллекцию и выбери другого.', 409, 'creature_not_owned');
      }
      const stakeLost = winType === 'miss';
      if (stakeLost) demoCreatures = demoCreatures.filter((creature) => creature.id !== creatureID);

      const rewardCount = winType === 'creature' ? 2 : winType === 'triple' ? 1 : 0;
      const available = demoSpecies.filter((species) => species.is_active);
      const rewards: SlotCreatureReward[] = [];
      for (let i = 0; i < rewardCount && available.length; i++) {
        const chosen = available[Math.floor(Math.random() * available.length)];
        rewards.push({ slug: chosen.slug, name: chosen.name });
        demoCreatures = [...demoCreatures, { id: Date.now() + i, species_slug: chosen.slug, obtained_at: new Date().toISOString() }];
        demoDiscoveredSlugs.add(chosen.slug);
      }

      const message = winType === 'miss'
        ? `Промах! Иномекон потерян: ${creatureNameForDemo(staked.species_slug)}.`
        : winType === 'pair'
          ? `Два одинаковых символа! Иномекон «${creatureNameForDemo(staked.species_slug)}» остаётся в твоей коллекции.`
          : winType === 'creature'
            ? rewards.length === 2
              ? `ДЖЕКПОТ! Три 🧬 — ставка сохранена, получены два иномекона: ${rewards[0].name} и ${rewards[1].name}!`
              : rewards.length === 1
                ? `ДЖЕКПОТ! Три 🧬 — ставка сохранена, получен иномекон: ${rewards[0].name}!`
                : 'ДЖЕКПОТ! Три 🧬 — ставка сохранена, но призовых иномеконов пока нет в каталоге.'
            : rewards.length
              ? `Три ${result[0]}! Ставка сохранена — новый иномекон: ${rewards[0].name}!`
              : `Три ${result[0]}! Ставка сохранена, но призовых иномеконов пока нет в каталоге.`;

      return {
        symbols: result,
        bet_type: 'creature',
        bet: 0,
        payout: 0,
        net: 0,
        gold_balance: demoGold,
        win_type: winType,
        multiplier,
        bet_creature_id: creatureID,
        bet_creature_slug: staked.species_slug,
        bet_creature_name: creatureNameForDemo(staked.species_slug),
        creature_stake_lost: stakeLost,
        creature_rewards: rewards,
        message,
      } as T;
    }

    const bet = Number((payload as { bet?: number }).bet);
    if (betType !== 'gold' || !Number.isInteger(bet) || bet < 10 || bet > 10000) {
      throw new APIError('Ставка должна быть от 10 до 10000 золота.', 400, 'invalid_bet');
    }
    if (demoGold < bet) throw new APIError('Не хватает золота для этой ставки.', 409, 'insufficient_gold');

    let creatureSlug: string | undefined;
    let creatureName: string | undefined;
    if (winType === 'creature') {
      payout = bet * 15;
      const available = demoSpecies.filter((species) => species.is_active);
      if (available.length) {
        const picked = available[Math.floor(Math.random() * available.length)];
        creatureSlug = picked.slug;
        creatureName = picked.name;
        demoCreatures = [...demoCreatures, { id: Date.now(), species_slug: creatureSlug, obtained_at: new Date().toISOString() }];
      demoDiscoveredSlugs.add(creatureSlug);
      }
    } else if (winType === 'triple') {
      payout = bet * multiplier;
    } else if (winType === 'pair') {
      payout = Math.floor((bet * 12) / 10);
    }
    demoGold = demoGold - bet + payout;
    const message = winType === 'miss'
      ? 'Мимо! Ставка сгорела. Крути ещё раз.'
      : winType === 'pair'
        ? 'Два одинаковых символа! Выплата ×1,2.'
        : winType === 'creature'
          ? creatureSlug
            ? `ДЖЕКПОТ! Три 🧬 — выплата ×15 и новый иномекон: ${creatureName}!`
            : 'ДЖЕКПОТ! Три 🧬 — выплата ×15. В каталоге пока нет доступных иномеконов для награды.'
          : `Три ${result[0]}! Выплата ×${multiplier}.`;
    return {
      symbols: result,
      bet_type: 'gold',
      bet,
      payout,
      net: payout - bet,
      gold_balance: demoGold,
      win_type: winType,
      multiplier,
      creature_slug: creatureSlug,
      creature_name: creatureName,
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
      demoDiscoveredSlugs.add(creatureSlug);
    }
    return {
      reward_name: creatureSlug ? 'Набор иномекона' : `Золотой запас · ${goldAdded}`,
      reward_rarity: creatureSlug ? 'Эпическая' : (goldAdded >= 500 ? 'Редкая' : 'Обычная'),
      gold_added: goldAdded,
      gold_balance: demoGold,
      creature_slug: creatureSlug,
      redeemed_at: new Date().toISOString(),
    } as T;
  }

  if (path.startsWith('/api/v1/admin/code-batches?')) return { items: demoBatches } as T;

  if (path === '/api/v1/admin/code-batches' && options.method === 'POST') {
    const payload = options.body as CreateBatchInput;
    const rewardGold = Math.max(0, Math.trunc(payload.reward_gold ?? 0));
    const creature = payload.reward_creature_slug || undefined;
    if (rewardGold === 0 && !creature) throw new APIError('Добавь золото и/или выбери иномекона.', 422);
    if (creature && !demoSpecies.some((item) => item.slug === creature && item.is_active)) {
      throw new APIError('Выбранный иномекон не найден в активном каталоге.', 422);
    }
    const rewardName = payload.reward_name.trim() || 'Пользовательская награда';
    const rewardRarity = payload.reward_rarity.trim() || 'Обычная';
    const codes = Array.from({ length: payload.count }, (_, i) => `INOME-DEMO-${demoBatchID}-${String(i + 1).padStart(3, '0')}`);

    const batch: Batch = {
      id: demoBatchID++,
      label: payload.label,
      reward_name: rewardName,
      reward_rarity: rewardRarity,
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
      reward_name: rewardName,
      reward_rarity: rewardRarity,
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

  if (path === '/api/v1/admin/abilities') {
    if (options.method === 'POST') {
      const input = options.body as AbilityInput;
      if (demoAbilities.some((item) => item.slug === input.slug)) throw new APIError('Такая способность уже существует.', 409);
      const now = new Date().toISOString();
      const created: Ability = { ...input, id: demoAbilityID++, is_default: false, created_at: now, updated_at: now };
      demoAbilities = [...demoAbilities, created];
      return created as T;
    }
    return { items: demoAbilities } as T;
  }

  const abilityMatch = path.match(/^\/api\/v1\/admin\/abilities\/(\d+)$/);
  if (abilityMatch) {
    const id = Number(abilityMatch[1]);
    const item = demoAbilities.find((ability) => ability.id === id);
    if (!item) throw new APIError('Способность не найдена.', 404);
    if (options.method === 'PUT') {
      const input = options.body as AbilityUpdateInput;
      const updated: Ability = { ...item, ...input, updated_at: new Date().toISOString() };
      demoAbilities = demoAbilities.map((ability) => (ability.id === id ? updated : ability));
      return updated as T;
    }
    if (options.method === 'DELETE') {
      if (item.is_default) throw new APIError('Базовую способность нельзя удалить.', 409);
      if (demoSpecies.some((species) => species.ability_id === id)) throw new APIError('Способность назначена иномеконам.', 409);
      demoAbilities = demoAbilities.filter((ability) => ability.id !== id);
      return { ok: true, id } as T;
    }
  }

  if (path === '/api/v1/admin/creatures' || path === '/api/v1/catalog/creatures') {
    if (path === '/api/v1/catalog/creatures') {
      const ownedSlugs = new Set([...demoCreatures.map((creature) => creature.species_slug), ...demoDiscoveredSlugs]);
      const catalogue = demoSpecies
        .filter((species) => species.is_active || ownedSlugs.has(species.slug))
        .map((species) => ownedSlugs.has(species.slug) ? { ...species, locked: false } : { id: species.id, locked: true });
      return { items: catalogue } as T;
    }
    if (options.method === 'POST') {
      const input = options.body as SpeciesInput;
      if (demoSpecies.some((species) => species.slug === input.slug)) {
        throw new APIError('Такой slug уже существует.', 409);
      }

      const now = new Date().toISOString();
      const ability = demoAbilities.find((item) => item.id === input.ability_id) ?? demoAbilities[0];
      const created: Species = {
        ...input,
        health: input.health ?? 100,
        damage: input.damage ?? 10,
        crit_chance: input.crit_chance ?? 5,
        ability_id: input.ability_id ?? ability.id,
        ability_name: ability.name,
        ability_slug: ability.slug,
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

      const ability = demoAbilities.find((entry) => entry.id === input.ability_id) ?? demoAbilities[0];
      const updated: Species = {
        ...item,
        ...input,
        ability_name: ability.name,
        ability_slug: ability.slug,
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