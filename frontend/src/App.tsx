import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { APIError, api, isDemoMode } from './api';
import AdminPanel from './AdminPanel';
import type { CollectionSpecies, Creature, EggKind, HatchEggResult, Player, RedeemResult, Rarity, ShopData, SlotSpinRequest, SlotSpinResult, SubscriptionClaimResult, SubscriptionStatus } from './api';

// ==================== Типы и константы ====================

type Page = 'home' | 'collection' | 'shop' | 'admin';
type Notice = { kind: 'success' | 'error' | 'info'; title: string; message: string };

const RARITIES: { value: Rarity; label: string }[] = [
  { value: 'common', label: 'Обычная' },
  { value: 'rare', label: 'Редкая' },
  { value: 'epic', label: 'Эпическая' },
  { value: 'legendary', label: 'Легендарная' },
  { value: 'mythic', label: 'Мифическая' },
];

// ==================== Вспомогательные функции ====================

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatDate(value?: string): string {
  if (!value) return 'Без срока';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
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

// ==================== Компоненты интерфейса ====================

function Help({ text }: { text: string }) {
  return (
    <details className="help">
      <summary aria-label="Пояснение">?</summary>
      <span className="help-popover">{text}</span>
    </details>
  );
}

function FieldLabel({ children, help }: { children: string; help?: string }) {
  return (
    <span className="field-label">
      {children}
      {help && <Help text={help} />}
    </span>
  );
}

function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  return (
    <div className={`notice notice--${notice.kind}`} role="status">
      <div>
        <strong>{notice.title}</strong>
        <span>{notice.message}</span>
      </div>
      <button className="icon-button" onClick={onClose} aria-label="Закрыть сообщение">
        ×
      </button>
    </div>
  );
}

function ImagePreview({ src, name }: { src: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed)
    return <img className="species-image" src={src} alt={`Изображение: ${name}`} onError={() => setFailed(true)} />;
  return (
    <div className="species-image species-image--empty" aria-label="Изображение не добавлено">
      <span>Нет изображения</span>
    </div>
  );
}

// ==================== Главный компонент App ====================

