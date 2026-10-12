import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import QRCode from 'qrcode';
import { APIError, api, isDemoMode } from './api';
import type {
  Ability, AbilityElement, AbilityInput, AbilityUpdateInput, Batch, CreatedBatch, Creature,
  CreateBatchInput, EffectType, Player, RedeemResult, Rarity, Species, SpeciesInput, SpeciesUpdateInput,
  GamePlayerOption, GameBattle,
} from './api';

type Page = 'home' | 'collection' | 'arena' | 'admin';
type AdminSection = 'creatures' | 'abilities' | 'codes';
type Notice = { kind: 'success' | 'error' | 'info'; title: string; message: string };
type Editor<T> = { id?: number; values: T };
type QRCard = { code: string; url: string; dataUrl: string };

const EMPTY_SPECIES = (): SpeciesInput => ({
  slug: '', name: '', description: '', image_url: '', rarity: 'common', passive_gold_per_hour: 0,
  health: 100, damage: 15, crit_chance: 5, ability_id: 1,
});
const EMPTY_ABILITY = (): AbilityInput => ({
  slug: '', name: '', description: '', element: 'custom', power: 20, accuracy_percent: 90,
  cooldown_seconds: 15, effect_type: 'none', effect_value: 0, effect_duration_turns: 0,
});
const RARITIES: { value: Rarity; label: string }[] = [
  { value: 'common', label: 'Обычная' }, { value: 'rare', label: 'Редкая' }, { value: 'epic', label: 'Эпическая' },
  { value: 'legendary', label: 'Легендарная' }, { value: 'mythic', label: 'Мифическая' },
];
const ELEMENTS: { value: AbilityElement; label: string }[] = [
  { value: 'meteor', label: 'Метеорит' }, { value: 'wind', label: 'Ветер' }, { value: 'earth', label: 'Земля' },
  { value: 'water', label: 'Вода' }, { value: 'arcane', label: 'Аркана' }, { value: 'custom', label: 'Другое' },
];
const EFFECTS: { value: EffectType; label: string }[] = [
  { value: 'none', label: 'Нет' }, { value: 'burn', label: 'Горение' }, { value: 'slow', label: 'Замедление' },
  { value: 'stun', label: 'Оглушение' }, { value: 'weaken', label: 'Ослабление' }, { value: 'shield', label: 'Щит' },
];
const REWARDS: Record<CreateBatchInput['reward_preset'], { label: string; gold: number; creature?: string }> = {
  gold50: { label: 'Обычная карточка', gold: 50 }, gold500: { label: 'Редкая карточка', gold: 500 },
  mecop150: { label: 'Карточка с иномеконом', gold: 150, creature: 'ino-sprout' },
};

function formatNumber(value: number): string { return new Intl.NumberFormat('ru-RU').format(value); }
function formatDate(value?: string): string {
  if (!value) return 'Без срока';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}
