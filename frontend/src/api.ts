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

export type EggKind = Rarity | 'mystery';

export type EggOffer = {
  rarity: EggKind;
  rarity_chances?: Partial<Record<Rarity, number>>;
  label: string;
  price_gold: number;
  image_url: string;
  description: string;
  is_active: boolean;
  available: boolean;
  available_species: number;
};

export type EggProduct = {
  rarity: EggKind;
  rarity_chances?: Partial<Record<Rarity, number>>;
  label: string;
  price_gold: number;
  image_url: string;
  description: string;
  is_active: boolean;
  updated_at: string;
};

export type EggProductUpdateInput = Omit<EggProduct, 'rarity' | 'updated_at'>;

export type SubscriptionStatus = {
  enabled: boolean;
  url: string;
  title: string;
  message: string;
  reward_gold: number;
  reward_creature_slug?: string;
  reward_creature_name?: string;
  claimed: boolean;
};

export type SubscriptionClaimResult = {
  claimed: boolean;
  already_claimed: boolean;
  gold_added: number;
  gold_balance: number;
  creature_slug?: string;
  creature_name?: string;
};

export type OwnedEgg = {
  id: number;
  rarity: EggKind;
  price_gold: number;
  purchased_at: string;
};

export type ShopData = { lootboxes: EggOffer[]; inventory: OwnedEgg[] };
export type BuyLootboxResult = { lootbox: OwnedEgg; gold_balance: number };
export type OpenLootboxResult = {
  lootbox_id: number;
  creature_id: number;
  species_slug: string;
  name: string;
  image_url: string;
  rarity: Rarity;
  sell_price_gold: number;
  gold_balance: number;
  gold_bonus: number;
};
export type SellCreatureResult = {
  creature_id: number;
  species_slug: string;
  name: string;
  gold_added: number;
  gold_balance: number;
};

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type MainBonusType = 'none' | 'lootbox_chance' | 'lootbox_gold' | 'passive_income';

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
  main_bonus_type?: MainBonusType;
  main_bonus_multiplier?: number;
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
  is_featured: boolean;
  main_bonus_type: MainBonusType;
  main_bonus_multiplier: number;
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
  is_featured: boolean;
  main_bonus_type: MainBonusType;
  main_bonus_multiplier: number;
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

export type MainSlotOption = {
  creature_id: number;
  species_slug: string;
  name: string;
  image_url: string;
  rarity: Rarity;
  passive_gold_per_hour: number;
  bonus_type: MainBonusType;
  bonus_multiplier: number;
  selected: boolean;
};

export type MainSlotState = {
  selected_creature_id?: number;
  selected?: MainSlotOption;
  options: MainSlotOption[];
};

export type CollectionLeaderboardEntry = {
  rank: number;
  name: string;
  creature_count: number;
  passive_gold_per_hour: number;
};

export type ContainerSpendLeaderboardEntry = {
  rank: number;
  name: string;
  total_spent_gold: number;
  containers_bought: number;
};

export type LeaderboardData = {
  collection: CollectionLeaderboardEntry[];
  container_spending: ContainerSpendLeaderboardEntry[];
  battles: { available: boolean; message: string; items: unknown[] };
};

export type Batch = {
  id: number;
  label: string;
  reward_name: string;
  reward_rarity: string;
  reward_gold: number;
  reward_creature_slug?: string;
  reward_mode?: 'fixed' | 'random';
  reward_gold_min?: number;
  reward_gold_max?: number;
  reward_creature_rarities?: Rarity[];
  created_by: number;
  created_at: string;
  expires_at?: string;
  revoked_at?: string;
  code_count: number;
  redeemed_count: number;
};

export type CodeReward = {
  reward_name: string;
  reward_rarity: string;
  reward_gold: number;
  reward_creature_slug?: string;
};

export type CreatedBatch = {
  batch_id: number;
  label: string;
  count: number;
  reward_mode: 'fixed' | 'random';
  reward_name: string;
  reward_rarity: string;
  reward_gold: number;
  reward_gold_min: number;
  reward_gold_max: number;
  reward_creature_rarities: Rarity[];
  reward_creature_slug?: string;
  expires_at?: string;
  codes: string[];
  rewards: CodeReward[];
};

export type BatchCodesResponse = {
  batch_id: number;
  codes: { code: string; redeemed_at?: string; reward_gold: number; reward_creature_slug?: string; reward_name?: string; reward_rarity?: string }[];
  unavailable_count: number;
};