export function App() {
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData ?? '';
  const launchCode = getStartParam(telegram);
  const autoRedeemAttempted = useRef('');
  const subscriptionAutoOpened = useRef(false);
  const tutorialAutoOpened = useRef(false);
  const tutorialSuppressedSubscriptionThisSession = useRef(false);

  const [page, setPage] = useState<Page>('home');
  const [isAdmin, setIsAdmin] = useState(false);
  const [player, setPlayer] = useState<Player | null>(null);
  const [ownedCreatures, setOwnedCreatures] = useState<Creature[]>([]);
  const [species, setSpecies] = useState<CollectionSpecies[]>([]);
  const [shopData, setShopData] = useState<ShopData | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [subscriptionModalOpen, setSubscriptionModalOpen] = useState(false);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [shopTutorialStep, setShopTutorialStep] = useState<'buy' | 'hatch' | null>(null);
  const [shopBusy, setShopBusy] = useState(false);
  const [lastHatch, setLastHatch] = useState<HatchEggResult | null>(null);
  const [confirmSellID, setConfirmSellID] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);

  const [slotBet, setSlotBet] = useState(50);
  const [slotBetInput, setSlotBetInput] = useState('50');
  const [slotBetType, setSlotBetType] = useState<'gold' | 'creature'>('gold');
  const [slotCreatureID, setSlotCreatureID] = useState<number | ''>('');
  const [slotReels, setSlotReels] = useState<[string, string, string]>(['🍒', '💎', '🧬']);
  const [slotRolling, setSlotRolling] = useState(false);
  const [slotResult, setSlotResult] = useState<SlotSpinResult | null>(null);
  const [selectedSpeciesID, setSelectedSpeciesID] = useState<number | null>(null);



  const demoMode = isDemoMode;
  const inTelegram = Boolean(telegram && initData);
  const canOpen = demoMode || inTelegram;
  const displayName = player?.first_name || telegram?.initDataUnsafe.user?.first_name || 'Игрок';
  const currentSpecies = useMemo(
    () => new Map(species.flatMap((item) => item.slug ? [[item.slug, item] as [string, CollectionSpecies]] : [])),
    [species]
  );
  const ownedSpeciesCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const creature of ownedCreatures) counts.set(creature.species_slug, (counts.get(creature.species_slug) ?? 0) + 1);
    return counts;
  }, [ownedCreatures]);
  const selectedSpecies = useMemo(
    () => (selectedSpeciesID === null ? undefined : species.find((item) => item.id === selectedSpeciesID)),
    [species, selectedSpeciesID]
  );
  const discoveredSpeciesCount = useMemo(() => species.filter((item) => !item.locked).length, [species]);

  useEffect(() => {
    if (!selectedSpecies) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedSpeciesID(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [selectedSpecies]);

  const selectedSlotCreature = useMemo(
    () => (slotCreatureID === '' ? undefined : ownedCreatures.find((item) => item.id === slotCreatureID)),
    [ownedCreatures, slotCreatureID]
  );

  const loadData = useCallback(async () => {
    if (!canOpen) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [playerResponse, creatureResponse] = await Promise.all([api.me(initData), api.creatures(initData)]);
      setPlayer(playerResponse);
      setOwnedCreatures(creatureResponse.items ?? []);
      if (!tutorialAutoOpened.current) {
        const tutorialKey = `inomecops:onboarding-seen:${playerResponse.telegram_id}`;
        let tutorialSeen = false;
        try { tutorialSeen = window.localStorage.getItem(tutorialKey) === '1'; } catch { /* this session's ref remains authoritative */ }
        if (!tutorialSeen) {
          setTutorialOpen(true);
          setTutorialStep(0);
          tutorialAutoOpened.current = true;
          tutorialSuppressedSubscriptionThisSession.current = true;
          try { window.localStorage.setItem(tutorialKey, '1'); } catch { /* ignore storage restrictions */ }
        }
      }
      if ((playerResponse.passive_gold_claimed ?? 0) > 0) {
        setNotice({
          kind: 'success',
          title: 'Пассивный доход начислен',
          message: `+${formatNumber(playerResponse.passive_gold_claimed ?? 0)} золота за время отсутствия.`,
        });
      }
      try {
        const catalog = await api.collectionCatalog(initData);
        setSpecies(catalog.items ?? []);
      } catch {
        /* The player's profile remains available if public catalog is temporarily unavailable. */
      }
      try {
        setShopData(await api.shop(initData));
      } catch {
        setShopData(null);
      }
      try {
        const subscription = await api.subscriptionStatus(initData);
        setSubscriptionStatus(subscription);
        if (subscription.enabled && !subscription.claimed && !subscriptionAutoOpened.current && !tutorialSuppressedSubscriptionThisSession.current) {
          // Show the automatic prompt only once per Telegram account. The “Бонус” tab
          // remains available after dismissal so the player can return later.
          const promptKey = `inomecops:subscription-prompt-seen:${playerResponse.telegram_id}`;
          let promptSeen = false;
          try {
            promptSeen = window.localStorage.getItem(promptKey) === '1';
          } catch {
            // localStorage can be disabled in some embedded browsers; the ref below
            // still prevents repeated prompts while this app instance is mounted.
          }
          if (!promptSeen) {
            setSubscriptionModalOpen(true);
            try { window.localStorage.setItem(promptKey, '1'); } catch { /* ignore storage restrictions */ }
          }
          subscriptionAutoOpened.current = true;
        }
      } catch {
        setSubscriptionStatus(null);
      }
      try {
        // The backend is the authority: non-admin users receive 403 and won't see this tab.
        await api.listAdminSpecies(initData);
        setIsAdmin(true);
      } catch {
        setIsAdmin(false);
        setPage((currentPage) => currentPage === 'admin' ? 'home' : currentPage);
      }
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [canOpen, initData]);

  useEffect(() => {
    telegram?.setHeaderColor?.('#0e1210');
    telegram?.setBackgroundColor?.('#0e1210');
    telegram?.ready();
    telegram?.expand();
    void loadData();
  }, [telegram, loadData]);

  useEffect(() => {
    if (!canOpen) return;
    const timer = window.setInterval(() => {
      void api.me(initData).then(setPlayer).catch(() => undefined);
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [canOpen, initData]);

  useEffect(() => {
    if (slotCreatureID !== '' && !ownedCreatures.some((item) => item.id === slotCreatureID)) {
      setSlotCreatureID(ownedCreatures[0]?.id ?? '');
    }
  }, [ownedCreatures, slotCreatureID]);

  const redeemCode = useCallback(
    async (rawCode: string) => {
      const normalized = rawCode.trim().toUpperCase();
      if (!normalized) {
        setNotice({ kind: 'error', title: 'Код не найден', message: 'В ссылке нет кода активации.' });
        return;
      }
      setRedeeming(true);
      setRedeemResult(null);
      setNotice({ kind: 'info', title: 'Проверяем карточку', message: 'Подключаемся к серверу и проверяем награду.' });
      try {
        const result = await api.redeem(initData, normalized);
        setRedeemResult(result);
        setCode('');
        setPlayer((previous) => (previous ? { ...previous, gold: result.gold_balance } : previous));
        const [creatureResponse, catalogueResponse] = await Promise.all([
          api.creatures(initData),
          api.collectionCatalog(initData),
        ]);
        setOwnedCreatures(creatureResponse.items ?? []);
        setSpecies(catalogueResponse.items ?? []);
        const awarded = [
          result.gold_added > 0 ? `${formatNumber(result.gold_added)} золота` : '',
          result.creature_slug ? `новый иномекон: ${creatureName(result.creature_slug)}` : '',
        ].filter(Boolean).join(' и ');
        setNotice({
          kind: 'success',
          title: 'Карточка активирована',
          message: `${result.reward_name ? `Награда «${result.reward_name}»${result.reward_rarity ? ` · ${result.reward_rarity}` : ''}. ` : ''}Получено: ${awarded || 'награда активирована'}.`,
        });
        telegram?.HapticFeedback?.notificationOccurred('success');
      } catch (error) {
        setNotice({ kind: 'error', title: 'Не удалось активировать', message: errorMessage(error) });
        telegram?.HapticFeedback?.notificationOccurred('error');
      } finally {
        setRedeeming(false);
      }
    },
    [initData, telegram]
  );

  useEffect(() => {
    if (!launchCode || !canOpen || loading || autoRedeemAttempted.current === launchCode) return;
    autoRedeemAttempted.current = launchCode;
    void redeemCode(launchCode);
  }, [launchCode, canOpen, loading, redeemCode]);

  const handleRedeem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void redeemCode(code);
  };

  const showPage = (next: Page) => {
    setPage(next);
    setNotice(null);
    telegram?.HapticFeedback?.selectionChanged();
  };

  const closeSubscriptionModal = () => setSubscriptionModalOpen(false);

  const openTutorial = () => {
    setTutorialStep(0);
    setTutorialOpen(true);
    if (player) {
      try { window.localStorage.setItem(`inomecops:onboarding-seen:${player.telegram_id}`, '1'); } catch { /* ignore storage restrictions */ }
    }
  };

  const closeTutorial = () => setTutorialOpen(false);

  const goToShopFromTutorial = () => {
    setShopTutorialStep('buy');
    setPage('shop');
    setNotice(null);
    setTutorialOpen(false);
  };

  const claimSubscriptionReward = async () => {
    if (subscriptionBusy || !subscriptionStatus?.enabled) return;
    setSubscriptionBusy(true);
    setSubscriptionError('');
    try {
      const result: SubscriptionClaimResult = await api.claimSubscription(initData);
      const [freshStatus, freshPlayer, freshCreatures, freshCatalogue] = await Promise.all([
        api.subscriptionStatus(initData), api.me(initData), api.creatures(initData), api.collectionCatalog(initData),
      ]);
      setSubscriptionStatus(freshStatus);
      setPlayer(freshPlayer);
      setOwnedCreatures(freshCreatures.items ?? []);
      setSpecies(freshCatalogue.items ?? []);
      if (result.already_claimed) {
        setSubscriptionError('Эта награда уже была получена. Повторно она не начисляется.');
      } else {
        const rewards = [
          result.gold_added > 0 ? `${formatNumber(result.gold_added)} золота` : '',
          result.creature_name ? `иномекон «${result.creature_name}»` : '',
        ].filter(Boolean).join(' и ');
        setSubscriptionError(`Награда получена${rewards ? `: ${rewards}` : ''}!`);
        telegram?.HapticFeedback?.notificationOccurred('success');
      }
    } catch (error) {
      setSubscriptionError(errorMessage(error));
      telegram?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setSubscriptionBusy(false);
    }
  };

  const playSlot = async () => {
    if (slotRolling) return;
    if (slotBetType === 'gold' && (!Number.isInteger(slotBet) || slotBet < 10 || slotBet > 10000)) {
      setNotice({ kind: 'error', title: 'Некорректная ставка', message: 'Введи целое число от 10 до 10 000 золота.' });
      return;
    }
    if (slotBetType === 'gold' && (!player || player.gold < slotBet)) {
      setNotice({ kind: 'error', title: 'Не хватает золота', message: 'Уменьши ставку или активируй карточку, чтобы получить золото.' });
      return;
    }
    if (slotBetType === 'creature' && !selectedSlotCreature) {
      setNotice({ kind: 'error', title: 'Выбери иномекона', message: 'Для этой ставки нужен иномекон из твоей коллекции.' });
      return;
    }

    const request: SlotSpinRequest = slotBetType === 'gold'
      ? { bet_type: 'gold', bet: slotBet }
      : { bet_type: 'creature', creature_id: selectedSlotCreature!.id };

    setSlotRolling(true);
    setSlotResult(null);
    const symbols = ['🍒', '🍋', '💎', '⭐', '🧬'];
    const animationTimer = window.setInterval(() => {
      setSlotReels([
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
        symbols[Math.floor(Math.random() * symbols.length)],
      ]);
    }, 75);

    try {
      const result = await api.spinSlot(initData, request);
      await new Promise((resolve) => window.setTimeout(resolve, 1050));
      window.clearInterval(animationTimer);
      setSlotReels(result.symbols);
      setSlotResult(result);
      const creatureDelta = (result.creature_slug ? 1 : 0) + (result.creature_rewards?.length ?? 0) - (result.creature_stake_lost ? 1 : 0);
      setPlayer((previous) =>
        previous
          ? {
              ...previous,
              gold: result.gold_balance,
              owned_creature_count: Math.max(0, (previous.owned_creature_count ?? ownedCreatures.length) + creatureDelta),
            }
          : previous
      );
      // Refresh inventory after every spin: an item stake may be lost or award new creatures.
      void Promise.all([api.me(initData), api.creatures(initData), api.collectionCatalog(initData)])
        .then(([freshPlayer, freshCreatures, freshCatalogue]) => {
          setPlayer(freshPlayer);
          setOwnedCreatures(freshCreatures.items ?? []);
          setSpecies(freshCatalogue.items ?? []);
        })
        .catch(() => undefined);
      telegram?.HapticFeedback?.notificationOccurred(result.win_type === 'miss' ? 'warning' : 'success');
    } catch (error) {
      window.clearInterval(animationTimer);
      const message = error instanceof APIError && error.code === 'slot_failed'
        ? 'Сервер не смог сохранить результат. Проверь, что миграции backend/migrations/005_slot_machine.sql и 006_slot_creature_stakes.sql применены к базе PostgreSQL backend. Если они применены, проверь журнал backend — там будет исходная ошибка. Незавершённая операция откатывается, поэтому баланс и коллекция не меняются.'
        : errorMessage(error);
      setNotice({ kind: 'error', title: 'Не удалось завершить прокрутку', message });
      telegram?.HapticFeedback?.notificationOccurred('error');
    } finally {
      window.clearInterval(animationTimer);
      setSlotRolling(false);
    }
  };

  const refreshAfterShopAction = async () => {
    const [freshPlayer, freshCreatures, freshCatalog, freshShop] = await Promise.all([
      api.me(initData), api.creatures(initData), api.collectionCatalog(initData), api.shop(initData),
    ]);
    setPlayer(freshPlayer);
    setOwnedCreatures(freshCreatures.items ?? []);
    setSpecies(freshCatalog.items ?? []);
    setShopData(freshShop);
  };

  const buyEgg = async (rarity: EggKind) => {
    if (shopBusy) return;
    setShopBusy(true);
    setNotice(null);
    try {
      const result = await api.buyEgg(initData, rarity);
      await refreshAfterShopAction();
      setNotice({ kind: 'success', title: 'Яйцо куплено', message: `«${shopData?.egg_offers.find((item) => item.rarity === rarity)?.label ?? (RARITIES.find((item) => item.value === rarity)?.label ?? 'Загадочное')}» добавлено в рюкзак. Теперь пролистай до «Яйца в рюкзаке» и нажми «Вылупить». Списано ${formatNumber(result.egg.price_gold)} золота.` });
      if (shopTutorialStep === 'buy') setShopTutorialStep('hatch');
      telegram?.HapticFeedback?.notificationOccurred('success');
    } catch (error) {
      setNotice({ kind: 'error', title: 'Не удалось купить яйцо', message: errorMessage(error) });
      telegram?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setShopBusy(false);
    }
  };

  const hatchEgg = async (eggID: number) => {
    if (shopBusy) return;
    setShopBusy(true);
    setNotice(null);
    try {
      const result = await api.hatchEgg(initData, eggID);
      setLastHatch(result);
      setConfirmSellID(null);
      await refreshAfterShopAction();
      setNotice({ kind: 'success', title: 'Яйцо вылупилось!', message: `Ты получил иномекона «${result.name}». Он добавлен в коллекцию и теперь участвует в пассивном доходе. Его текущую сумму можно увидеть на главной странице.` });
      if (shopTutorialStep === 'hatch') setShopTutorialStep(null);
      telegram?.HapticFeedback?.notificationOccurred('success');
    } catch (error) {
      setNotice({ kind: 'error', title: 'Не удалось вылупить яйцо', message: errorMessage(error) });
      telegram?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setShopBusy(false);
    }
  };

  const sellCreature = async (creatureID: number) => {
    if (shopBusy) return;
    setShopBusy(true);
    setNotice(null);
    try {
      const result = await api.sellCreature(initData, creatureID);
      setConfirmSellID(null);
      await refreshAfterShopAction();
      setNotice({ kind: 'success', title: 'Иномекон продан', message: `За «${result.name}» начислено ${formatNumber(result.gold_added)} золота.` });
      telegram?.HapticFeedback?.notificationOccurred('success');
    } catch (error) {
      setNotice({ kind: 'error', title: 'Не удалось продать иномекона', message: errorMessage(error) });
      telegram?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setShopBusy(false);
    }
  };

  if (!canOpen)
    return (
      <div className="launch-gate">
        <div className="gate-card">
          <div className="brand-mark"><img src="/brand-logo.png" alt="" /></div>
          <p className="eyebrow">TELEGRAM MINI APP</p>
          <h1>Иномекопы</h1>
          <p>Открой приложение через Telegram, чтобы войти в профиль и управлять коллекцией.</p>
          <span className="gate-note">Локальный просмотр интерфейса доступен через VITE_DEMO_MODE=true.</span>
        </div>
      </div>
    );

  if (loading)
    return (
      <div className="loading-screen">
        <div className="loading-mark"><img src="/brand-logo.png" alt="" /></div>
        <span>Загрузка приложения…</span>
      </div>
    );

  if (loadError)
    return (
      <div className="launch-gate">
        <div className="gate-card">
          <div className="brand-mark"><img src="/brand-logo.png" alt="" /></div>
          <h1>Не удалось подключиться</h1>
          <p>{loadError}</p>
          <button className="button button--primary" onClick={() => void loadData()}>
            Повторить
          </button>
        </div>
      </div>
    );

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <button className="brand" onClick={() => showPage('home')} aria-label="Иномекопы — главная">
          <span className="brand-mark"><img src="/brand-logo.png" alt="" /></span>
          <span className="brand-copy">
            <strong>ИНОМЕКОПЫ</strong>
            <small>ИГРОВОЙ МИР</small>
          </span>
        </button>
        <nav className="main-nav" aria-label="Основная навигация">
          <button className={page === 'home' ? 'nav-item is-active' : 'nav-item'} onClick={() => showPage('home')}>
            Главная
          </button>
          <button
            className={page === 'collection' ? 'nav-item is-active' : 'nav-item'}
            onClick={() => showPage('collection')}
          >
            Коллекция <span className="nav-count">{ownedCreatures.length}</span>
          </button>
          <button className={page === 'shop' ? 'nav-item is-active' : 'nav-item'} onClick={() => showPage('shop')}>
            Магазин <span className="nav-count">{shopData?.eggs.length ?? 0}</span>
          </button>
          <button className="nav-item tutorial-nav-item" onClick={openTutorial}>Как играть</button>
          {subscriptionStatus?.enabled && <button className="nav-item subscription-nav-item" onClick={() => { setSubscriptionError(''); setSubscriptionModalOpen(true); }}>Бонус</button>}
          {isAdmin && <button className={page === 'admin' ? 'nav-item is-active' : 'nav-item'} onClick={() => showPage('admin')}>Администрирование</button>}
        </nav>
        <div className="topbar-user">
          <span className="user-dot" />
          <span>{displayName}</span>
          {demoMode && <em>DEMO</em>}
        </div>
      </header>

      <main className="page-wrap no-print">
        {notice && <NoticeBar notice={notice} onClose={() => setNotice(null)} />}

        {page === 'home' && (
          <>
            <section className="welcome-row">
              <div>
                <p className="eyebrow">ИГРОВОЙ БАРАБАН · СОБИРАЙ ИНОМЕКОНОВ</p>
                <h1>Привет, {displayName.split(' ')[0]}.</h1>
                <p className="page-lead">Крути барабан, забирай золото и выбивай новых иномеконов.</p>
              </div>
              <div className="balance-card">
                <span>ТВОЙ БАЛАНС</span>
                <strong>{formatNumber(player?.gold ?? 0)}</strong>
                <small>золота</small>
                <div className="passive-income">
                  <span>Пассивный доход</span>
                  <strong>+{formatNumber(player?.passive_gold_per_hour ?? 0)} / час</strong>
                  <small>{player?.owned_creature_count ?? ownedCreatures.length} иномеконов приносят золото</small>
                </div>
              </div>
            </section>
            <section className="slot-layout" aria-label="Барабан удачи">
              <article className="surface slot-machine">
                <div className="slot-machine-heading">
                  <div>
                    <p className="eyebrow">INOME · ИГРОВОЙ БАРАБАН</p>
                    <h2>Барабан удачи</h2>
                    <p>Выбирай ставку золотом или иномеконом. Три 🧬 — джекпот с дополнительной наградой.</p>
                  </div>
                  <div className="slot-mini-balance">
                    <span>ТВОЁ ЗОЛОТО</span>
                    <strong>{formatNumber(player?.gold ?? 0)}</strong>
                  </div>
                </div>

                <div className={`slot-reels${slotRolling ? ' is-rolling' : ''}`} aria-label="Результат барабана" aria-live="polite">
                  {slotReels.map((symbol, index) => (
                    <div className="slot-reel" key={index}>
                      <span>{symbol}</span>
                    </div>
                  ))}
                </div>

                <div className={`slot-result${slotResult ? ` slot-result--${slotResult.win_type}` : ''}`} aria-live="polite">
                  {slotRolling ? (
                    <><span className="slot-result-icon">✦</span><span>Барабаны крутятся…</span></>
                  ) : slotResult ? (
                    <>
                      <span className="slot-result-icon">{slotResult.bet_type === 'creature' ? (slotResult.creature_stake_lost ? '↻' : slotResult.creature_rewards?.length ? '✦' : '✓') : slotResult.net > 0 ? '✦' : '↻'}</span>
                      <div className="slot-result-copy">
                        <strong className={slotResult.bet_type === 'gold' ? (slotResult.payout > 0 ? 'slot-payout-positive' : 'slot-payout-negative') : ''}>
                          {slotResult.bet_type === 'gold'
                            ? slotResult.payout > 0 ? `+${formatNumber(slotResult.payout)} золота` : `−${formatNumber(slotResult.bet)} золота`
                            : slotResult.message}
                        </strong>
                        {slotResult.bet_type === 'creature' ? (
                          <span>
                            {slotResult.message} Ставка: {slotResult.bet_creature_name ?? 'иномекон'} ·{' '}
                            <b className={slotResult.creature_stake_lost ? 'slot-net-negative' : 'slot-net-positive'}>
                              {slotResult.creature_stake_lost ? 'потерян' : 'сохранён'}
                            </b>
                            {!!slotResult.creature_rewards?.length && ` · Получено: ${slotResult.creature_rewards.map((item) => item.name).join(', ')}`}
                          </span>
                        ) : (
                          <span>
                            {slotResult.message}{' '}
                            {slotResult.payout > 0
                              ? `На баланс начислено +${formatNumber(slotResult.payout)} золота. Ставка ${formatNumber(slotResult.bet)} золота была списана до вращения, чистый итог раунда: ${slotResult.net > 0 ? '+' : ''}${formatNumber(slotResult.net)} золота.`
                              : `Ставка ${formatNumber(slotResult.bet)} золота списана до вращения — выплата не начислена.`}
                          </span>
                        )}
                        {slotResult.creature_slug && <small>Новый иномекон добавлен в твою коллекцию.</small>}
                      </div>
                    </>
                  ) : (
                    <><span className="slot-result-icon">✦</span><span>Пусть удача будет на твоей стороне.</span></>
                  )}
                </div>

                <div className="slot-controls">
                  <div className="slot-bet-picker">
                    <div className="slot-stake-mode" role="group" aria-label="Тип ставки">
                      <button
                        type="button"
                        className={slotBetType === 'gold' ? 'is-selected' : ''}
                        disabled={slotRolling}
                        onClick={() => { setSlotBetType('gold'); setSlotResult(null); }}
                      >
                        Золотом
                      </button>
                      <button
                        type="button"
                        className={slotBetType === 'creature' ? 'is-selected' : ''}
                        disabled={slotRolling}
                        onClick={() => {
                          setSlotBetType('creature');
                          setSlotCreatureID((current) => current === '' ? (ownedCreatures[0]?.id ?? '') : current);
                          setSlotResult(null);
                        }}
                      >
                        Иномеконом
                      </button>
                    </div>

                    {slotBetType === 'gold' ? (
                      <>
                        <div className="slot-bet-label"><span>ТВОЯ СТАВКА</span><small>от 10 до 10 000 золота</small></div>
                        <div className="slot-bet-stepper">
                          <button type="button" aria-label="Уменьшить ставку на 10" disabled={slotRolling || slotBet <= 10} onClick={() => { const next = Math.max(10, slotBet - 10); setSlotBet(next); setSlotBetInput(String(next)); }}>−</button>
                          <input
                            className="slot-bet-input"
                            type="number"
                            inputMode="numeric"
                            min={10}
                            max={10000}
                            step={1}
                            aria-label="Ставка в золоте"
                            value={slotBetInput}
                            disabled={slotRolling}
                            onChange={(event) => {
                              const raw = event.target.value;
                              setSlotBetInput(raw);
                              if (raw !== '' && /^\d+$/.test(raw)) setSlotBet(Number(raw));
                            }}
                            onBlur={() => {
                              const parsed = Number(slotBetInput);
                              const next = Number.isFinite(parsed) ? Math.max(10, Math.min(10000, Math.trunc(parsed || 10))) : 10;
                              setSlotBet(next);
                              setSlotBetInput(String(next));
                            }}
                            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                          />
                          <button type="button" aria-label="Увеличить ставку на 10" disabled={slotRolling || slotBet >= 10000} onClick={() => { const next = Math.min(10000, slotBet + 10); setSlotBet(next); setSlotBetInput(String(next)); }}>+</button>
                        </div>
                        <div className="slot-bet-presets">
                          {[10, 50, 100, 500, 1000, 2500, 5000, 10000].map((value) => (
                            <button type="button" key={value} className={slotBet === value ? 'is-selected' : ''} disabled={slotRolling} onClick={() => { setSlotBet(value); setSlotBetInput(String(value)); }}>
                              {formatNumber(value)}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="slot-creature-picker">
                        <div className="slot-bet-label"><span>ТВОЯ СТАВКА</span><small>выбери из коллекции</small></div>
                        <select
                          className="slot-creature-select"
                          value={slotCreatureID === '' ? '' : String(slotCreatureID)}
                          disabled={slotRolling || ownedCreatures.length === 0}
                          onChange={(event) => setSlotCreatureID(event.target.value ? Number(event.target.value) : '')}
                        >
                          <option value="">{ownedCreatures.length ? 'Выбрать иномекона…' : 'Коллекция пока пуста'}</option>
                          {ownedCreatures.map((owned) => {
                            const item = currentSpecies.get(owned.species_slug);
                            return (
                              <option key={owned.id} value={String(owned.id)}>
                                {item?.name ?? creatureName(owned.species_slug)} · экземпляр №{owned.id}
                              </option>
                            );
                          })}
                        </select>
                        <small className="slot-stake-note">Промах — иномекон теряется. Пара сохраняет ставку, тройка приносит ещё иномекона.</small>
                      </div>
                    )}
                  </div>
                  <button
                    className="button button--primary slot-spin-button"
                    type="button"
                    onClick={() => void playSlot()}
                    disabled={slotRolling || (slotBetType === 'gold' ? (slotBet < 10 || slotBet > 10000 || !Number.isInteger(slotBet) || (player?.gold ?? 0) < slotBet) : !selectedSlotCreature)}
                  >
                    {slotRolling
                      ? 'КРУТИМ…'
                      : slotBetType === 'gold'
                        ? (player?.gold ?? 0) < slotBet ? 'НЕ ХВАТАЕТ ЗОЛОТА' : 'КРУТИТЬ БАРАБАН'
                        : selectedSlotCreature ? 'ПОСТАВИТЬ ИНОМЕКОН' : 'ВЫБЕРИ ИНОМЕКОН'}
                    <span>{slotRolling ? '✦' : '↗'}</span>
                  </button>
                </div>

                <div className="slot-paytable">
                  <div><span>🍒 🍒 🍒</span><strong>{slotBetType === 'gold' ? '×4' : '+1 иномекон'}</strong></div>
                  <div><span>🍋 🍋 🍋</span><strong>{slotBetType === 'gold' ? '×5' : '+1 иномекон'}</strong></div>
                  <div><span>💎 💎 💎</span><strong>{slotBetType === 'gold' ? '×7' : '+1 иномекон'}</strong></div>
                  <div><span>⭐ ⭐ ⭐</span><strong>{slotBetType === 'gold' ? '×10' : '+1 иномекон'}</strong></div>
                  <div className="slot-jackpot"><span>🧬 🧬 🧬</span><strong>{slotBetType === 'gold' ? '×15 + иномекон' : '+2 иномекона'}</strong></div>
                  <p>{slotBetType === 'gold'
                    ? 'Любые два одинаковых символа возвращают ×1,2 от ставки. Выплаты и случайный результат рассчитывает сервер.'
                    : 'При ставке иномеконом промах означает потерю ставки; пара сохраняет иномекона, тройка даёт одного нового, а три 🧬 — двух. Результат рассчитывает сервер.'}</p>
                </div>
              </article>
            </section>

            <section className="home-grid">
              <article className="surface activation-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-index">01</span>
                    <h2>Активировать карточку</h2>
                  </div>
                  <Help text="Если ты открыл игру через QR-код на карточке, код активируется автоматически. Здесь можно активировать код вручную." />
                </div>
                <form className="activation-form" onSubmit={handleRedeem}>
                  <label className="field">
                    <FieldLabel help="Код находится на физической карточке. Он одноразовый: после успешной активации повторно использовать его нельзя.">
                      Код карточки
                    </FieldLabel>
                    <input
                      value={code}
                      onChange={(event) => setCode(event.target.value.toUpperCase())}
                      placeholder="INOME-…"
                      autoComplete="off"
                    />
                  </label>
                  <button className="button button--primary" disabled={redeeming}>
                    {redeeming ? 'Проверяем…' : 'Активировать'} <span>→</span>
                  </button>
                </form>
                {redeemResult && (
                  <div className="result-row">
                    <span className="result-check">✓</span>
                    <div>
                      <strong>Награда получена</strong>
                      <span>
                        {redeemResult.reward_name ? `${redeemResult.reward_name}${redeemResult.reward_rarity ? ` · ${redeemResult.reward_rarity}` : ''} — ` : ''}
                        {redeemResult.gold_added > 0 ? `+${formatNumber(redeemResult.gold_added)} золота` : ''}
                        {redeemResult.gold_added > 0 && redeemResult.creature_slug ? ' · ' : ''}
                        {redeemResult.creature_slug ? creatureName(redeemResult.creature_slug) : ''}
                      </span>
                    </div>
                  </div>
                )}
              </article>
              <article className="surface latest-panel">
                <div className="section-heading">
                  <div>
                    <span className="section-index">02</span>
                    <h2>Коллекция</h2>
                  </div>
                  <button className="text-button" onClick={() => showPage('collection')}>
                    Все существа →
                  </button>
                </div>
                {ownedCreatures.length ? (
                  <div className="owned-list">
                    {ownedCreatures.slice(0, 3).map((item) => {
                      const detail = currentSpecies.get(item.species_slug);
                      return (
                        <div className="owned-row" key={item.id}>
                          <ImagePreview
                            src={detail?.image_url ?? ''}
                            name={detail?.name ?? creatureName(item.species_slug)}
                          />
                          <div>
                            <strong>{detail?.name ?? creatureName(item.species_slug)}</strong>
                            <span>
                              {detail
                                ? RARITIES.find((rarity) => rarity.value === detail.rarity)?.label
                                : 'Иномекон'}{' '}
                              · найден {formatDate(item.obtained_at)}
                            </span>
                          </div>
                          <span className="owned-arrow">↗</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="empty-inline">
                    <strong>Пока нет существ</strong>
                    <span>Активируй первую карточку, чтобы начать коллекцию.</span>
                  </div>
                )}
              </article>
            </section>
          </>
        )}

        {page === 'shop' && (
          <section className="subpage shop-page">
            <div className="subpage-heading">
              <div>
                <p className="eyebrow">INOME · МАГАЗИН</p>
                <h1>Магазин</h1>
                <p className="page-lead">Покупай яйца за золото, вылупляй новых иномеконов или продавай лишних из своей коллекции.</p>
              </div>
              <div className="shop-balance"><span>ТВОЙ БАЛАНС</span><strong>{formatNumber(player?.gold ?? 0)}</strong><small>золота</small></div>
            </div>

            {shopTutorialStep && <div className="tutorial-shop-guide" role="status">
              <span className="tutorial-guide-kicker">ОБУЧЕНИЕ · ШАГ {shopTutorialStep === 'buy' ? '1' : '2'} ИЗ 2</span>
              <strong>{shopTutorialStep === 'buy' ? 'Сначала купи яйцо' : 'Теперь вылупи яйцо'}</strong>
              <p>{shopTutorialStep === 'buy'
                ? 'Выбери яйцо по цене и редкости. Покупка положит его в рюкзак, но иномекон не появится автоматически — для этого нужен следующий шаг.'
                : 'Пролистай вниз до раздела «Яйца в рюкзаке» и нажми «Вылупить». Иномекон добавится в коллекцию, а его пассивный доход будет прибавляться со временем.'}</p>
              <button type="button" className="text-button" onClick={() => setShopTutorialStep(null)}>Скрыть подсказку</button>
            </div>}
            {!shopData ? (
              <div className="surface shop-empty"><h2>Магазин пока недоступен</h2><p>Не удалось загрузить данные магазина. Обнови страницу; если ошибка повторяется, проверь, что миграции 008 и 010 применены и backend перезапущен.</p><button className="button button--secondary" onClick={() => void api.shop(initData).then(setShopData).catch((error) => setNotice({ kind: 'error', title: 'Ошибка магазина', message: errorMessage(error) }))}>Повторить</button></div>
            ) : (
              <>
                <div className="shop-section-heading"><div><p className="eyebrow">СЛУЧАЙНЫЙ ИНОМЕКОН</p><h2>Яйца</h2><p>Из яйца вылупляется случайный активный вид выбранной редкости. Сначала в каталоге должен быть хотя бы один такой иномекон.</p></div></div>
                <div className="egg-grid">
                  {shopData.egg_offers.map((offer) => {
                    const rarityLabel = offer.rarity === 'mystery' ? 'СЕКРЕТНОЕ ЯЙЦО' : RARITIES.find((item) => item.value === offer.rarity)?.label ?? offer.label;
                    const emoji = ({ common: '🥚', rare: '🪺', epic: '💠', legendary: '🌟', mythic: '🌌', mystery: '🪐' } as Record<EggKind, string>)[offer.rarity];
                    const canAfford = (player?.gold ?? 0) >= offer.price_gold;
                    return <article className={`surface egg-card egg-card--${offer.rarity}`} key={offer.rarity}>
                      <div className="egg-card-art">{offer.image_url ? <img src={offer.image_url} alt={offer.label} /> : <span>{emoji}</span>}</div>
                      <div className="egg-card-copy"><span className={`rarity-tag rarity-tag--${offer.rarity}`}>{rarityLabel}</span><h3>{offer.label}</h3><p>{offer.description || (offer.available ? `В каталоге ${offer.available_species} ${offer.available_species === 1 ? 'вид' : offer.available_species < 5 ? 'вида' : 'видов'} этой редкости.` : 'Пока нет активных иномеконов этой редкости.')}</p>{offer.rarity === 'mystery' && <div className="egg-rarity-chances"><strong>Шансы получить редкость</strong><div>{RARITIES.map((rarity) => <span key={rarity.value}><em>{rarity.label}</em><b>{offer.rarity_chances?.[rarity.value] ?? 0}%</b></span>)}</div><small>Выбор иномекона внутри редкости случайный. Если какой-то редкости нет в каталоге, шансы распределяются между доступными видами; если подходящих редкостей совсем нет по заданным весам — поровну.</small></div>}</div>
                      <div className="egg-card-buy"><strong>{formatNumber(offer.price_gold)} <small>золота</small></strong><button className="button button--primary" disabled={shopBusy || !offer.available || !canAfford} onClick={() => void buyEgg(offer.rarity)}>{shopBusy ? 'Подожди…' : !offer.available ? 'Нет в каталоге' : !canAfford ? 'Не хватает золота' : 'Купить яйцо'}</button></div>
                    </article>;
                  })}
                </div>

                <div className="shop-section-heading shop-section-heading--inventory"><div><p className="eyebrow">ТВОЙ ИНВЕНТАРЬ</p><h2>Яйца в рюкзаке <span className="nav-count">{shopData.eggs.length}</span></h2><p>Вылупление бесплатно. Внутри будет случайный иномекон соответствующей редкости.</p></div></div>
                {shopData.eggs.length ? <div className="owned-eggs-grid">
                  {shopData.eggs.map((egg) => <article className="surface owned-egg-card" key={egg.id}>
                    <div className={`owned-egg-icon owned-egg-icon--${egg.rarity}`} aria-hidden="true">{shopData.egg_offers.find((offer) => offer.rarity === egg.rarity)?.image_url ? <img src={shopData.egg_offers.find((offer) => offer.rarity === egg.rarity)?.image_url} alt="" /> : '🥚'}</div>
                    <div className="owned-egg-copy"><span className={`rarity-tag rarity-tag--${egg.rarity}`}>{egg.rarity === 'mystery' ? 'Загадочное яйцо' : RARITIES.find((item) => item.value === egg.rarity)?.label ?? egg.rarity}</span><strong>{shopData.egg_offers.find((offer) => offer.rarity === egg.rarity)?.label ?? `${RARITIES.find((item) => item.value === egg.rarity)?.label ?? egg.rarity} яйцо`}</strong><small>Куплено {formatDate(egg.purchased_at)}</small></div>
                    <button className="button button--primary" disabled={shopBusy} onClick={() => void hatchEgg(egg.id)}>{shopBusy ? 'Открываем…' : 'Вылупить'}</button>
                  </article>)}
                </div> : <div className="surface shop-empty shop-empty--compact"><strong>Пока нет яиц</strong><span>Купи яйцо выше — оно появится здесь, и ты сможешь вылупить его в любой момент.</span></div>}

                {lastHatch && <div className="surface hatch-result"><ImagePreview src={lastHatch.image_url} name={lastHatch.name} /><div><span className="eyebrow">НОВЫЙ ИНОМЕКОН</span><h3>{lastHatch.name}</h3><p>{RARITIES.find((item) => item.value === lastHatch.rarity)?.label ?? lastHatch.rarity} · цена продажи {formatNumber(lastHatch.sell_price_gold)} золота</p><button className="text-button" onClick={() => showPage('collection')}>Открыть коллекцию →</button></div><span className="hatch-confetti" aria-hidden="true">✦</span></div>}

                <div className="shop-section-heading shop-section-heading--inventory"><div><p className="eyebrow">ОБМЕН НА ЗОЛОТО</p><h2>Продать иномекона</h2><p>Цена задана в админке для каждого вида. Продажа удаляет один выбранный экземпляр, но сам вид останется открытым в коллекции.</p></div></div>
                {ownedCreatures.length ? <div className="shop-creature-list">
                  {ownedCreatures.map((owned) => {
                    const detail = currentSpecies.get(owned.species_slug);
                    const name = detail?.name ?? creatureName(owned.species_slug);
                    const price = detail?.sell_price_gold ?? 0;
                    const confirming = confirmSellID === owned.id;
                    return <article className="surface shop-creature-row" key={owned.id}>
                      <ImagePreview src={detail?.image_url ?? ''} name={name} />
                      <div className="shop-creature-copy"><strong>{name}</strong><span>{detail ? RARITIES.find((item) => item.value === detail.rarity)?.label : 'Иномекон'} · получен {formatDate(owned.obtained_at)}</span><small>{price > 0 ? `Цена продажи: ${formatNumber(price)} золота` : 'Продажа не настроена для этого вида'}</small></div>
                      {confirming ? <div className="shop-creature-actions"><button className="button button--secondary button--small" disabled={shopBusy} onClick={() => setConfirmSellID(null)}>Отмена</button><button className="button button--danger button--small" disabled={shopBusy || price <= 0} onClick={() => void sellCreature(owned.id)}>{shopBusy ? 'Продаём…' : 'Подтвердить'}</button></div> : <button className="button button--secondary button--small" disabled={shopBusy || price <= 0} onClick={() => setConfirmSellID(owned.id)}>{price > 0 ? `Продать · ${formatNumber(price)}` : 'Нет цены'}</button>}
                    </article>;
                  })}
                </div> : <div className="surface shop-empty shop-empty--compact"><strong>Некого продавать</strong><span>Получай иномеконов из яиц, карточек или барабана удачи.</span></div>}
              </>
            )}
          </section>
        )}

        {page === 'collection' && (
          <section className="subpage">
            <div className="subpage-heading">
              <div>
                <p className="eyebrow">ИССЛЕДУЙ КАТАЛОГ</p>
                <h1>Коллекция</h1>
                <p className="page-lead">Открывай новых иномеконов. Неизвестные виды скрывают имя, изображение и характеристики.</p>
              </div>
              <span className="count-pill">{discoveredSpeciesCount} / {species.length} открыто</span>
            </div>
            {species.length ? (
              <div className="species-grid species-grid--catalog">
                {species.map((entry) => {
                  const locked = entry.locked || !entry.slug;
                  const ownedCount = entry.slug ? (ownedSpeciesCounts.get(entry.slug) ?? 0) : 0;
                  const rarityLabel = entry.rarity
                    ? (RARITIES.find((rarity) => rarity.value === entry.rarity)?.label ?? 'Неизвестная')
                    : 'Неизвестно';
                  return (
                    <button
                      className={`species-card species-card--catalog${locked ? ' is-locked' : ''}`}
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedSpeciesID(entry.id)}
                      aria-label={locked ? 'Открыть закрытую карточку иномекона' : `Характеристики: ${entry.name}`}
                    >
                      <div className={`species-card-art${locked ? ' species-card-art--locked' : ''}`}>
                        {locked ? (
                          <>
                            <span className="species-lock-icon" aria-hidden="true">🔒</span>
                            <small>ДАННЫЕ ЗАКРЫТЫ</small>
                          </>
                        ) : (
                          <ImagePreview src={entry.image_url ?? ''} name={entry.name ?? 'Иномекон'} />
                        )}
                      </div>
                      <div className="species-info">
                        <h3>{locked ? '???' : entry.name}</h3>
                        <span>{locked ? 'Неизвестный вид' : rarityLabel}</span>
                        <small>{locked ? 'Найди, чтобы открыть' : ownedCount > 1 ? `В коллекции: ${ownedCount}` : 'Открыто · нажми для деталей'}</small>
                      </div>
                      <span className="species-card-open" aria-hidden="true">↗</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <h2>Каталог пока пуст</h2>
                <p>Когда в игре появятся новые виды иномеконов, они отобразятся здесь.</p>
              </div>
            )}
          </section>
        )}

        {page === 'admin' && isAdmin && (
          <AdminPanel
            initData={initData}
            onCatalogChanged={async () => {
              const catalog = await api.collectionCatalog(initData);
              setSpecies(catalog.items ?? []);
            }}
          />
        )}
      </main>
      {selectedSpecies && (
        <div className="creature-modal-backdrop" role="presentation" onClick={() => setSelectedSpeciesID(null)}>
          <section
            className={`creature-modal${selectedSpecies.locked ? ' creature-modal--locked' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="creature-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button className="creature-modal-close" type="button" onClick={() => setSelectedSpeciesID(null)} aria-label="Закрыть">×</button>
            {selectedSpecies.locked || !selectedSpecies.slug ? (
              <>
                <div className="creature-modal-locked-art" aria-hidden="true"><span>🔒</span></div>
                <p className="eyebrow">ЗАПИСЬ ЗАШИФРОВАНА</p>
                <h2 id="creature-modal-title">Неизвестный иномекон</h2>
                <p className="creature-modal-copy">Имя, изображение и характеристики пока скрыты. Найди этого иномекона, чтобы открыть его запись в каталоге.</p>
                <div className="locked-data-lines" aria-hidden="true"><span /><span /><span /></div>
              </>
            ) : (
              <>
                <div className="creature-modal-hero">
                  <ImagePreview src={selectedSpecies.image_url ?? ''} name={selectedSpecies.name ?? 'Иномекон'} />
                  <div>
                    <p className="eyebrow">ЗАПИСЬ ОТКРЫТА</p>
                    <h2 id="creature-modal-title">{selectedSpecies.name}</h2>
                    <span className="creature-rarity">{selectedSpecies.rarity ? (RARITIES.find((rarity) => rarity.value === selectedSpecies.rarity)?.label ?? selectedSpecies.rarity) : 'Иномекон'}</span>
                  </div>
                </div>
                {selectedSpecies.description && <p className="creature-modal-copy">{selectedSpecies.description}</p>}
                <div className="creature-stats-grid">
                  <div className="creature-stat"><span>Пассивный доход</span><strong>+{formatNumber(selectedSpecies.passive_gold_per_hour ?? 0)} <small>золота/ч</small></strong></div>
                  <div className="creature-stat"><span>Здоровье</span><strong>{formatNumber(selectedSpecies.health ?? 0)}</strong></div>
                  <div className="creature-stat"><span>Урон</span><strong>{formatNumber(selectedSpecies.damage ?? 0)}</strong></div>
                  <div className="creature-stat"><span>Шанс крит. удара</span><strong>{formatNumber(selectedSpecies.crit_chance ?? 0)}%</strong></div>
                </div>
                <p className="creature-modal-footnote">Характеристики этого вида открыты в твоём каталоге.</p>
              </>
            )}
          </section>
        </div>
      )}
      {tutorialOpen && (
        <div className="tutorial-modal-backdrop" role="presentation" onClick={closeTutorial}>
          <section className="tutorial-modal" role="dialog" aria-modal="true" aria-labelledby="tutorial-modal-title" onClick={(event) => event.stopPropagation()}>
            <button className="creature-modal-close" type="button" aria-label="Закрыть обучение" onClick={closeTutorial}>×</button>
            <div className="tutorial-modal-topline"><span>БЫСТРЫЙ СТАРТ</span><span>{tutorialStep + 1} / 4</span></div>
            <div className="tutorial-progress" aria-hidden="true">{[0, 1, 2, 3].map((step) => <span key={step} className={step <= tutorialStep ? 'is-active' : ''} />)}</div>
            {tutorialStep === 0 && <>
              <div className="tutorial-modal-art">🧬</div>
              <h2 id="tutorial-modal-title">Добро пожаловать в Иномекопы!</h2>
              <p>Твоя цель — собирать необычных существ, открывать редкие виды и развивать коллекцию. Золото нужно для яиц и ставок, а иномеконы постепенно приносят пассивный доход.</p>
              <div className="tutorial-tip"><strong>Подсказка</strong><span>Это обучение можно в любой момент открыть кнопкой «Как играть» в верхнем меню.</span></div>
            </>}
            {tutorialStep === 1 && <>
              <div className="tutorial-modal-art">🥚</div>
              <h2 id="tutorial-modal-title">Купи яйцо в магазине</h2>
              <p>Нажми «Магазин» в верхнем меню, выбери яйцо по цене и редкости и нажми «Купить яйцо». Для первого знакомства подойдёт обычное яйцо, а у загадочного сразу показаны шансы всех редкостей.</p>
              <div className="tutorial-tip"><strong>Важно</strong><span>Покупка не добавляет иномекона сразу: яйцо сначала попадёт в рюкзак, и его нужно вылупить.</span></div>
            </>}
            {tutorialStep === 2 && <>
              <div className="tutorial-modal-art">🐣</div>
              <h2 id="tutorial-modal-title">Вылупи яйцо и получай доход</h2>
              <p>В магазине пролистай страницу до раздела «Яйца в рюкзаке» и нажми «Вылупить». Новый иномекон появится в коллекции и добавит свой пассивный доход к твоему доходу в золоте за час.</p>
              <div className="tutorial-tip"><strong>Не потеряйся</strong><span>После покупки мы покажем подсказку, которая укажет на инвентарь яиц и кнопку вылупления.</span></div>
            </>}
            {tutorialStep === 3 && <>
              <div className="tutorial-modal-art">🎰</div>
              <h2 id="tutorial-modal-title">Барабан удачи</h2>
              <p>На главной можно поставить золото или конкретного иномекона. Результат и выплата рассчитываются сервером; прокрутка случайна и не гарантирует выигрыш. При победе главное число показывает, сколько золота начислено на баланс.</p>
              <div className="tutorial-tip"><strong>Начни спокойно</strong><span>Проверь ставки и правила выплат перед прокруткой. Не ставь то, что не готов потерять.</span></div>
            </>}
            <div className="tutorial-modal-actions">
              <button className="button button--secondary" type="button" disabled={tutorialStep === 0} onClick={() => setTutorialStep((step) => Math.max(0, step - 1))}>Назад</button>
              {tutorialStep < 3
                ? <button className="button button--primary" type="button" onClick={() => setTutorialStep((step) => Math.min(3, step + 1))}>Далее →</button>
                : <button className="button button--primary" type="button" onClick={closeTutorial}>Начать игру</button>}
            </div>
            {tutorialStep === 1 && <button className="tutorial-direct-shop" type="button" onClick={goToShopFromTutorial}>Практика: перейти в магазин ↗</button>}
            <button className="tutorial-skip" type="button" onClick={closeTutorial}>Пропустить обучение</button>
          </section>
        </div>
      )}
      {subscriptionModalOpen && subscriptionStatus?.enabled && (
        <div className="subscription-modal-backdrop" role="presentation" onClick={closeSubscriptionModal}>
          <section className="subscription-modal" role="dialog" aria-modal="true" aria-labelledby="subscription-modal-title" onClick={(event) => event.stopPropagation()}>
            <button className="creature-modal-close" type="button" aria-label="Закрыть" onClick={closeSubscriptionModal}>×</button>
            <div className="subscription-modal-mark" aria-hidden="true">✦</div>
            {subscriptionStatus.claimed ? <p className="eyebrow">БОНУС ЗА ПОДПИСКУ</p> : <p className="eyebrow">ПОДДЕРЖИ ПРОЕКТ</p>}
            <h2 id="subscription-modal-title">{subscriptionStatus.claimed ? 'Награда уже получена' : subscriptionStatus.title}</h2>
            <p className="subscription-modal-message">{subscriptionStatus.message}</p>
            <div className="subscription-reward-box">
              <span>ТВОЯ НАГРАДА</span>
              <strong>{[subscriptionStatus.reward_gold > 0 ? `${formatNumber(subscriptionStatus.reward_gold)} золота` : '', subscriptionStatus.reward_creature_name ? subscriptionStatus.reward_creature_name : subscriptionStatus.reward_creature_slug ? 'Иномекон из каталога' : ''].filter(Boolean).join(' + ') || 'Бонус за участие'}</strong>
              <small>Начисляется один раз на аккаунт.</small>
            </div>
            {subscriptionError && <div className={`subscription-feedback${subscriptionStatus.claimed ? ' is-success' : ''}`} role="status">{subscriptionError}</div>}
            {!subscriptionStatus.claimed && <div className="subscription-modal-actions">
              <a className="button button--secondary" href={subscriptionStatus.url} target="_blank" rel="noreferrer">Подписаться на канал ↗</a>
              <button className="button button--primary" disabled={subscriptionBusy} onClick={() => void claimSubscriptionReward()}>{subscriptionBusy ? 'Проверяем…' : 'Проверить подписку и получить'}</button>
            </div>}
            {subscriptionStatus.claimed && <button className="button button--primary subscription-close-action" onClick={closeSubscriptionModal}>Вернуться в игру</button>}
            {!subscriptionStatus.claimed && <button className="subscription-later" onClick={closeSubscriptionModal}>Не сейчас — вернусь позже</button>}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;