function creatureName(slug: string): string {
  const names: Record<string, string> = { 'ino-sprout': 'Иноспрут' };
  return names[slug] ?? slug.replaceAll('-', ' ').replace(/^./, (char) => char.toUpperCase());
}
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Произошла неизвестная ошибка.';
}
function getStartParam(telegram: TelegramWebApp | undefined): string {
  const signedLaunchParam = telegram?.initDataUnsafe.start_param;
  if (typeof signedLaunchParam === 'string' && signedLaunchParam.trim()) return signedLaunchParam.trim();
  const params = new URLSearchParams(window.location.search);
  return (params.get('tgWebAppStartParam') ?? params.get('startapp') ?? '').trim();
}
function buildStartAppURL(botUsername: string, code: string): string {
  const username = botUsername.trim().replace(/^@/, '');
  return `https://t.me/${username}?startapp=${encodeURIComponent(code)}`;
}
function csvQuote(value: string | number): string { return `"${String(value).replaceAll('"', '""')}"`; }
function downloadCSV(batch: CreatedBatch, botUsername: string) {
  const rows = [
    ['code', 'telegram_startapp_url', 'batch_id', 'label', 'reward_gold', 'reward_creature_slug', 'expires_at'].map(csvQuote).join(','),
    ...batch.codes.map((code) => [code, botUsername ? buildStartAppURL(botUsername, code) : '', batch.batch_id, batch.label, batch.reward_gold, batch.reward_creature_slug ?? '', batch.expires_at ?? ''].map(csvQuote).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `inomecops-batch-${batch.batch_id}.csv`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}

function Help({ text }: { text: string }) {
  return <details className="help"><summary aria-label="Пояснение">?</summary><span className="help-popover">{text}</span></details>;
}
function FieldLabel({ children, help }: { children: string; help?: string }) {
  return <span className="field-label">{children}{help && <Help text={help} />}</span>;
}
function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return <div className={`notice notice--${notice.kind}`} role="status"><div><strong>{notice.title}</strong><span>{notice.message}</span></div><button className="icon-button" onClick={onClose} aria-label="Закрыть сообщение">×</button></div>;
}
function ImagePreview({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed) return <img className="species-image" src={src} alt={`Изображение: ${name}`} onError={() => setFailed(true)} />;
  return <div className="species-image species-image--empty" aria-label="Изображение не добавлено"><span>Нет изображения</span></div>;
}

function App() {
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData ?? '';
  const launchCode = getStartParam(telegram);
  const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, '');
  const autoRedeemAttempted = useRef('');

  const [page, setPage] = useState<Page>('home');
  const [adminSection, setAdminSection] = useState<AdminSection>('creatures');
  const [player, setPlayer] = useState<Player | null>(null);
  const [ownedCreatures, setOwnedCreatures] = useState<Creature[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayerOption[]>([]);
  const [battles, setBattles] = useState<GameBattle[]>([]);
  const [chosenCreatureID, setChosenCreatureID] = useState('');
  const [chosenOpponentID, setChosenOpponentID] = useState('');
  const [chosenOpponentCreatureID, setChosenOpponentCreatureID] = useState('');
  const [gameActionID, setGameActionID] = useState<number | null>(null);
  const [species, setSpecies] = useState<Species[]>([]);
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);

  const [speciesEditor, setSpeciesEditor] = useState<Editor<SpeciesInput> | null>(null);
  const [abilityEditor, setAbilityEditor] = useState<Editor<AbilityInput> | null>(null);
  const [savingSpecies, setSavingSpecies] = useState(false);
  const [savingAbility, setSavingAbility] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [archivingSpeciesID, setArchivingSpeciesID] = useState<number | null>(null);
  const [deletingAbilityID, setDeletingAbilityID] = useState<number | null>(null);

  const [batchLabel, setBatchLabel] = useState('Школьная партия');
  const [batchCount, setBatchCount] = useState('20');
  const [rewardPreset, setRewardPreset] = useState<CreateBatchInput['reward_preset']>('gold50');
  const [expiresInDays, setExpiresInDays] = useState('0');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [createdBatch, setCreatedBatch] = useState<CreatedBatch | null>(null);
  const [revokingID, setRevokingID] = useState<number | null>(null);
  const [qrCards, setQrCards] = useState<QRCard[]>([]);
  const [generatingQR, setGeneratingQR] = useState(false);

  const demoMode = isDemoMode;
  const inTelegram = Boolean(telegram && initData);
  const canOpen = demoMode || inTelegram;
  const displayName = player?.first_name || telegram?.initDataUnsafe.user?.first_name || 'Игрок';
  const currentSpecies = useMemo(() => new Map(species.map((item) => [item.slug, item])), [species]);
  const batchTotals = useMemo(() => batches.reduce((totals, batch) => ({
    codes: totals.codes + batch.code_count, used: totals.used + batch.redeemed_count,
    available: totals.available + Math.max(0, batch.code_count - batch.redeemed_count - (batch.revoked_at ? batch.code_count - batch.redeemed_count : 0)),
  }), { codes: 0, used: 0, available: 0 }), [batches]);

  const loadAdminData = useCallback(async () => {
    const [batchResponse, abilityResponse, speciesResponse] = await Promise.all([
      api.listBatches(initData), api.listAbilities(initData), api.listSpecies(initData, true),
    ]);
    setBatches(batchResponse.items ?? []); setAbilities(abilityResponse.items ?? []); setSpecies(speciesResponse.items ?? []);
  }, [initData]);

  const loadArenaData = useCallback(async () => {
    const [playersResponse, battlesResponse] = await Promise.all([api.gamePlayers(initData), api.gameBattles(initData)]);
    setGamePlayers(playersResponse.items ?? []);
    setBattles(battlesResponse.items ?? []);
  }, [initData]);

  const loadData = useCallback(async () => {
    if (!canOpen) { setLoading(false); return; }
    setLoading(true); setLoadError('');
    try {
      const [playerResponse, creatureResponse] = await Promise.all([api.me(initData), api.creatures(initData)]);
      setPlayer(playerResponse); setOwnedCreatures(creatureResponse.items ?? []);
      if ((playerResponse.passive_gold_claimed ?? 0) > 0) {
        setNotice({ kind: 'success', title: 'Пассивный доход начислен', message: `+${formatNumber(playerResponse.passive_gold_claimed ?? 0)} золота за время отсутствия.` });
      }
      try { await loadArenaData(); } catch { /* Home and collection can still work when arena is unavailable. */ }
      try {
        const catalog = await api.listSpecies(initData, false); setSpecies(catalog.items ?? []);
      } catch { /* The player's profile remains available if public catalog is temporarily unavailable. */ }
      try { await loadAdminData(); setIsAdmin(true); }
      catch (error) { if (error instanceof APIError && error.status === 401) throw error; setIsAdmin(false); }
    } catch (error) { setLoadError(errorMessage(error)); }
    finally { setLoading(false); }
  }, [canOpen, initData, loadAdminData, loadArenaData]);

  useEffect(() => { telegram?.ready(); telegram?.expand(); void loadData(); }, [telegram, loadData]);
  useEffect(() => {
    if (!canOpen) return;
    const timer = window.setInterval(() => {
      void api.me(initData).then(setPlayer).catch(() => undefined);
      void api.gameBattles(initData).then((result) => setBattles(result.items ?? [])).catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [canOpen, initData]);

  const redeemCode = useCallback(async (rawCode: string) => {
    const normalized = rawCode.trim().toUpperCase();
    if (!normalized) { setNotice({ kind: 'error', title: 'Код не найден', message: 'В ссылке нет кода активации.' }); return; }
    setRedeeming(true); setRedeemResult(null); setNotice({ kind: 'info', title: 'Проверяем карточку', message: 'Подключаемся к серверу и проверяем награду.' });
    try {
      const result = await api.redeem(initData, normalized); setRedeemResult(result); setCode('');
      setPlayer((previous) => previous ? { ...previous, gold: result.gold_balance } : previous);
      const creatureResponse = await api.creatures(initData); setOwnedCreatures(creatureResponse.items ?? []);
      setNotice({ kind: 'success', title: 'Карточка активирована', message: `Получено ${formatNumber(result.gold_added)} золота${result.creature_slug ? ` и новый иномекон: ${creatureName(result.creature_slug)}` : ''}.` });
      telegram?.HapticFeedback?.notificationOccurred('success');
    } catch (error) { setNotice({ kind: 'error', title: 'Не удалось активировать', message: errorMessage(error) }); telegram?.HapticFeedback?.notificationOccurred('error'); }
    finally { setRedeeming(false); }
  }, [initData, telegram]);

  useEffect(() => {
    if (!launchCode || !canOpen || loading || autoRedeemAttempted.current === launchCode) return;
    autoRedeemAttempted.current = launchCode; void redeemCode(launchCode);
  }, [launchCode, canOpen, loading, redeemCode]);

  const handleRedeem = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void redeemCode(code); };
  const showPage = (next: Page) => { setPage(next); setNotice(null); telegram?.HapticFeedback?.selectionChanged(); };

  const handleSaveSpecies = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!speciesEditor) return;
    const v = speciesEditor.values; setSavingSpecies(true);
    try {
      let saved: Species;
      if (speciesEditor.id) {
        const payload: SpeciesUpdateInput = {
          name: v.name, description: v.description, image_url: v.image_url, rarity: v.rarity,
          passive_gold_per_hour: v.passive_gold_per_hour, health: v.health, damage: v.damage,
          crit_chance: v.crit_chance, ability_id: v.ability_id,
        };
        saved = await api.updateSpecies(initData, speciesEditor.id, payload);
        setNotice({ kind: 'success', title: 'Изменения сохранены', message: `${saved.name} обновлён.` });
      } else {
        saved = await api.createSpecies(initData, v);
        setNotice({ kind: 'success', title: 'Иномекон создан', message: `${saved.name} добавлен в каталог.` });
      }
      setSpecies((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setSpeciesEditor(null);
    } catch (error) { setNotice({ kind: 'error', title: 'Не удалось сохранить иномекона', message: errorMessage(error) }); }
    finally { setSavingSpecies(false); }
  };

  const handleSpeciesImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0]; if (!file || !speciesEditor) return;
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) { setNotice({ kind: 'error', title: 'Формат не поддерживается', message: 'Загрузи изображение PNG, JPEG или GIF.' }); fileInput.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { setNotice({ kind: 'error', title: 'Файл слишком большой', message: 'Максимальный размер изображения — 5 МБ.' }); fileInput.value = ''; return; }
    setUploadingImage(true);
    try {
      const result = await api.uploadImage(initData, file);
      setSpeciesEditor((editor) => editor ? { ...editor, values: { ...editor.values, image_url: result.image_url } } : editor);
      setNotice({ kind: 'success', title: 'Изображение добавлено', message: 'Файл загружен и привязан к форме иномекона.' });
    } catch (error) { setNotice({ kind: 'error', title: 'Ошибка загрузки', message: errorMessage(error) }); }
    finally { setUploadingImage(false); fileInput.value = ''; }
  };

  const handleArchiveSpecies = async (item: Species) => {
    if (!window.confirm(`Архивировать «${item.name}»? Он останется в старых коллекциях, но не будет доступен в активном каталоге.`)) return;
    setArchivingSpeciesID(item.id);
    try { await api.archiveSpecies(initData, item.id); setSpecies((items) => items.map((speciesItem) => speciesItem.id === item.id ? { ...speciesItem, is_active: false } : speciesItem)); setNotice({ kind: 'success', title: 'Иномекон архивирован', message: `${item.name} больше не появится в активном каталоге.` }); }
    catch (error) { setNotice({ kind: 'error', title: 'Не удалось архивировать', message: errorMessage(error) }); }
    finally { setArchivingSpeciesID(null); }
  };

  const handleSaveAbility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!abilityEditor) return;
    setSavingAbility(true); const v = abilityEditor.values;
    try {
      let saved: Ability;
      if (abilityEditor.id) {
        const payload: AbilityUpdateInput = {
          name: v.name, description: v.description, element: v.element, power: v.power,
          accuracy_percent: v.accuracy_percent, cooldown_seconds: v.cooldown_seconds,
          effect_type: v.effect_type, effect_value: v.effect_value, effect_duration_turns: v.effect_duration_turns,
        };
        saved = await api.updateAbility(initData, abilityEditor.id, payload);
        setNotice({ kind: 'success', title: 'Способность обновлена', message: `${saved.name}: характеристики сохранены.` });
      } else {
        saved = await api.createAbility(initData, v);
        setNotice({ kind: 'success', title: 'Способность создана', message: `${saved.name} доступна для назначения иномеконам.` });
      }
      setAbilities((items) => [saved, ...items.filter((item) => item.id !== saved.id)]); setAbilityEditor(null);
    } catch (error) { setNotice({ kind: 'error', title: 'Не удалось сохранить способность', message: errorMessage(error) }); }
    finally { setSavingAbility(false); }
  };

  const handleDeleteAbility = async (ability: Ability) => {
    if (!window.confirm(`Удалить способность «${ability.name}»?`)) return;
    setDeletingAbilityID(ability.id);
    try { await api.deleteAbility(initData, ability.id); setAbilities((items) => items.filter((item) => item.id !== ability.id)); setNotice({ kind: 'success', title: 'Способность удалена', message: ability.name }); }
    catch (error) { setNotice({ kind: 'error', title: 'Не удалось удалить', message: errorMessage(error) }); }
    finally { setDeletingAbilityID(null); }
  };

  const handleCreateBattle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const myID = Number(chosenCreatureID), opponentID = Number(chosenOpponentCreatureID);
    if (!myID || !opponentID) { setNotice({ kind: 'error', title: 'Выбери иномеконов', message: 'Для вызова нужно выбрать своего иномекона и иномекона соперника.' }); return; }
    setGameActionID(-1);
    try {
      await api.createBattle(initData, { my_creature_id: myID, opponent_creature_id: opponentID });
      await loadArenaData();
      setNotice({ kind: 'success', title: 'Вызов отправлен', message: 'Соперник увидит приглашение в разделе «Арена» и сможет принять его.' });
    } catch (error) { setNotice({ kind: 'error', title: 'Не удалось вызвать на дуэль', message: errorMessage(error) }); }
    finally { setGameActionID(null); }
  };

  const handleBattleRequest = async (battle: GameBattle, action: 'accept' | 'decline' | 'cancel') => {
    setGameActionID(battle.id);
    try {
      if (action === 'accept') await api.acceptBattle(initData, battle.id);
      else if (action === 'decline') await api.declineBattle(initData, battle.id);
      else await api.cancelBattle(initData, battle.id);
      await loadArenaData();
      setNotice({ kind: 'success', title: action === 'accept' ? 'Дуэль началась' : action === 'decline' ? 'Вызов отклонён' : 'Вызов отменён', message: action === 'accept' ? 'Первый ход за игроком, который отправил вызов.' : 'Статус дуэли обновлён.' });
    } catch (error) { setNotice({ kind: 'error', title: 'Не удалось обработать вызов', message: errorMessage(error) }); }
    finally { setGameActionID(null); }
  };

  const handleBattleTurn = async (battle: GameBattle, action: 'basic' | 'ability') => {
    setGameActionID(battle.id);
    try {
      const result = await api.battleTurn(initData, battle.id, action);
      await Promise.all([loadArenaData(), api.me(initData).then(setPlayer)]);
      setNotice({ kind: 'success', title: 'Ход завершён', message: result.message });
      telegram?.HapticFeedback?.selectionChanged();
    } catch (error) { setNotice({ kind: 'error', title: 'Ход не выполнен', message: errorMessage(error) }); }
    finally { setGameActionID(null); }
  };

  const handleCreateBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const count = Number(batchCount); const expiry = Number(expiresInDays);
    if (!batchLabel.trim() || !Number.isInteger(count) || count < 1 || count > 500 || !Number.isInteger(expiry) || expiry < 0 || expiry > 365) {
      setNotice({ kind: 'error', title: 'Проверь параметры', message: 'Название обязательно, количество — 1–500, срок — 0–365 дней.' }); return;
    }
    setCreatingBatch(true); setCreatedBatch(null); setQrCards([]);
    try {
      const result = await api.createBatch(initData, { label: batchLabel.trim(), count, reward_preset: rewardPreset, expires_in_days: expiry });
      setCreatedBatch(result); setBatches((items) => [{ id: result.batch_id, label: result.label, reward_gold: result.reward_gold, reward_creature_slug: result.reward_creature_slug, created_by: player?.telegram_id ?? 0, created_at: new Date().toISOString(), expires_at: result.expires_at, code_count: result.count, redeemed_count: 0 }, ...items]);
      setNotice({ kind: 'success', title: 'Партия готова', message: `Создано ${result.count} одноразовых кодов. Скачай CSV или подготовь QR-карточки.` });
    } catch (error) { setNotice({ kind: 'error', title: 'Не удалось создать партию', message: errorMessage(error) }); }
    finally { setCreatingBatch(false); }
  };

  const handlePrepareQR = async () => {
    if (!createdBatch) return;
    if (demoMode) { setNotice({ kind: 'info', title: 'QR недоступен в демо', message: 'Демо-коды не существуют на сервере. Настрой реальный backend и отключи VITE_DEMO_MODE перед печатью.' }); return; }
    if (!botUsername || !/^[A-Za-z0-9_]{5,32}$/.test(botUsername)) { setNotice({ kind: 'error', title: 'Не задан username бота', message: 'Укажи VITE_TELEGRAM_BOT_USERNAME в frontend/.env.local и перезапусти Vite.' }); return; }
    setGeneratingQR(true);
    try {
      const cards = await Promise.all(createdBatch.codes.map(async (value) => {
        const url = buildStartAppURL(botUsername, value);
        const dataUrl = await QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 2, width: 280, color: { dark: '#101315', light: '#FFFFFF' } });
        return { code: value, url, dataUrl };
      }));
      setQrCards(cards); window.setTimeout(() => window.print(), 120);
    } catch (error) { setNotice({ kind: 'error', title: 'Не удалось создать QR', message: errorMessage(error) }); }
    finally { setGeneratingQR(false); }
  };

  const handleRevokeBatch = async (batch: Batch) => {
    if (!window.confirm(`Отозвать партию «${batch.label}»? Неактивированные коды перестанут работать.`)) return;
    setRevokingID(batch.id);
    try { await api.revokeBatch(initData, batch.id); setBatches((items) => items.map((item) => item.id === batch.id ? { ...item, revoked_at: new Date().toISOString() } : item)); setNotice({ kind: 'success', title: 'Партия отозвана', message: batch.label }); }
    catch (error) { setNotice({ kind: 'error', title: 'Не удалось отозвать партию', message: errorMessage(error) }); }
    finally { setRevokingID(null); }
  };

  if (!canOpen) return <div className="launch-gate"><div className="gate-card"><div className="brand-mark">И</div><p className="eyebrow">TELEGRAM MINI APP</p><h1>Иномекопы</h1><p>Открой приложение через Telegram, чтобы войти в профиль и управлять коллекцией.</p><span className="gate-note">Локальный просмотр интерфейса доступен через VITE_DEMO_MODE=true.</span></div></div>;

  if (loading) return <div className="loading-screen"><div className="loading-mark">И</div><span>Загрузка приложения…</span></div>;
  if (loadError) return <div className="launch-gate"><div className="gate-card"><div className="brand-mark">И</div><h1>Не удалось подключиться</h1><p>{loadError}</p><button className="button button--primary" onClick={() => void loadData()}>Повторить</button></div></div>;

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <button className="brand" onClick={() => showPage('home')} aria-label="Иномекопы — главная"><span className="brand-mark">И</span><span className="brand-copy"><strong>ИНОМЕКОПЫ</strong><small>ИГРОВОЙ МИР</small></span></button>
        <nav className="main-nav" aria-label="Основная навигация">
          <button className={page === 'home' ? 'nav-item is-active' : 'nav-item'} onClick={() => showPage('home')}>Главная</button>
          <button className={page === 'collection' ? 'nav-item is-active' : 'nav-item'} onClick={() => showPage('collection')}>Коллекция <span className="nav-count">{ownedCreatures.length}</span></button>
          <button className={page === 'arena' ? 'nav-item is-active' : 'nav-item'} onClick={() => { showPage('arena'); void loadArenaData(); }}>Арена</button>
          {isAdmin && <button className={page === 'admin' ? 'nav-item is-active' : 'nav-item'} onClick={() => showPage('admin')}>Управление</button>}
        </nav>
        <div className="topbar-user"><span className="user-dot" /><span>{displayName}</span>{demoMode && <em>DEMO</em>}</div>
      </header>

      <main className="page-wrap no-print">
        {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

        {page === 'home' && <>
          <section className="welcome-row"><div><p className="eyebrow">ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ</p><h1>Привет, {displayName.split(' ')[0]}.</h1><p className="page-lead">Активируй карточки, пополняй коллекцию и открывай новых иномеконов.</p></div><div className="balance-card"><span>ТВОЙ БАЛАНС</span><strong>{formatNumber(player?.gold ?? 0)}</strong><small>золота</small><div className="passive-income"><span>Пассивный доход</span><strong>+{formatNumber(player?.passive_gold_per_hour ?? 0)} / час</strong><small>{player?.owned_creature_count ?? ownedCreatures.length} иномеконов приносят золото</small></div></div></section>
          <section className="home-grid">
            <article className="surface activation-panel"><div className="section-heading"><div><span className="section-index">01</span><h2>Активировать карточку</h2></div><Help text="Если ты открыл игру через QR-код на карточке, код активируется автоматически. Здесь можно активировать код вручную." /></div>
              <form className="activation-form" onSubmit={handleRedeem}><label className="field"><FieldLabel help="Код находится на физической карточке. Он одноразовый: после успешной активации повторно использовать его нельзя.">Код карточки</FieldLabel><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="INOME-…" autoComplete="off" /></label><button className="button button--primary" disabled={redeeming}>{redeeming ? 'Проверяем…' : 'Активировать'} <span>→</span></button></form>
              {redeemResult && <div className="result-row"><span className="result-check">✓</span><div><strong>Награда получена</strong><span>+{formatNumber(redeemResult.gold_added)} золота{redeemResult.creature_slug ? ` · ${creatureName(redeemResult.creature_slug)}` : ''}</span></div></div>}
            </article>
            <article className="surface latest-panel"><div className="section-heading"><div><span className="section-index">02</span><h2>Коллекция</h2></div><button className="text-button" onClick={() => showPage('collection')}>Все существа →</button></div>
              {ownedCreatures.length ? <div className="owned-list">{ownedCreatures.slice(0, 3).map((item) => { const detail = currentSpecies.get(item.species_slug); return <div className="owned-row" key={item.id}><ImagePreview src={detail?.image_url ?? ''} name={detail?.name ?? creatureName(item.species_slug)} /><div><strong>{detail?.name ?? creatureName(item.species_slug)}</strong><span>{detail ? RARITIES.find((rarity) => rarity.value === detail.rarity)?.label : 'Иномекон'} · найден {formatDate(item.obtained_at)}</span></div><span className="owned-arrow">↗</span></div>; })}</div> : <div className="empty-inline"><strong>Пока нет существ</strong><span>Активируй первую карточку, чтобы начать коллекцию.</span></div>}
            </article>
          </section>
        </>}

        {page === 'collection' && <section className="subpage"><div className="subpage-heading"><div><p className="eyebrow">МОИ НАХОДКИ</p><h1>Коллекция</h1><p className="page-lead">Все полученные иномеконы — в одном месте.</p></div><span className="count-pill">{ownedCreatures.length} существ</span></div>
          {ownedCreatures.length ? <div className="species-grid">{ownedCreatures.map((owned) => { const item = currentSpecies.get(owned.species_slug); return <article className="species-card" key={owned.id}><ImagePreview src={item?.image_url ?? ''} name={item?.name ?? creatureName(owned.species_slug)} /><div className="species-card-body"><div className="title-line"><h3>{item?.name ?? creatureName(owned.species_slug)}</h3><span className={`rarity-tag rarity-tag--${item?.rarity ?? 'common'}`}>{RARITIES.find((r) => r.value === item?.rarity)?.label ?? 'Неизвестно'}</span></div><p>{item?.description || 'Описание ещё не добавлено.'}</p>{item && <div className="stat-chips"><span>♥ {item.health} HP</span><span>Урон {item.damage}</span><span>Крит {item.crit_chance}%</span><span>+{formatNumber(item.passive_gold_per_hour)} золота/ч</span><span>{item.ability_name}</span></div>}<small>Получен {formatDate(owned.obtained_at)}</small></div></article>; })}</div> : <div className="surface empty-state"><span className="empty-symbol">＋</span><h2>Коллекция пока пуста</h2><p>Найди карточку и активируй её код — первый иномекон появится здесь.</p><button className="button button--primary" onClick={() => showPage('home')}>Активировать карточку</button></div>}
        </section>}

        {page === 'arena' && <section className="subpage arena-page">
          <div className="subpage-heading"><div><p className="eyebrow">СРАЖЕНИЯ И СОПЕРНИКИ</p><h1>Арена</h1><p className="page-lead">Вызывай других игроков на дуэль. Урон, критические удары и эффекты рассчитываются на сервере.</p></div><button className="button button--secondary" onClick={() => void loadArenaData()}>Обновить</button></div>
          <div className="arena-layout">
            <form className="surface editor-form challenge-form" onSubmit={handleCreateBattle}>
              <div className="section-heading"><div><span className="section-index">01</span><h2>Вызвать на дуэль</h2></div><Help text="Вызов становится активным только после принятия соперником. Во время активной дуэли оба участника ходят по очереди. У каждого игрока может быть только одна активная дуэль." /></div>
              <label className="field"><FieldLabel help="Выбери одного из иномеконов своей коллекции. Его характеристики будут зафиксированы на время дуэли.">Твой иномекон</FieldLabel><select required value={chosenCreatureID} onChange={(e) => setChosenCreatureID(e.target.value)}><option value="">Выбери иномекона</option>{ownedCreatures.map((item) => { const detail = currentSpecies.get(item.species_slug); return <option key={item.id} value={item.id}>{detail?.name ?? creatureName(item.species_slug)} · {detail?.health ?? '?'} HP</option>; })}</select></label>
              <label className="field"><FieldLabel help="Показываются игроки, которые уже получили хотя бы одного иномекона.">Соперник</FieldLabel><select required value={chosenOpponentID} onChange={(e) => { setChosenOpponentID(e.target.value); setChosenOpponentCreatureID(''); }}><option value="">Выбери игрока</option>{gamePlayers.map((item) => <option value={item.telegram_id} key={item.telegram_id}>{item.first_name}{item.username ? ` (@${item.username})` : ''}</option>)}</select></label>
              <label className="field"><FieldLabel>Иномекон соперника</FieldLabel><select required value={chosenOpponentCreatureID} onChange={(e) => setChosenOpponentCreatureID(e.target.value)} disabled={!chosenOpponentID}><option value="">Выбери иномекона</option>{(gamePlayers.find((item) => item.telegram_id === Number(chosenOpponentID))?.creatures ?? []).map((item) => <option key={item.creature_id} value={item.creature_id}>{item.name} · {item.health} HP · {item.rarity}</option>)}</select></label>
              {ownedCreatures.length === 0 && <p className="field-help">Сначала активируй карточку и получи своего первого иномекона.</p>}
              {gamePlayers.length === 0 && <p className="field-help">Пока нет других игроков с иномеконами. Поделись карточками с друзьями.</p>}
              <button className="button button--primary button--full" disabled={gameActionID !== null || ownedCreatures.length === 0 || gamePlayers.length === 0}>{gameActionID === -1 ? 'Отправляем…' : 'Отправить вызов'}</button>
            </form>
            <div className="arena-battles"><div className="section-heading"><div><span className="section-index">02</span><h2>Твои дуэли</h2></div><span className="count-pill">{battles.length}</span></div>
              {battles.length === 0 && <div className="surface empty-state arena-empty"><span className="empty-symbol">⚔</span><h2>Здесь пока тихо</h2><p>Отправь первый вызов или дождись приглашения от другого игрока.</p></div>}
              {battles.map((battle) => {
                const meID = player?.telegram_id ?? -1; const isChallenger = battle.challenger_telegram_id === meID; const incoming = battle.status === 'waiting' && battle.opponent_telegram_id === meID; const outgoing = battle.status === 'waiting' && isChallenger;
                const myFighter = isChallenger ? battle.state.challenger : battle.state.opponent; const enemyFighter = isChallenger ? battle.state.opponent : battle.state.challenger;
                const myCreature = isChallenger ? battle.challenger_creature : battle.opponent_creature; const enemyCreature = isChallenger ? battle.opponent_creature : battle.challenger_creature;
                const myTurn = battle.status === 'active' && battle.state.current_turn_telegram_id === meID;
                const abilityCooling = !!myFighter.ability_ready_at && new Date(myFighter.ability_ready_at).getTime() > Date.now();
                const statusText = battle.status === 'waiting' ? (incoming ? 'Входящий вызов' : 'Ожидает ответа') : battle.status === 'active' ? (myTurn ? 'Твой ход' : 'Ход соперника') : battle.status === 'finished' ? (battle.winner_telegram_id === meID ? 'Победа' : 'Поражение') : battle.status === 'declined' ? 'Отклонена' : 'Отменена';
                return <article className="surface battle-card" key={battle.id}>
                  <div className="battle-card-top"><div><p className="eyebrow">ДУЭЛЬ #{battle.id} · РАУНД {battle.state.round || '—'}</p><h3>{battle.challenger_name} <span>vs</span> {battle.opponent_name}</h3></div><span className={`battle-status battle-status--${battle.status}`}>{statusText}</span></div>
                  <div className="battle-fighters"><div className="battle-fighter"><ImagePreview src={myCreature.image_url} name={myCreature.name}/><div><strong>{myCreature.name}</strong><small>{isChallenger ? battle.challenger_name : battle.opponent_name}</small>{battle.status === 'active' || battle.status === 'finished' ? <><div className="hp-track"><span style={{ width: `${Math.max(0, Math.min(100, (myFighter.hp / Math.max(1, myFighter.max_hp)) * 100))}%` }} /></div><small>{myFighter.hp} / {myFighter.max_hp} HP</small></> : <small>{myCreature.health} HP</small>}</div></div><div className="battle-vs">VS</div><div className="battle-fighter"><ImagePreview src={enemyCreature.image_url} name={enemyCreature.name}/><div><strong>{enemyCreature.name}</strong><small>{isChallenger ? battle.opponent_name : battle.challenger_name}</small>{battle.status === 'active' || battle.status === 'finished' ? <><div className="hp-track"><span style={{ width: `${Math.max(0, Math.min(100, (enemyFighter.hp / Math.max(1, enemyFighter.max_hp)) * 100))}%` }} /></div><small>{enemyFighter.hp} / {enemyFighter.max_hp} HP</small></> : <small>{enemyCreature.health} HP</small>}</div></div></div>
                  {incoming && <div className="battle-actions"><button className="button button--primary" disabled={gameActionID === battle.id} onClick={() => void handleBattleRequest(battle, 'accept')}>Принять вызов</button><button className="button button--secondary" disabled={gameActionID === battle.id} onClick={() => void handleBattleRequest(battle, 'decline')}>Отклонить</button></div>}
                  {outgoing && <div className="battle-actions"><span className="field-help">Ожидаем ответа соперника.</span><button className="button button--secondary" disabled={gameActionID === battle.id} onClick={() => void handleBattleRequest(battle, 'cancel')}>Отменить вызов</button></div>}
                  {battle.status === 'active' && <><div className="battle-skill"><span><strong>{myCreature.ability.name}</strong><small>Урон способности +{myCreature.ability.power} · точность {myCreature.ability.accuracy_percent}% · эффект: {myCreature.ability.effect_type === 'none' ? 'нет' : myCreature.ability.effect_type}</small></span><span>{abilityCooling ? `Перезарядка до ${new Date(myFighter.ability_ready_at!).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Готова'}</span></div><div className="battle-actions"><button className="button button--secondary" disabled={!myTurn || gameActionID === battle.id} onClick={() => void handleBattleTurn(battle, 'basic')}>Обычная атака</button><button className="button button--primary" disabled={!myTurn || abilityCooling || gameActionID === battle.id} onClick={() => void handleBattleTurn(battle, 'ability')}>{gameActionID === battle.id ? 'Выполняется…' : 'Использовать способность'}</button></div>{!myTurn && <p className="field-help">Ожидай ход соперника. Состояние дуэли обновляется автоматически.</p>}</>}
                  {battle.status === 'finished' && <p className="battle-finish">{battle.winner_telegram_id === meID ? 'Ты выиграл эту дуэль.' : 'В этой дуэли победил соперник.'}</p>}
                  {battle.state.log?.length > 0 && <details className="battle-log"><summary>Ход боя · {battle.state.log.length} событий</summary><ol>{battle.state.log.slice(-10).reverse().map((entry, index) => <li key={`${entry.at}-${index}`}><time>{new Date(entry.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</time>{entry.message}</li>)}</ol></details>}
                </article>;
              })}
            </div>
          </div>
        </section>}

        {page === 'admin' && isAdmin && <section className="subpage admin-page"><div className="subpage-heading"><div><p className="eyebrow">АДМИНИСТРИРОВАНИЕ</p><h1>Управление</h1><p className="page-lead">Настраивай каталог существ, способности и карточки.</p></div><span className="admin-status"><span /> Доступ администратора</span></div>
          <div className="admin-tabs" role="tablist"><button role="tab" aria-selected={adminSection === 'creatures'} className={adminSection === 'creatures' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => { setAdminSection('creatures'); setNotice(null); }}>Иномеконы <span>{species.filter((item) => item.is_active).length}</span></button><button role="tab" aria-selected={adminSection === 'abilities'} className={adminSection === 'abilities' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => { setAdminSection('abilities'); setNotice(null); }}>Способности <span>{abilities.length}</span></button><button role="tab" aria-selected={adminSection === 'codes'} className={adminSection === 'codes' ? 'admin-tab is-active' : 'admin-tab'} onClick={() => { setAdminSection('codes'); setNotice(null); }}>Коды <span>{batchTotals.codes}</span></button></div>

          {adminSection === 'creatures' && <section className="admin-section"><div className="section-toolbar"><div><h2>Каталог иномеконов</h2><p>Характеристики влияют на будущие игровые механики. Изображения загружаются отдельными файлами.</p></div><button className="button button--primary" onClick={() => setSpeciesEditor({ values: { ...EMPTY_SPECIES(), ability_id: abilities[0]?.id ?? 1 } })}>＋ Новый иномекон</button></div>
            {speciesEditor && <form className="surface editor-form" onSubmit={handleSaveSpecies}><div className="editor-heading"><div><p className="eyebrow">{speciesEditor.id ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАПИСЬ'}</p><h3>{speciesEditor.id ? `Изменить: ${species.find((item) => item.id === speciesEditor.id)?.name ?? ''}` : 'Новый иномекон'}</h3></div><button type="button" className="icon-button" onClick={() => setSpeciesEditor(null)} aria-label="Закрыть форму">×</button></div>
              <div className="editor-grid"><label className="field"><FieldLabel help="Системный идентификатор на латинице, например frost-fox. После создания не меняется, поскольку на него могут ссылаться коллекции и карточки.">Slug</FieldLabel><input required minLength={2} maxLength={48} pattern="[a-z0-9]+(-[a-z0-9]+)*" disabled={Boolean(speciesEditor.id)} value={speciesEditor.values.slug} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') } })} placeholder="frost-fox" /></label>
                <label className="field"><FieldLabel>Название</FieldLabel><input required maxLength={80} value={speciesEditor.values.name} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, name: e.target.value } })} placeholder="Ледяной лис" /></label>
                <label className="field field--wide"><FieldLabel>Описание</FieldLabel><textarea maxLength={1000} rows={2} value={speciesEditor.values.description} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, description: e.target.value } })} placeholder="Краткое описание существа" /></label>
                <div className="field field--wide"><FieldLabel help="Загрузи подготовленный художником или сгенерированный ИИ файл. Поддерживаются PNG, JPEG и GIF до 5 МБ; интерфейс не рисует персонажа автоматически.">Изображение</FieldLabel><div className="image-upload-row"><ImagePreview src={speciesEditor.values.image_url} name={speciesEditor.values.name || 'Иномекон'} /><div className="upload-actions"><label className="button button--secondary upload-button">{uploadingImage ? 'Загрузка…' : 'Загрузить изображение'}<input type="file" accept="image/png,image/jpeg,image/gif" onChange={handleSpeciesImage} disabled={uploadingImage} hidden /></label><label className="field"><FieldLabel>Или HTTPS-ссылка</FieldLabel><input value={speciesEditor.values.image_url.startsWith('data:') ? '' : speciesEditor.values.image_url} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, image_url: e.target.value } })} placeholder="https://… или /uploads/…" /></label></div></div></div>
                <label className="field"><FieldLabel help="Редкость определяет категорию существа. Она пока не меняет боевые характеристики автоматически.">Редкость</FieldLabel><select value={speciesEditor.values.rarity} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, rarity: e.target.value as Rarity } })}>{RARITIES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
                <label className="field"><FieldLabel help="Количество игрового золота, начисляемого за один час владения. Само начисление по расписанию в этот этап ещё не входит.">Пассивный доход / час</FieldLabel><input type="number" min={0} max={10000000} step={1} required value={speciesEditor.values.passive_gold_per_hour} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, passive_gold_per_hour: Number(e.target.value) } })} /></label>
                <label className="field"><FieldLabel help="Базовый запас здоровья. Боевой движок и формула боя будут следующим отдельным этапом.">Здоровье (HP)</FieldLabel><input type="number" min={1} max={1000000} step={1} required value={speciesEditor.values.health} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, health: Number(e.target.value) } })} /></label>
                <label className="field"><FieldLabel help="Базовый урон обычной атаки без учёта выбранной способности и критического удара.">Базовый урон</FieldLabel><input type="number" min={0} max={1000000} step={1} required value={speciesEditor.values.damage} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, damage: Number(e.target.value) } })} /></label>
                <label className="field"><FieldLabel help="Вероятность критического удара в процентах от 0 до 100. Здесь хранится параметр; сам расчёт критов ещё не включён.">Шанс крит. удара (%)</FieldLabel><input type="number" min={0} max={100} step={0.1} required value={speciesEditor.values.crit_chance} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, crit_chance: Number(e.target.value) } })} /></label>
                <label className="field field--wide"><FieldLabel help="У иномекона сейчас одна основная способность. В следующем этапе можно добавить набор активных и пассивных навыков.">Основная способность</FieldLabel><select required value={speciesEditor.values.ability_id} onChange={(e) => setSpeciesEditor({ ...speciesEditor, values: { ...speciesEditor.values, ability_id: Number(e.target.value) } })}>{abilities.map((item) => <option key={item.id} value={item.id}>{item.name} · сила {item.power}</option>)}</select></label>
              </div><div className="form-footer"><div><button className="button button--secondary" type="button" onClick={() => setSpeciesEditor(null)}>Отмена</button><button className="button button--primary" type="submit" disabled={savingSpecies || uploadingImage}>{savingSpecies ? 'Сохраняем…' : 'Сохранить иномекона'}</button></div></div>
            </form>}
            <div className="catalog-list">{species.length ? species.map((item) => <article className={`catalog-row${!item.is_active ? ' catalog-row--archived' : ''}`} key={item.id}><ImagePreview src={item.image_url} name={item.name} /><div className="catalog-row-main"><div className="title-line"><h3>{item.name}</h3><span className={`rarity-tag rarity-tag--${item.rarity}`}>{RARITIES.find((r) => r.value === item.rarity)?.label}</span>{!item.is_active && <span className="state-tag">В архиве</span>}</div><p className="slug-line">{item.slug}</p><div className="stat-chips"><span>{formatNumber(item.passive_gold_per_hour)} золота/ч</span><span>{formatNumber(item.health)} HP</span><span>Урон {formatNumber(item.damage)}</span><span>Крит {item.crit_chance}%</span></div><small>Способность: {item.ability_name}</small></div><div className="row-actions"><button className="button button--secondary button--small" disabled={!item.is_active} onClick={() => setSpeciesEditor({ id: item.id, values: { slug: item.slug, name: item.name, description: item.description, image_url: item.image_url, rarity: item.rarity, passive_gold_per_hour: item.passive_gold_per_hour, health: item.health, damage: item.damage, crit_chance: item.crit_chance, ability_id: item.ability_id } })}>Изменить</button>{item.is_active && <button className="button button--ghost button--small" disabled={archivingSpeciesID === item.id} onClick={() => void handleArchiveSpecies(item)}>{archivingSpeciesID === item.id ? '…' : 'В архив'}</button>}</div></article>) : <div className="surface empty-state"><h3>Каталог пока пуст</h3><p>Создай первого иномекона и назначь ему способность.</p></div>}</div>
          </section>}

          {adminSection === 'abilities' && <section className="admin-section"><div className="section-toolbar"><div><h2>Способности</h2><p>Четыре базовые способности уже добавлены. Создавай новые с собственными боевыми параметрами.</p></div><button className="button button--primary" onClick={() => setAbilityEditor({ values: EMPTY_ABILITY() })}>＋ Новая способность</button></div>
            {abilityEditor && <form className="surface editor-form" onSubmit={handleSaveAbility}><div className="editor-heading"><div><p className="eyebrow">{abilityEditor.id ? 'РЕДАКТИРОВАНИЕ' : 'НОВАЯ ЗАПИСЬ'}</p><h3>{abilityEditor.id ? `Изменить: ${abilities.find((item) => item.id === abilityEditor.id)?.name ?? ''}` : 'Новая способность'}</h3></div><button type="button" className="icon-button" onClick={() => setAbilityEditor(null)} aria-label="Закрыть форму">×</button></div>
              <div className="editor-grid"><label className="field"><FieldLabel help="Уникальное системное имя на латинице с дефисами. После создания изменить его нельзя.">Slug</FieldLabel><input required minLength={2} maxLength={48} pattern="[a-z0-9]+(-[a-z0-9]+)*" disabled={Boolean(abilityEditor.id)} value={abilityEditor.values.slug} onChange={(e) => setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') } })} placeholder="ice-burst" /></label>
                <label className="field"><FieldLabel>Название</FieldLabel><input required maxLength={80} value={abilityEditor.values.name} onChange={(e) => setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, name: e.target.value } })} placeholder="Ледяной всплеск" /></label>
                <label className="field field--wide"><FieldLabel>Описание</FieldLabel><textarea rows={2} maxLength={500} value={abilityEditor.values.description} onChange={(e) => setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, description: e.target.value } })} placeholder="Как работает способность" /></label>
                <label className="field"><FieldLabel help="Стихия влияет на маркировку способности в каталоге. Боевые преимущества стихий пока не рассчитываются.">Тип / стихия</FieldLabel><select value={abilityEditor.values.element} onChange={(e) => setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, element: e.target.value as AbilityElement } })}>{ELEMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="field"><FieldLabel help="Дополнительная сила способности, которая будет применяться сверх базового урона согласно будущим правилам боя.">Сила способности</FieldLabel><input type="number" min={0} max={100000} step={1} required value={abilityEditor.values.power} onChange={(e) => setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, power: Number(e.target.value) } })} /></label>
                <label className="field"><FieldLabel help="Вероятность успешного попадания в процентах. Используется будущим боевым движком.">Точность (%)</FieldLabel><input type="number" min={0} max={100} step={0.1} required value={abilityEditor.values.accuracy_percent} onChange={(e) => setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, accuracy_percent: Number(e.target.value) } })} /></label>
                <label className="field"><FieldLabel help="Минимальное время до повторного использования способности, в секундах.">Перезарядка (сек.)</FieldLabel><input type="number" min={0} max={3600} step={1} required value={abilityEditor.values.cooldown_seconds} onChange={(e) => setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, cooldown_seconds: Number(e.target.value) } })} /></label>
                <label className="field"><FieldLabel help="Дополнительный эффект: горение, замедление, оглушение, ослабление или щит. Эффект будет применяться в бою на стороне сервера.">Дополнительный эффект</FieldLabel><select value={abilityEditor.values.effect_type} onChange={(e) => { const effect = e.target.value as EffectType; setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, effect_type: effect, effect_value: effect === 'none' ? 0 : Math.max(1, abilityEditor.values.effect_value), effect_duration_turns: effect === 'none' ? 0 : Math.max(1, abilityEditor.values.effect_duration_turns) } }); }}>{EFFECTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                <label className="field"><FieldLabel help="Сила дополнительного эффекта в условных процентах или единицах. Точная значение трактуется в зависимости от выбранного эффекта.">Сила эффекта</FieldLabel><input type="number" min={abilityEditor.values.effect_type === 'none' ? 0 : 1} max={100} step={1} disabled={abilityEditor.values.effect_type === 'none'} required value={abilityEditor.values.effect_value} onChange={(e) => setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, effect_value: Number(e.target.value) } })} /></label>
                <label className="field"><FieldLabel help="Количество ходов, в течение которых действует эффект. Для способности без эффекта значение должно быть равно нулю.">Длительность эффекта (ходы)</FieldLabel><input type="number" min={abilityEditor.values.effect_type === 'none' ? 0 : 1} max={600} step={1} disabled={abilityEditor.values.effect_type === 'none'} required value={abilityEditor.values.effect_duration_turns} onChange={(e) => setAbilityEditor({ ...abilityEditor, values: { ...abilityEditor.values, effect_duration_turns: Number(e.target.value) } })} /></label>
              </div><div className="form-footer"><div><button className="button button--secondary" type="button" onClick={() => setAbilityEditor(null)}>Отмена</button><button className="button button--primary" type="submit" disabled={savingAbility}>{savingAbility ? 'Сохраняем…' : 'Сохранить способность'}</button></div></div>
            </form>}
            <div className="ability-list">{abilities.map((item) => <article className="ability-row" key={item.id}><div className={`element-mark element-mark--${item.element}`}><span>{item.element === 'meteor' ? 'М' : item.element === 'wind' ? 'В' : item.element === 'earth' ? 'З' : item.element === 'water' ? 'ВД' : item.element === 'arcane' ? 'А' : '•'}</span></div><div className="ability-main"><div className="title-line"><h3>{item.name}</h3>{item.is_default && <span className="state-tag">Базовая</span>}</div><p>{item.description || 'Описание не добавлено.'}</p><div className="stat-chips"><span>Сила {item.power}</span><span>Точность {item.accuracy_percent}%</span><span>Перезарядка {item.cooldown_seconds} сек.</span><span>{EFFECTS.find((effect) => effect.value === item.effect_type)?.label ?? 'Нет эффекта'}{item.effect_type !== 'none' ? ` · ${item.effect_value} / ${item.effect_duration_turns} ход.` : ''}</span></div><small className="slug-line">{item.slug}</small></div><div className="row-actions"><button className="button button--secondary button--small" onClick={() => setAbilityEditor({ id: item.id, values: { slug: item.slug, name: item.name, description: item.description, element: item.element, power: item.power, accuracy_percent: item.accuracy_percent, cooldown_seconds: item.cooldown_seconds, effect_type: item.effect_type, effect_value: item.effect_value, effect_duration_turns: item.effect_duration_turns } })}>Изменить</button>{!item.is_default && <button className="button button--ghost button--small" disabled={deletingAbilityID === item.id} onClick={() => void handleDeleteAbility(item)}>{deletingAbilityID === item.id ? '…' : 'Удалить'}</button>}</div></article>)}</div>
          </section>}

          {adminSection === 'codes' && <section className="admin-section"><div className="section-toolbar"><div><h2>Одноразовые карточки</h2><p>Выпускай партии кодов, скачивай CSV или печатай QR-карточки.</p></div><div className="stat-inline"><span><strong>{formatNumber(batchTotals.codes)}</strong> кодов</span><span><strong>{formatNumber(batchTotals.used)}</strong> использовано</span><span><strong>{formatNumber(batchTotals.available)}</strong> доступно</span></div></div>
            <div className="codes-layout"><form className="surface editor-form" onSubmit={handleCreateBatch}><div className="editor-heading"><div><p className="eyebrow">НОВАЯ ПАРТИЯ</p><h3>Создать карточки</h3></div></div><label className="field"><FieldLabel>Название партии</FieldLabel><input required maxLength={100} value={batchLabel} onChange={(e) => setBatchLabel(e.target.value)} /></label><label className="field"><FieldLabel help="Количество уникальных одноразовых кодов в партии. Максимум 500 за один запрос.">Количество кодов</FieldLabel><input type="number" min={1} max={500} required value={batchCount} onChange={(e) => setBatchCount(e.target.value)} /></label><div className="field"><FieldLabel>Награда</FieldLabel><div className="reward-options">{(Object.keys(REWARDS) as CreateBatchInput['reward_preset'][]).map((key) => <label className={rewardPreset === key ? 'reward-option is-selected' : 'reward-option'} key={key}><input type="radio" name="reward" value={key} checked={rewardPreset === key} onChange={() => setRewardPreset(key)} /><span><strong>{REWARDS[key].label}</strong><small>{REWARDS[key].gold} золота{REWARDS[key].creature ? ' + Иноспрут' : ''}</small></span></label>)}</div></div><label className="field"><FieldLabel help="0 — код не имеет срока действия. Максимум 365 дней.">Срок действия (дней)</FieldLabel><input type="number" min={0} max={365} step={1} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} /></label><button className="button button--primary button--full" disabled={creatingBatch}>{creatingBatch ? 'Создаём…' : 'Создать партию'}</button></form>
              <div className="codes-side"><div className="surface code-result"><p className="eyebrow">ПОСЛЕДНЯЯ ПАРТИЯ</p>{createdBatch ? <><h3>{createdBatch.label}</h3><p>{createdBatch.count} одноразовых кодов · {createdBatch.reward_gold} золота{createdBatch.reward_creature_slug ? ' + Иноспрут' : ''}</p><div className="button-stack"><button className="button button--primary" onClick={() => downloadCSV(createdBatch, botUsername)}>Скачать CSV</button><button className="button button--secondary" disabled={generatingQR} onClick={() => void handlePrepareQR()}>{generatingQR ? 'Готовим QR…' : 'Подготовить QR-карточки'}</button></div></> : <div className="empty-inline"><strong>Партии пока не создавались</strong><span>После создания здесь появятся действия для экспорта.</span></div>}</div>
                <div className="surface batch-history"><div className="section-heading"><h3>История партий</h3><button className="text-button" onClick={() => void loadAdminData()}>Обновить</button></div>{batches.length ? batches.map((batch) => <div className="batch-row" key={batch.id}><div className="batch-row-main"><strong>{batch.label}</strong><span>#{batch.id} · {formatDate(batch.created_at)} · {batch.reward_gold} золота{batch.reward_creature_slug ? ' + Иноспрут' : ''}</span><div className="batch-progress"><span style={{ width: `${batch.code_count ? Math.min(100, Math.round((batch.redeemed_count / batch.code_count) * 100)) : 0}%` }} /></div><small>{batch.redeemed_count} из {batch.code_count} активировано · {formatDate(batch.expires_at)}</small></div><div className="batch-actions"><span className={`state-tag${batch.revoked_at ? ' state-tag--muted' : ''}`}>{batch.revoked_at ? 'Отозвана' : 'Активна'}</span>{!batch.revoked_at && <button className="text-button text-button--danger" disabled={revokingID === batch.id} onClick={() => void handleRevokeBatch(batch)}>{revokingID === batch.id ? '…' : 'Отозвать'}</button>}</div></div>) : <p className="muted-copy">Список пуст.</p>}</div>
              </div>
            </div>
          </section>}
        </section>}
        {page === 'admin' && !isAdmin && <section className="surface access-denied"><h1>Нет доступа</h1><p>Эта учётная запись не имеет прав администратора.</p><button className="button button--primary" onClick={() => showPage('home')}>На главную</button></section>}
      </main>

      <footer className="app-footer no-print"><span>ИНОМЕКОПЫ</span><span>{demoMode ? 'Демонстрационный режим · данные тестовые' : 'Игровой профиль'}</span></footer>
      <div className="print-sheet" aria-hidden="true">{qrCards.map((card, index) => <article className="print-qr-card" key={`${card.code}-${index}`}><div className="print-brand">ИНОМЕКОПЫ <span>КАРТОЧКА #{index + 1}</span></div><img src={card.dataUrl} alt="QR-код карточки" /><h3>{createdBatch?.reward_creature_slug ? 'Карточка с иномеконом' : createdBatch?.reward_gold === 500 ? 'Редкая карточка' : 'Обычная карточка'}</h3><strong>{createdBatch?.reward_gold} золота{createdBatch?.reward_creature_slug ? ' + иномекон' : ''}</strong><p>Отсканируй QR в Telegram, чтобы получить награду.</p><small>{card.code}</small></article>)}</div>
    </div>
  );
}

export default App;
