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


export type GameAbility = {
  slug: string; name: string; power: number; accuracy_percent: number; cooldown_seconds: number;
  effect_type: EffectType; effect_value: number; effect_duration_turns: number;
};
export type GameCreature = {
  player_telegram_id: number; player_name: string; creature_id: number; species_slug: string; name: string;
  image_url: string; rarity: Rarity; health: number; damage: number; crit_chance: number;
  passive_gold_per_hour: number; ability: GameAbility;
};
export type GamePlayerOption = { telegram_id: number; first_name: string; username?: string; creatures: GameCreature[] };
export type BattleStatus = 'waiting' | 'active' | 'finished' | 'declined' | 'cancelled';
export type StatusEffect = { type: string; value: number; turns_left: number; damage_per_turn?: number };
export type BattleFighterState = { hp: number; max_hp: number; ability_ready_at?: string; effects: StatusEffect[] };
export type BattleLogEntry = { at: string; type: string; message: string };
export type BattleState = {
  current_turn_telegram_id: number; round: number; challenger: BattleFighterState; opponent: BattleFighterState; log: BattleLogEntry[];
};
export type GameBattle = {
  id: number; status: BattleStatus; challenger_telegram_id: number; challenger_name: string;
  opponent_telegram_id: number; opponent_name: string; challenger_creature: GameCreature; opponent_creature: GameCreature;
  current_turn_telegram_id?: number; winner_telegram_id?: number; state: BattleState;
  created_at: string; updated_at: string; finished_at?: string;
};
export type GameTurnResult = { battle: GameBattle; message: string };

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

export type AbilityElement = 'meteor' | 'wind' | 'earth' | 'water' | 'arcane' | 'custom';
export type EffectType = 'none' | 'burn' | 'slow' | 'stun' | 'weaken' | 'shield';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type Ability = {
  id: number;
  slug: string;
  name: string;
  description: string;
  element: AbilityElement;
  power: number;
  accuracy_percent: number;
  cooldown_seconds: number;
  effect_type: EffectType;
  effect_value: number;
  effect_duration_turns: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type AbilityInput = {
  slug: string;
  name: string;
  description: string;
  element: AbilityElement;
  power: number;
  accuracy_percent: number;
  cooldown_seconds: number;
  effect_type: EffectType;
  effect_value: number;
  effect_duration_turns: number;
};

export type AbilityUpdateInput = Omit<AbilityInput, 'slug'>;

export type Species = {
  id: number;
  slug: string;
  name: string;
  description: string;
  image_url: string;
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
  rarity: Rarity;
  passive_gold_per_hour: number;
  health: number;
  damage: number;
  crit_chance: number;
  ability_id: number;
};

export type SpeciesUpdateInput = Omit<SpeciesInput, 'slug'>;

type RequestOptions = { method?: string; body?: unknown };
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

let demoGold = 350;
let demoCreatures: Creature[] = [{ id: 1, species_slug: 'ino-sprout', obtained_at: new Date().toISOString() }];
let demoBatches: Batch[] = [{
  id: 1, label: 'Тестовая партия', reward_gold: 50, created_by: 100000001,
  created_at: new Date(Date.now() - 86_400_000).toISOString(), code_count: 24, redeemed_count: 16,
}];
let demoBatchID = 2;
let demoAbilityID = 5;
let demoSpeciesID = 2;
let demoAbilities: Ability[] = [
  { id: 1, slug: 'meteor-strike', name: 'Метеоритный удар', description: 'Обрушивает на противника раскалённый метеорит.', element: 'meteor', power: 35, accuracy_percent: 85, cooldown_seconds: 30, effect_type: 'burn', effect_value: 10, effect_duration_turns: 4, is_default: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 2, slug: 'wind-gust', name: 'Ветряной порыв', description: 'Быстрый порыв воздуха, который сбивает противника с ритма.', element: 'wind', power: 18, accuracy_percent: 95, cooldown_seconds: 12, effect_type: 'slow', effect_value: 20, effect_duration_turns: 3, is_default: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 3, slug: 'earth-strike', name: 'Земляной удар', description: 'Мощный удар землёй, способный оглушить цель.', element: 'earth', power: 28, accuracy_percent: 90, cooldown_seconds: 22, effect_type: 'stun', effect_value: 1, effect_duration_turns: 2, is_default: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
  { id: 4, slug: 'water-jet', name: 'Водяная струя', description: 'Точная струя воды с высокой вероятностью попадания.', element: 'water', power: 22, accuracy_percent: 97, cooldown_seconds: 15, effect_type: 'none', effect_value: 0, effect_duration_turns: 0, is_default: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];
let demoSpecies: Species[] = [{
  id: 1, slug: 'ino-sprout', name: 'Иноспрут', description: 'Первый известный представитель иномеконов.', image_url: '', rarity: 'common',
  passive_gold_per_hour: 5, health: 100, damage: 12, crit_chance: 5, ability_id: 4, ability_name: 'Водяная струя', ability_slug: 'water-jet',
  is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
}];

function demoSnapshot(owner: number, ownerName: string, creatureID: number, slug = 'ino-sprout'): GameCreature {
  const species = demoSpecies.find((item) => item.slug === slug) ?? demoSpecies[0];
  const ability = demoAbilities.find((item) => item.id === species.ability_id) ?? demoAbilities[3];
  return { player_telegram_id: owner, player_name: ownerName, creature_id: creatureID, species_slug: species.slug, name: species.name,
    image_url: species.image_url, rarity: species.rarity, health: species.health, damage: species.damage, crit_chance: species.crit_chance,
    passive_gold_per_hour: species.passive_gold_per_hour, ability: { slug: ability.slug, name: ability.name, power: ability.power,
      accuracy_percent: ability.accuracy_percent, cooldown_seconds: ability.cooldown_seconds, effect_type: ability.effect_type,
      effect_value: ability.effect_value, effect_duration_turns: ability.effect_duration_turns } };
}
let demoGamePlayers: GamePlayerOption[] = [
  { telegram_id: 100000002, first_name: 'Алексей', creatures: [demoSnapshot(100000002, 'Алексей', 201)] },
  { telegram_id: 100000003, first_name: 'Мария', creatures: [demoSnapshot(100000003, 'Мария', 301)] },
];
let demoGameBattles: GameBattle[] = [];
let demoGameBattleID = 1;
function blankFighter(hp: number): BattleFighterState { return { hp, max_hp: hp, effects: [] }; }

export class APIError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) { super(message); this.name = 'APIError'; this.status = status; this.code = code; }
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
      const payload = await response.json() as { error?: { message?: string; code?: string }; message?: string };
      message = payload.error?.message ?? payload.message ?? message;
      code = payload.error?.code;
    } catch { /* Preserve the HTTP status as a useful fallback. */ }
    throw new APIError(message, response.status, code);
  }
  return await response.json() as T;
}

