import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { APIError, api, isDemoMode } from './api';
import type { Creature, Player, RedeemResult, Rarity, SlotSpinRequest, SlotSpinResult, Species } from './api';

// ==================== Типы и константы ====================

type Page = 'home' | 'collection';
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

  const [page, setPage] = useState<Page>('home');
  const [player, setPlayer] = useState<Player | null>(null);
  const [ownedCreatures, setOwnedCreatures] = useState<Creature[]>([]);
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);

  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);

  const [slotBet, setSlotBet] = useState(50);
  const [slotBetType, setSlotBetType] = useState<'gold' | 'creature'>('gold');
  const [slotCreatureID, setSlotCreatureID] = useState<number | ''>('');
  const [slotReels, setSlotReels] = useState<[string, string, string]>(['🍒', '💎', '🧬']);
  const [slotRolling, setSlotRolling] = useState(false);
  const [slotResult, setSlotResult] = useState<SlotSpinResult | null>(null);



  const demoMode = isDemoMode;
  const inTelegram = Boolean(telegram && initData);
  const canOpen = demoMode || inTelegram;
  const displayName = player?.first_name || telegram?.initDataUnsafe.user?.first_name || 'Игрок';
  const currentSpecies = useMemo(() => new Map(species.map((item) => [item.slug, item])), [species]);
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
      if ((playerResponse.passive_gold_claimed ?? 0) > 0) {
        setNotice({
          kind: 'success',
          title: 'Пассивный доход начислен',
          message: `+${formatNumber(playerResponse.passive_gold_claimed ?? 0)} золота за время отсутствия.`,
        });
      }
      try {
        const catalog = await api.listSpecies(initData, false);
        setSpecies(catalog.items ?? []);
      } catch {
        /* The player's profile remains available if public catalog is temporarily unavailable. */
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
        const creatureResponse = await api.creatures(initData);
        setOwnedCreatures(creatureResponse.items ?? []);
        setNotice({
          kind: 'success',
          title: 'Карточка активирована',
          message: `Получено ${formatNumber(result.gold_added)} золота${
            result.creature_slug ? ` и новый иномекон: ${creatureName(result.creature_slug)}` : ''
          }.`,
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

  const playSlot = async () => {
    if (slotRolling) return;
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
      void Promise.all([api.me(initData), api.creatures(initData)])
        .then(([freshPlayer, freshCreatures]) => {
          setPlayer(freshPlayer);
          setOwnedCreatures(freshCreatures.items ?? []);
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
                        <strong>{slotResult.message}</strong>
                        {slotResult.bet_type === 'creature' ? (
                          <span>
                            Ставка: {slotResult.bet_creature_name ?? 'иномекон'} ·{' '}
                            <b className={slotResult.creature_stake_lost ? 'slot-net-negative' : 'slot-net-positive'}>
                              {slotResult.creature_stake_lost ? 'потерян' : 'сохранён'}
                            </b>
                            {!!slotResult.creature_rewards?.length && ` · Получено: ${slotResult.creature_rewards.map((item) => item.name).join(', ')}`}
                          </span>
                        ) : (
                          <span>
                            Выплата: {formatNumber(slotResult.payout)} золота · чистый итог:{' '}
                            <b className={slotResult.net >= 0 ? 'slot-net-positive' : 'slot-net-negative'}>
                              {slotResult.net > 0 ? '+' : ''}{formatNumber(slotResult.net)}
                            </b>
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
                          <button type="button" aria-label="Уменьшить ставку" disabled={slotRolling || slotBet <= 10} onClick={() => setSlotBet((value) => Math.max(10, value - 10))}>−</button>
                          <strong>{formatNumber(slotBet)}</strong>
                          <button type="button" aria-label="Увеличить ставку" disabled={slotRolling || slotBet >= 10000} onClick={() => setSlotBet((value) => Math.min(10000, value + 10))}>+</button>
                        </div>
                        <div className="slot-bet-presets">
                          {[10, 50, 100, 250, 500].map((value) => (
                            <button type="button" key={value} className={slotBet === value ? 'is-selected' : ''} disabled={slotRolling} onClick={() => setSlotBet(value)}>
                              {value}
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
                    disabled={slotRolling || (slotBetType === 'gold' ? (player?.gold ?? 0) < slotBet : !selectedSlotCreature)}
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
                        +{formatNumber(redeemResult.gold_added)} золота
                        {redeemResult.creature_slug ? ` · ${creatureName(redeemResult.creature_slug)}` : ''}
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

        {page === 'collection' && (
          <section className="subpage">
            <div className="subpage-heading">
              <div>
                <p className="eyebrow">МОИ НАХОДКИ</p>
                <h1>Коллекция</h1>
                <p className="page-lead">Все полученные иномеконы — в одном месте.</p>
              </div>
              <span className="count-pill">{ownedCreatures.length} существ</span>
            </div>
            {ownedCreatures.length ? (
              <div className="species-grid">
                {ownedCreatures.map((owned) => {
                  const item = currentSpecies.get(owned.species_slug);
                  return (
                    <article className="species-card" key={owned.id}>
                      <ImagePreview
                        src={item?.image_url ?? ''}
                        name={item?.name ?? creatureName(owned.species_slug)}
                      />
                      <div className="species-info">
                        <h3>{item?.name ?? creatureName(owned.species_slug)}</h3>
                        <span>
                          {item ? RARITIES.find((rarity) => rarity.value === item.rarity)?.label : 'Иномекон'}
                        </span>
                        <small>Получен {formatDate(owned.obtained_at)}</small>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <h2>Коллекция пуста</h2>
                <p>Активируй коды с карточек, чтобы пополнять команду.</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

export default App;