export type CreateBatchInput = {
  label: string;
  count: number;
  reward_mode: 'fixed' | 'random';
  reward_name: string;
  reward_rarity: string;
  reward_gold: number;
  reward_gold_min: number;
  reward_gold_max: number;
  reward_creature_rarities: Rarity[];
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
let demoMainCreatureID: number | null = 1;

let demoBatches: Batch[] = [
  {
    id: 1,
    label: 'Тестовая партия',
    reward_name: 'Золотой запас',
    reward_rarity: 'Обычная',
    reward_gold: 50,
    reward_mode: 'fixed',
    reward_gold_min: 50,
    reward_gold_max: 50,
    reward_creature_rarities: [],
    created_by: 100000001,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
    code_count: 24,
    redeemed_count: 16,
  },
];

let demoBatchID = 2;
let demoBatchRewards = new Map<number, CodeReward[]>();
let demoSpeciesID = 4;
let demoEggID = 1;
let demoEggs: OwnedEgg[] = [];
let demoDiscoveredSlugs = new Set<string>(['ino-sprout']);
let demoEggCatalog: EggProduct[] = [
  { rarity: 'mystery', rarity_chances: { common: 60, rare: 25, epic: 10, legendary: 4, mythic: 1 }, label: 'Коллекционный контейнер', price_gold: 1800, image_url: '', description: 'Гарантированно выдаёт иномекона. Вероятности редкостей показаны до открытия.', is_active: true, updated_at: new Date().toISOString() },
];

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
    is_featured: false,
    main_bonus_type: 'none',
    main_bonus_multiplier: 1,
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
    is_featured: false,
    main_bonus_type: 'none',
    main_bonus_multiplier: 1,
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
    is_featured: false,
    main_bonus_type: 'none',
    main_bonus_multiplier: 1,
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
  mainSlot: (initData: string) => request<MainSlotState>('/api/v1/game/main-creature', initData),
  setMainSlot: (initData: string, creatureID: number) => request<MainSlotState>('/api/v1/game/main-creature', initData, { method: 'PUT', body: { creature_id: creatureID } }),
  clearMainSlot: (initData: string) => request<MainSlotState>('/api/v1/game/main-creature', initData, { method: 'DELETE' }),
  leaderboards: (initData: string) => request<LeaderboardData>('/api/v1/leaderboards', initData),
  creatures: (initData: string) => request<{ items: Creature[] }>('/api/v1/me/creatures', initData),
  shop: (initData: string) => request<ShopData>('/api/v1/shop', initData),
  listAdminEggProducts: (initData: string) => request<{ items: EggProduct[] }>('/api/v1/admin/shop/lootboxes', initData),
  updateAdminEggProduct: (initData: string, rarity: EggKind, payload: EggProductUpdateInput) =>
    request<EggProduct>(`/api/v1/admin/shop/lootboxes/${rarity}`, initData, { method: 'PUT', body: payload }),
  subscriptionStatus: (initData: string) => request<SubscriptionStatus>('/api/v1/subscription', initData),
  claimSubscription: (initData: string) => request<SubscriptionClaimResult>('/api/v1/subscription/claim', initData, { method: 'POST', body: {} }),
  buyLootbox: (initData: string) =>
    request<BuyLootboxResult>('/api/v1/shop/lootboxes/buy', initData, { method: 'POST', body: { rarity: 'mystery' } }),
  openLootbox: (initData: string, id: number) =>
    request<OpenLootboxResult>(`/api/v1/shop/lootboxes/${id}/open`, initData, { method: 'POST', body: {} }),
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

  deleteSpecies: (initData: string, id: number) =>
    request<{ ok: boolean; id: number; deleted: boolean }>(`/api/v1/admin/creatures/${id}`, initData, { method: 'DELETE' }),

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

// function creatureNameForDemo(slug: string): string {
//   return demoSpecies.find((species) => species.slug === slug)?.name ?? slug.replaceAll('-', ' ');
// }

async function demoRequest<T>(path: string, options: RequestOptions): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 100));

  if (path === '/api/v1/game/overview' || path === '/api/v1/me') {
    const basePassive = demoCreatures.reduce((sum, creature) => sum + (demoSpecies.find((species) => species.slug === creature.species_slug)?.passive_gold_per_hour ?? 0), 0);
    const mainCreature = demoCreatures.find((creature) => creature.id === demoMainCreatureID);
    const mainSpecies = demoSpecies.find((species) => species.slug === mainCreature?.species_slug);
    const passiveRate = mainSpecies?.main_bonus_type === 'passive_income' ? basePassive * (mainSpecies.main_bonus_multiplier ?? 1) : basePassive;
    return {
      telegram_id: 100000001,
      username: 'demo_player',
      first_name: 'Игрок',
      gold: demoGold,
      created_at: new Date().toISOString(),
      passive_gold_per_hour: passiveRate,
      passive_gold_claimed: 0,
      last_passive_claim_at: new Date().toISOString(),
      owned_creature_count: demoCreatures.length,
    } as T;
  }

  if (path === '/api/v1/game/main-creature') {
    if (options.method === 'PUT') {
      const creatureID = Number((options.body as { creature_id?: number })?.creature_id);
      if (!demoCreatures.some((creature) => creature.id === creatureID)) throw new APIError('Этот иномекон не найден в твоей коллекции.', 409, 'creature_not_owned');
      demoMainCreatureID = creatureID;
    } else if (options.method === 'DELETE') {
      demoMainCreatureID = null;
    }
    const optionsList: MainSlotOption[] = demoCreatures.flatMap((creature) => {
      const species = demoSpecies.find((item) => item.slug === creature.species_slug);
      if (!species) return [];
      return [{
        creature_id: creature.id, species_slug: species.slug, name: species.name, image_url: species.image_url,
        rarity: species.rarity, passive_gold_per_hour: species.passive_gold_per_hour,
        bonus_type: species.main_bonus_type ?? 'none', bonus_multiplier: species.main_bonus_multiplier ?? 1,
        selected: creature.id === demoMainCreatureID,
      }];
    });
    const selected = optionsList.find((item) => item.selected);
    return { selected_creature_id: selected?.creature_id, selected, options: optionsList } as T;
  }

  if (path === '/api/v1/leaderboards') {
    const basePassive = demoCreatures.reduce((sum, creature) => {
      const species = demoSpecies.find((item) => item.slug === creature.species_slug);
      return sum + (species?.passive_gold_per_hour ?? 0);
    }, 0);
    const mainCreature = demoCreatures.find((creature) => creature.id === demoMainCreatureID);
    const mainSpecies = demoSpecies.find((species) => species.slug === mainCreature?.species_slug);
    const passive = mainSpecies?.main_bonus_type === 'passive_income' ? basePassive * (mainSpecies.main_bonus_multiplier ?? 1) : basePassive;
    return {
      collection: [{ rank: 1, name: '@demo_player', creature_count: demoCreatures.length, passive_gold_per_hour: passive }],
      container_spending: [],
      battles: { available: false, message: 'В скором будущем', items: [] },
    } as T;
  }

  if (path === '/api/v1/shop' && options.method !== 'POST') {
    return {
      lootboxes: demoEggCatalog.filter((item) => item.rarity === 'mystery').map((item) => {
        const count = demoSpecies.filter((species) => species.is_active).length;
        return { ...item, available: item.is_active && count > 0, available_species: count };
      }),
      inventory: demoEggs,
    } as T;
  }

  if (path === '/api/v1/admin/shop/lootboxes' && options.method !== 'PUT') {
    return { items: demoEggCatalog } as T;
  }
  const adminEggMatch = path.match(/^\/api\/v1\/admin\/shop\/lootboxes\/(mystery)$/);
  if (adminEggMatch && options.method === 'PUT') {
    const rarity = adminEggMatch[1] as EggKind;
    const payload = options.body as EggProductUpdateInput;
    const updated: EggProduct = { rarity, ...payload, updated_at: new Date().toISOString() };
    demoEggCatalog = demoEggCatalog.map((item) => item.rarity === rarity ? updated : item);
    return updated as T;
  }

  if (path === '/api/v1/subscription') {
    return { enabled: false, url: '', title: '', message: '', reward_gold: 0, claimed: false } as T;
  }
  if (path === '/api/v1/subscription/claim' && options.method === 'POST') {
    throw new APIError('Бонус за подписку доступен только в Telegram-версии на сервере.', 503, 'subscription_disabled');
  }

  if (path === '/api/v1/shop/lootboxes/buy' && options.method === 'POST') {
    // const payload = options.body as { rarity: EggKind };
    const product = demoEggCatalog.find((item) => item.rarity === 'mystery');
    const offer = demoSpecies.some((species) => species.is_active);
    if (!product || !product.is_active || !offer) throw new APIError('Контейнер сейчас недоступен.', 409, 'lootbox_unavailable');
    const price = product.price_gold;
    if (demoGold < price) throw new APIError('Не хватает золота для покупки контейнера.', 409, 'insufficient_gold');
    demoGold -= price;
    const lootbox: OwnedEgg = { id: demoEggID++, rarity: 'mystery', price_gold: price, purchased_at: new Date().toISOString() };
    demoEggs = [lootbox, ...demoEggs];
    return { lootbox, gold_balance: demoGold } as T;
  }

  const hatchMatch = path.match(/^\/api\/v1\/shop\/lootboxes\/(\d+)\/open$/);
  if (hatchMatch && options.method === 'POST') {
    const eggID = Number(hatchMatch[1]);
    const egg = demoEggs.find((item) => item.id === eggID);
    if (!egg) throw new APIError('Этот контейнер не найден в инвентаре.', 404, 'lootbox_not_owned');
    let desiredRarity: Rarity = egg.rarity === 'mystery' ? 'common' : egg.rarity;
    if (egg.rarity === 'mystery') {
      const weights = demoEggCatalog.find((item) => item.rarity === 'mystery')?.rarity_chances ?? { common: 60, rare: 25, epic: 10, legendary: 4, mythic: 1 };
      const possibleRarities = (Object.entries(weights) as [Rarity, number][]).filter(([rarity, weight]) => weight > 0 && demoSpecies.some((item) => item.is_active && item.rarity === rarity));
      const totalWeight = possibleRarities.reduce((sum, [, weight]) => sum + weight, 0);
      if (totalWeight <= 0) throw new APIError('В каталоге нет активных иномеконов. Контейнер сохранён.', 409);
      let roll = Math.random() * totalWeight;
      for (const [rarity, weight] of possibleRarities) {
        roll -= weight;
        if (roll < 0) { desiredRarity = rarity; break; }
      }
    }
    const possible = demoSpecies.filter((item) => item.is_active && item.rarity === desiredRarity);
    if (!possible.length) throw new APIError('В каталоге нет активных иномеконов этой редкости. Контейнер сохранён.', 409);
    const picked = possible[Math.floor(Math.random() * possible.length)];
    demoEggs = demoEggs.filter((item) => item.id !== eggID);
    const creature: Creature = { id: Date.now(), species_slug: picked.slug, obtained_at: new Date().toISOString() };
    demoCreatures = [creature, ...demoCreatures];
    demoDiscoveredSlugs.add(picked.slug);
    return { lootbox_id: eggID, creature_id: creature.id, species_slug: picked.slug, name: picked.name, image_url: picked.image_url, rarity: picked.rarity, sell_price_gold: picked.sell_price_gold, gold_balance: demoGold, gold_bonus: 0 } as T;
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
    if (!Number.isInteger(payload.count) || payload.count < 1 || payload.count > 500) throw new APIError('Количество кодов должно быть от 1 до 500.', 422);
    const mode = payload.reward_mode ?? 'fixed';
    const fixedCreature = payload.reward_creature_slug || undefined;
    if (mode === 'fixed' && (payload.reward_gold < 0 || (payload.reward_gold === 0 && !fixedCreature))) throw new APIError('Добавь золото и/или выбери иномекона.', 422);
    if (mode === 'random' && (payload.reward_gold_min < 0 || payload.reward_gold_max < payload.reward_gold_min || (payload.reward_gold_max === 0 && payload.reward_creature_rarities.length === 0))) throw new APIError('Проверь диапазон золота и выбранные редкости.', 422);
    if (fixedCreature && !demoSpecies.some((item) => item.slug === fixedCreature && item.is_active)) throw new APIError('Выбранный иномекон не найден в активном каталоге.', 422);
    const selectedRarities = payload.reward_creature_rarities ?? [];
    for (const rarity of selectedRarities) {
      if (!demoSpecies.some((item) => item.is_active && item.rarity === rarity)) throw new APIError(`Нет активных иномеконов редкости «${rarity}».`, 422);
    }
    const rarityWeights: Record<Rarity, number> = { common: 60, rare: 25, epic: 10, legendary: 4, mythic: 1 };
    const rewardForCode = (): CodeReward => {
      if (mode === 'fixed') return { reward_name: payload.reward_name.trim() || 'Пользовательская награда', reward_rarity: payload.reward_rarity.trim() || 'Обычная', reward_gold: Math.trunc(payload.reward_gold), reward_creature_slug: fixedCreature };
      const gold = Math.floor(Math.random() * (payload.reward_gold_max - payload.reward_gold_min + 1)) + payload.reward_gold_min;
      let creatureSlug: string | undefined;
      let rarityLabel = 'Золотая';
      if (selectedRarities.length > 0) {
        const total = selectedRarities.reduce((sum, rarity) => sum + rarityWeights[rarity], 0);
        let roll = Math.random() * total;
        let chosen = selectedRarities[selectedRarities.length - 1];
        for (const rarity of selectedRarities) { roll -= rarityWeights[rarity]; if (roll < 0) { chosen = rarity; break; } }
        const candidates = demoSpecies.filter((item) => item.is_active && item.rarity === chosen);
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        creatureSlug = picked?.slug;
        rarityLabel = ({ common: 'Обычная', rare: 'Редкая', epic: 'Эпическая', legendary: 'Легендарная', mythic: 'Мифическая' } as Record<Rarity, string>)[chosen];
      }
      return { reward_name: payload.reward_name.trim() || (creatureSlug ? 'Коллекционная награда' : 'Случайный золотой запас'), reward_rarity: rarityLabel, reward_gold: gold, reward_creature_slug: creatureSlug };
    };
    const rewards = Array.from({ length: payload.count }, rewardForCode);
    const rewardGold = mode === 'fixed' ? Math.trunc(payload.reward_gold) : Math.trunc(payload.reward_gold_max);
    const rewardName = mode === 'fixed' ? (payload.reward_name.trim() || 'Пользовательская награда') : 'Случайная награда';
    const rewardRarity = mode === 'fixed' ? (payload.reward_rarity.trim() || 'Обычная') : 'Случайная';
    const codes = Array.from({ length: payload.count }, (_, i) => `INOME-DEMO-${demoBatchID}-${String(i + 1).padStart(3, '0')}`);
    const id = demoBatchID++;
    const batch: Batch = {
      id, label: payload.label, reward_name: rewardName, reward_rarity: rewardRarity, reward_gold: rewardGold,
      reward_creature_slug: fixedCreature, reward_mode: mode, reward_gold_min: mode === 'fixed' ? rewardGold : payload.reward_gold_min,
      reward_gold_max: mode === 'fixed' ? rewardGold : payload.reward_gold_max, reward_creature_rarities: selectedRarities,
      created_by: 100000001, created_at: new Date().toISOString(),
      expires_at: payload.expires_in_days ? new Date(Date.now() + payload.expires_in_days * 86_400_000).toISOString() : undefined,
      code_count: payload.count, redeemed_count: 0,
    };
    demoBatchRewards.set(id, rewards);
    demoBatches = [batch, ...demoBatches];
    return {
      batch_id: id, label: batch.label, count: payload.count, reward_mode: mode, reward_name: rewardName, reward_rarity: rewardRarity,
      reward_gold: rewardGold, reward_gold_min: batch.reward_gold_min ?? rewardGold, reward_gold_max: batch.reward_gold_max ?? rewardGold,
      reward_creature_rarities: selectedRarities, reward_creature_slug: fixedCreature, expires_at: batch.expires_at,
      codes, rewards,
    } as T;
  }

  const batchCodesMatch = path.match(/^\/api\/v1\/admin\/code-batches\/(\d+)\/codes$/);
  if (batchCodesMatch) {
    const batch = demoBatches.find((item) => item.id === Number(batchCodesMatch[1]));
    if (!batch) throw new APIError('Партия не найдена.', 404);
    const rewards = demoBatchRewards.get(batch.id) ?? Array.from({ length: batch.code_count }, () => ({ reward_name: batch.reward_name, reward_rarity: batch.reward_rarity, reward_gold: batch.reward_gold, reward_creature_slug: batch.reward_creature_slug }));
    return {
      batch_id: batch.id,
      codes: Array.from({ length: batch.code_count }, (_, index) => ({
        code: `INOME-DEMO-${batch.id}-${String(index + 1).padStart(3, '0')}`,
        ...rewards[index],
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

  const deleteSpeciesMatch = path.match(/^\/api\/v1\/admin\/creatures\/(\d+)$/);
  if (deleteSpeciesMatch && options.method === 'DELETE') {
    const id = Number(deleteSpeciesMatch[1]);
    const species = demoSpecies.find((item) => item.id === id);
    if (!species) throw new APIError('Иномекон не найден.', 404);
    demoCreatures = demoCreatures.filter((item) => item.species_slug !== species.slug);
    demoDiscoveredSlugs.delete(species.slug);
    demoBatches = demoBatches.map((batch) => batch.reward_creature_slug === species.slug && !batch.revoked_at
      ? { ...batch, revoked_at: new Date().toISOString() }
      : batch);
    demoSpecies = demoSpecies.filter((item) => item.id !== id);
    return { ok: true, id, deleted: true } as T;
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
      if (input.is_featured) demoSpecies = demoSpecies.map((species) => ({ ...species, is_featured: false }));
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
        main_bonus_type: input.main_bonus_type ?? 'none',
        main_bonus_multiplier: input.main_bonus_multiplier ?? 1,
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
      if (input.is_featured) demoSpecies = demoSpecies.map((species) => species.id === id ? species : { ...species, is_featured: false });
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