export const api = {
  me: (initData: string) => request<Player>('/api/v1/game/overview', initData),
  creatures: (initData: string) => request<{ items: Creature[] }>('/api/v1/me/creatures', initData),
  gamePlayers: (initData: string) => request<{ items: GamePlayerOption[] }>('/api/v1/game/players', initData),
  gameBattles: (initData: string) => request<{ items: GameBattle[] }>('/api/v1/game/battles', initData),
  createBattle: (initData: string, payload: { my_creature_id: number; opponent_creature_id: number }) => request<GameBattle>('/api/v1/game/battles', initData, { method: 'POST', body: payload }),
  acceptBattle: (initData: string, id: number) => request<GameBattle>(`/api/v1/game/battles/${id}/accept`, initData, { method: 'POST', body: {} }),
  declineBattle: (initData: string, id: number) => request<{ ok: boolean; id: number }>(`/api/v1/game/battles/${id}/decline`, initData, { method: 'POST', body: {} }),
  cancelBattle: (initData: string, id: number) => request<{ ok: boolean; id: number }>(`/api/v1/game/battles/${id}/cancel`, initData, { method: 'POST', body: {} }),
  battleTurn: (initData: string, id: number, action: 'basic' | 'ability') => request<GameTurnResult>(`/api/v1/game/battles/${id}/turn`, initData, { method: 'POST', body: { action } }),
  surrenderBattle: (initData: string, id: number) => request<GameBattle>(`/api/v1/game/battles/${id}/surrender`, initData, { method: 'POST', body: {} }),
  redeem: (initData: string, code: string) => request<RedeemResult>('/api/v1/codes/redeem', initData, { method: 'POST', body: { code } }),
  listBatches: (initData: string) => request<{ items: Batch[] }>('/api/v1/admin/code-batches?limit=50&offset=0', initData),
  createBatch: (initData: string, payload: CreateBatchInput) => request<CreatedBatch>('/api/v1/admin/code-batches', initData, { method: 'POST', body: payload }),
  batchCodes: (initData: string, id: number) => request<BatchCodesResponse>(`/api/v1/admin/code-batches/${id}/codes`, initData),
  revokeBatch: (initData: string, id: number) => request<{ ok: boolean; batch_id: number }>(`/api/v1/admin/code-batches/${id}/revoke`, initData, { method: 'POST', body: {} }),
  deleteBatch: (initData: string, id: number) => request<{ ok: boolean; batch_id: number }>(`/api/v1/admin/code-batches/${id}`, initData, { method: 'DELETE' }),
  listAbilities: (initData: string) => request<{ items: Ability[] }>('/api/v1/admin/abilities', initData),
  createAbility: (initData: string, payload: AbilityInput) => request<Ability>('/api/v1/admin/abilities', initData, { method: 'POST', body: payload }),
  updateAbility: (initData: string, id: number, payload: AbilityUpdateInput) => request<Ability>(`/api/v1/admin/abilities/${id}`, initData, { method: 'PUT', body: payload }),
  deleteAbility: (initData: string, id: number) => request<{ ok: boolean; id: number }>(`/api/v1/admin/abilities/${id}`, initData, { method: 'DELETE' }),
  listSpecies: (initData: string, admin = true) => request<{ items: Species[] }>(admin ? '/api/v1/admin/creatures' : '/api/v1/catalog/creatures', initData),
  createSpecies: (initData: string, payload: SpeciesInput) => request<Species>('/api/v1/admin/creatures', initData, { method: 'POST', body: payload }),
  updateSpecies: (initData: string, id: number, payload: SpeciesUpdateInput) => request<Species>(`/api/v1/admin/creatures/${id}`, initData, { method: 'PUT', body: payload }),
  archiveSpecies: (initData: string, id: number) => request<{ ok: boolean; id: number }>(`/api/v1/admin/creatures/${id}`, initData, { method: 'DELETE' }),
  uploadImage: async (initData: string, file: File): Promise<{ image_url: string; width: number; height: number; format: string }> => {
    if (DEMO_MODE) {
      const dataURL = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Не удалось прочитать изображение.')); reader.onerror = () => reject(new Error('Не удалось прочитать изображение.')); reader.readAsDataURL(file);
      });
      return { image_url: dataURL, width: 0, height: 0, format: file.type.split('/')[1] ?? 'image' };
    }
    const form = new FormData(); form.append('image', file);
    const response = await fetch('/api/v1/admin/uploads/images', { method: 'POST', headers: { Authorization: `tma ${initData}` }, body: form });
    if (!response.ok) {
      let message = `Не удалось загрузить изображение (${response.status}).`;
      try { const payload = await response.json() as { error?: { message?: string } }; message = payload.error?.message ?? message; } catch { /* keep fallback */ }
      throw new APIError(message, response.status);
    }
    return await response.json() as { image_url: string; width: number; height: number; format: string };
  },
};

async function demoRequest<T>(path: string, options: RequestOptions): Promise<T> {
  await new Promise((resolve) => window.setTimeout(resolve, 100));
  if (path === '/api/v1/game/overview' || path === '/api/v1/me') return { telegram_id: 100000001, username: 'demo_player', first_name: 'Игрок', gold: demoGold, created_at: new Date().toISOString(), passive_gold_per_hour: demoCreatures.length * 5, passive_gold_claimed: 0, last_passive_claim_at: new Date().toISOString(), owned_creature_count: demoCreatures.length } as T;
  if (path === '/api/v1/me/creatures') return { items: demoCreatures } as T;
  if (path === '/api/v1/game/players') return { items: demoGamePlayers } as T;
  if (path === '/api/v1/game/battles' && (!options.method || options.method === 'GET')) return { items: demoGameBattles.filter((battle) => battle.challenger_telegram_id === 100000001 || battle.opponent_telegram_id === 100000001) } as T;
  if (path === '/api/v1/game/battles' && options.method === 'POST') {
    const input = options.body as { my_creature_id: number; opponent_creature_id: number };
    const owned = demoCreatures.find((item) => item.id === input.my_creature_id);
    const opponent = demoGamePlayers.flatMap((item) => item.creatures).find((item) => item.creature_id === input.opponent_creature_id);
    if (!owned || !opponent) throw new APIError('Выбранный иномекон не найден.', 404);
    const mine = demoSnapshot(100000001, 'Игрок', owned.id, owned.species_slug);
    const battle: GameBattle = { id: demoGameBattleID++, status: 'waiting', challenger_telegram_id: 100000001, challenger_name: 'Игрок', opponent_telegram_id: opponent.player_telegram_id, opponent_name: opponent.player_name, challenger_creature: mine, opponent_creature: opponent, state: { current_turn_telegram_id: 0, round: 0, challenger: blankFighter(mine.health), opponent: blankFighter(opponent.health), log: [] }, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    demoGameBattles = [battle, ...demoGameBattles]; return battle as T;
  }
  const demoAccept = path.match(/^\/api\/v1\/game\/battles\/(\d+)\/(accept|decline|cancel|turn)$/);
  if (demoAccept) {
    const id = Number(demoAccept[1]); const action = demoAccept[2]; const battle = demoGameBattles.find((item) => item.id === id);
    if (!battle) throw new APIError('Дуэль не найдена.', 404);
    if (action === 'accept') {
      if (battle.opponent_telegram_id !== 100000001 || battle.status !== 'waiting') throw new APIError('Нельзя принять этот вызов.', 409);
      battle.status = 'active'; battle.state.current_turn_telegram_id = battle.challenger_telegram_id; battle.state.round = 1;
      battle.state.challenger = blankFighter(battle.challenger_creature.health); battle.state.opponent = blankFighter(battle.opponent_creature.health);
      battle.state.log = [{ at: new Date().toISOString(), type: 'system', message: 'Дуэль началась.' }]; battle.updated_at = new Date().toISOString(); return battle as T;
    }
    if (action === 'decline' || action === 'cancel') { if (battle.status !== 'waiting') throw new APIError('Вызов уже обработан.', 409); battle.status = action === 'decline' ? 'declined' : 'cancelled'; battle.updated_at = new Date().toISOString(); return { ok: true, id } as T; }
    if (battle.status !== 'active') throw new APIError('Дуэль не активна.', 409);
    if (battle.state.current_turn_telegram_id !== 100000001) throw new APIError('Сейчас ход другого игрока.', 409);
    const turnInput = options.body as { action: 'basic' | 'ability' };
    const skillDamage = turnInput.action === 'ability' ? battle.challenger_creature.ability.power : 0;
    const damage = Math.max(1, battle.challenger_creature.damage + skillDamage);
    battle.state.opponent.hp = Math.max(0, battle.state.opponent.hp - damage);
    battle.state.log.push({ at: new Date().toISOString(), type: 'attack', message: `${battle.challenger_creature.name} наносит ${damage} урона.` });
    if (battle.state.opponent.hp <= 0) { battle.status = 'finished'; battle.winner_telegram_id = 100000001; battle.state.log.push({ at: new Date().toISOString(), type: 'finish', message: 'Игрок победил в дуэли.' }); }
    else {
      const counterDamage = Math.max(1, battle.opponent_creature.damage);
      battle.state.challenger.hp = Math.max(0, battle.state.challenger.hp - counterDamage);
      battle.state.log.push({ at: new Date().toISOString(), type: 'attack', message: `${battle.opponent_creature.name} наносит ${counterDamage} урона.` });
      if (battle.state.challenger.hp <= 0) { battle.status = 'finished'; battle.winner_telegram_id = battle.opponent_telegram_id; battle.state.log.push({ at: new Date().toISOString(), type: 'finish', message: `${battle.opponent_name} победил.` }); }
      else { battle.state.current_turn_telegram_id = 100000001; battle.state.round += 1; }
    }
    battle.updated_at = new Date().toISOString(); return { battle, message: `Ход выполнен: ${damage} урона.` } as T;
  }
  if (path === '/api/v1/codes/redeem') {
    const body = options.body as { code: string };
    if (!body.code.trim()) throw new APIError('В ссылке нет кода.', 422);
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
    const batch: Batch = { id: demoBatchID++, label: payload.label, reward_gold: rewardGold, reward_creature_slug: creature, created_by: 100000001, created_at: new Date().toISOString(), expires_at: payload.expires_in_days ? new Date(Date.now() + payload.expires_in_days * 86_400_000).toISOString() : undefined, code_count: payload.count, redeemed_count: 0 };
    demoBatches = [batch, ...demoBatches];
    return { batch_id: batch.id, label: batch.label, count: payload.count, reward_gold: rewardGold, reward_creature_slug: creature, expires_at: batch.expires_at, codes } as T;
  }
  const batchCodesMatch = path.match(/^\/api\/v1\/admin\/code-batches\/(\d+)\/codes$/);
  if (batchCodesMatch) {
    const batch = demoBatches.find((item) => item.id === Number(batchCodesMatch[1]));
    if (!batch) throw new APIError('Партия не найдена.', 404);
    return { batch_id: batch.id, codes: Array.from({ length: batch.code_count }, (_, index) => ({ code: `INOME-DEMO-${batch.id}-${String(index + 1).padStart(3, '0')}` })), unavailable_count: 0 } as T;
  }
  const revokeBatchMatch = path.match(/^\/api\/v1\/admin\/code-batches\/(\d+)\/revoke$/);
  if (revokeBatchMatch) { const batch = demoBatches.find((item) => item.id === Number(revokeBatchMatch[1])); if (!batch || batch.revoked_at) throw new APIError('Партия не найдена или уже отозвана.', 404); batch.revoked_at = new Date().toISOString(); return { ok: true, batch_id: batch.id } as T; }
  const deleteBatchMatch = path.match(/^\/api\/v1\/admin\/code-batches\/(\d+)$/);
  if (deleteBatchMatch && options.method === 'DELETE') { const id = Number(deleteBatchMatch[1]); const batch = demoBatches.find((item) => item.id === id); if (!batch) throw new APIError('Партия не найдена.', 404); if (batch.redeemed_count) throw new APIError('Нельзя удалить партию с активированными кодами.', 409); demoBatches = demoBatches.filter((item) => item.id !== id); return { ok: true, batch_id: id } as T; }
  if (path === '/api/v1/admin/abilities') {
    if (options.method === 'POST') {
      const input = options.body as AbilityInput;
      if (demoAbilities.some((item) => item.slug === input.slug)) throw new APIError('Такой идентификатор уже существует.', 409);
      const now = new Date().toISOString(); const created: Ability = { ...input, id: demoAbilityID++, is_default: false, created_at: now, updated_at: now };
      demoAbilities = [...demoAbilities, created]; return created as T;
    }
    return { items: demoAbilities } as T;
  }
  const abilityMatch = path.match(/^\/api\/v1\/admin\/abilities\/(\d+)$/);
  if (abilityMatch) {
    const id = Number(abilityMatch[1]); const item = demoAbilities.find((ability) => ability.id === id);
    if (!item) throw new APIError('Способность не найдена.', 404);
    if (options.method === 'PUT') { const updated = { ...item, ...(options.body as AbilityUpdateInput), updated_at: new Date().toISOString() }; demoAbilities = demoAbilities.map((ability) => ability.id === id ? updated : ability); return updated as T; }
    if (options.method === 'DELETE') { if (item.is_default) throw new APIError('Четыре базовые способности нельзя удалить.', 409); if (demoSpecies.some((species) => species.ability_id === id)) throw new APIError('Эта способность назначена иномекону.', 409); demoAbilities = demoAbilities.filter((ability) => ability.id !== id); return { ok: true, id } as T; }
  }
  if (path === '/api/v1/admin/creatures' || path === '/api/v1/catalog/creatures') {
    if (path === '/api/v1/catalog/creatures') return { items: demoSpecies.filter((species) => species.is_active) } as T;
    if (options.method === 'POST') {
      const input = options.body as SpeciesInput;
      if (demoSpecies.some((species) => species.slug === input.slug)) throw new APIError('Такой slug уже существует.', 409);
      const ability = demoAbilities.find((item) => item.id === input.ability_id); if (!ability) throw new APIError('Выбранная способность не найдена.', 400);
      const now = new Date().toISOString(); const created: Species = { ...input, id: demoSpeciesID++, ability_name: ability.name, ability_slug: ability.slug, is_active: true, created_at: now, updated_at: now };
      demoSpecies = [created, ...demoSpecies]; return created as T;
    }
    return { items: demoSpecies } as T;
  }
  const speciesMatch = path.match(/^\/api\/v1\/admin\/creatures\/(\d+)$/);
  if (speciesMatch) {
    const id = Number(speciesMatch[1]); const item = demoSpecies.find((species) => species.id === id);
    if (!item) throw new APIError('Иномекон не найден.', 404);
    if (options.method === 'PUT') { const input = options.body as SpeciesUpdateInput; const ability = demoAbilities.find((entry) => entry.id === input.ability_id); if (!ability) throw new APIError('Выбранная способность не найдена.', 400); const updated: Species = { ...item, ...input, ability_name: ability.name, ability_slug: ability.slug, updated_at: new Date().toISOString() }; demoSpecies = demoSpecies.map((species) => species.id === id ? updated : species); return updated as T; }
    if (options.method === 'DELETE') { item.is_active = false; item.updated_at = new Date().toISOString(); return { ok: true, id } as T; }
  }
  throw new APIError('Маршрут не найден.', 404);
}

export const isDemoMode = DEMO_MODE;
