import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { FormEvent } from 'react';
import { APIError, api, isDemoMode } from './api';
import type { Batch, CreatedBatch, Creature, CreateBatchInput, Player, RedeemResult } from './api';

type Page = 'home' | 'collection' | 'admin';
type Notice = { kind: 'success' | 'error' | 'info'; title: string; message: string };
type QRCard = { code: string; url: string; dataUrl: string };

const REWARDS: Record<CreateBatchInput['reward_preset'], { label: string; gold: number; creature?: string }> = {
  gold50: { label: 'Обычная карточка', gold: 50 },
  gold500: { label: 'Редкая карточка', gold: 500 },
  mecop150: { label: 'Карточка с ино-мекопом', gold: 150, creature: 'ino-sprout' },
};

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark${small ? ' brand-mark--small' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none">
        <path d="M18 18 13 8l14 5M46 18l5-10-14 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 25c0-9 7-15 16-15s16 6 16 15v15c0 10-7 16-16 16S16 50 16 40V25Z" fill="#182332" stroke="currentColor" strokeWidth="3" />
        <path d="M23 31c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5Z" fill="#48E2D0" />
        <path d="M36 31c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5Z" fill="#48E2D0" />
        <path d="M27 44c3 3 7 3 10 0" stroke="#F3C975" strokeWidth="3" strokeLinecap="round" />
        <path d="M11 40c-4 4-3 9 1 11M53 40c4 4 3 9-1 11" stroke="#A78BFA" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function CreatureArt({ variant = 'sprout' }: { variant?: 'sprout' | 'rare' | 'unknown' }) {
  return (
    <div className={`creature-art creature-art--${variant}`} aria-hidden="true">
      <div className="creature-orbit creature-orbit--one" />
      <div className="creature-orbit creature-orbit--two" />
      <svg viewBox="0 0 160 160" fill="none">
        {variant === 'sprout' && <path d="M79 40C60 17 42 25 48 45c8 14 22 13 31 7M82 41c4-26 28-28 31-11 1 13-13 21-31 17" fill="#4CE0A0" stroke="#1E705B" strokeWidth="4" strokeLinejoin="round" />}
        {variant === 'rare' && <path d="M48 33 61 12l14 20 15-25 12 26 19 7-12 22H49l-12-18 11-11Z" fill="#A78BFA" stroke="#5D49A6" strokeWidth="4" strokeLinejoin="round" />}
        <path d="M37 70 24 42l27 12M123 70l13-28-27 12" stroke="#57DCD0" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M35 70c0-21 18-35 45-35s45 14 45 35v33c0 23-18 39-45 39s-45-16-45-39V70Z" fill="#233345" stroke="#70E7D7" strokeWidth="4" />
        <path d="M47 82c0-6 5-11 11-11s11 5 11 11-5 11-11 11-11-5-11-11Z" fill="#56F1D8" />
        <path d="M91 82c0-6 5-11 11-11s11 5 11 11-5 11-11 11-11-5-11-11Z" fill="#56F1D8" />
        <path d="M68 108c7 7 17 7 24 0" stroke="#F6CD79" strokeWidth="5" strokeLinecap="round" />
        <path d="M61 126h38" stroke="#516B80" strokeWidth="4" strokeLinecap="round" />
        <circle cx="24" cy="104" r="4" fill="#A78BFA" />
        <circle cx="139" cy="98" r="3" fill="#F6CD79" />
      </svg>
    </div>
  );
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ru-RU').format(value);
}

function formatDate(value?: string): string {
  if (!value) return 'Без срока';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function creatureName(slug: string): string {
  const names: Record<string, string> = { 'ino-sprout': 'Иноспрут' };
  return names[slug] ?? slug.replaceAll('-', ' ').replace(/^./, (v) => v.toUpperCase());
}

function getErrorMessage(error: unknown): string {
  if (error instanceof APIError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Произошла неизвестная ошибка.';
}

function buildStartAppURL(botUsername: string, code: string): string {
  const username = botUsername.trim().replace(/^@/, '');
  return `https://t.me/${username}?startapp=${encodeURIComponent(code)}`;
}

function getStartParam(telegram: TelegramWebApp | undefined): string {
  const signedLaunchParam = telegram?.initDataUnsafe.start_param;
  if (typeof signedLaunchParam === 'string' && signedLaunchParam.trim()) {
    return signedLaunchParam.trim();
  }
  // Telegram also exposes the launch value in the webview URL. The value is treated
  // only as a candidate code; the backend still validates and atomically redeems it.
  const params = new URLSearchParams(window.location.search);
  return (params.get('tgWebAppStartParam') ?? params.get('startapp') ?? '').trim();
}

function downloadCSV(batch: CreatedBatch, botUsername: string) {
  const quote = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;
  const rows = [
    ['code', 'telegram_startapp_url', 'batch_id', 'label', 'reward_gold', 'reward_creature_slug', 'expires_at'].map(quote).join(','),
    ...batch.codes.map((code) => [
      code,
      botUsername ? buildStartAppURL(botUsername, code) : '',
      batch.batch_id,
      batch.label,
      batch.reward_gold,
      batch.reward_creature_slug ?? '',
      batch.expires_at ?? '',
    ].map(quote).join(',')),
  ];
  const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `inomecops-batch-${batch.batch_id}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function App() {
  const telegram = window.Telegram?.WebApp;
  const initData = telegram?.initData ?? '';
  const launchCode = getStartParam(telegram);
  const botUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, '');
  const validBotUsername = /^[A-Za-z0-9_]{5,32}$/.test(botUsername);
  const autoRedeemAttempted = useRef('');
  const [page, setPage] = useState<Page>('home');
  const [player, setPlayer] = useState<Player | null>(null);
  const [creatures, setCreatures] = useState<Creature[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [code, setCode] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const [batchLabel, setBatchLabel] = useState('Школьная партия');
  const [batchCount, setBatchCount] = useState('20');
  const [rewardPreset, setRewardPreset] = useState<CreateBatchInput['reward_preset']>('gold50');
  const [expiresInDays, setExpiresInDays] = useState('0');
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [createdBatch, setCreatedBatch] = useState<CreatedBatch | null>(null);
  const [revokingID, setRevokingID] = useState<number | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [generatingQR, setGeneratingQR] = useState(false);
  const [showQRSheet, setShowQRSheet] = useState(false);
  const [qrCards, setQrCards] = useState<QRCard[]>([]);

  const demoMode = isDemoMode;
  const inTelegram = Boolean(telegram && initData);
  const canOpen = demoMode || inTelegram;
  const displayName = player?.first_name || telegram?.initDataUnsafe.user?.first_name || 'Игрок';
  const shortName = displayName.split(' ')[0];
  const collectionCount = creatures.length;

  const loadBatches = useCallback(async () => {
    const response = await api.listBatches(initData);
    setBatches(response.items ?? []);
  }, [initData]);

  const loadData = useCallback(async () => {
    if (!canOpen) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [playerResponse, creatureResponse] = await Promise.all([
        api.me(initData),
        api.creatures(initData),
      ]);
      setPlayer(playerResponse);
      setCreatures(creatureResponse.items ?? []);

      try {
        await loadBatches();
        setIsAdmin(true);
      } catch (error) {
        if (error instanceof APIError && error.status === 403) {
          setIsAdmin(false);
        } else if (error instanceof APIError && error.status === 401) {
          throw error;
        } else {
          // The player profile still works if the admin-only check has a transient server error.
          setIsAdmin(false);
        }
      }
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [canOpen, initData, loadBatches]);

  useEffect(() => {
    if (telegram) {
      telegram.ready();
      telegram.expand();
    }
    void loadData();
  }, [telegram, loadData]);

  const changePage = (next: Page) => {
    setPage(next);
    setNotice(null);
    telegram?.HapticFeedback?.selectionChanged();
  };

  const redeemCode = useCallback(async (rawCode: string) => {
    const trimmedCode = rawCode.trim().toUpperCase();
    if (!trimmedCode) {
      setNotice({ kind: 'error', title: 'Код не найден', message: 'В QR-ссылке нет кода. Попробуй открыть ссылку с карточки ещё раз.' });
      return;
    }
    setRedeeming(true);
    setNotice({ kind: 'info', title: 'Карточка найдена', message: 'Проверяем код и начисляем награду…' });
    setRedeemResult(null);
    try {
      const result = await api.redeem(initData, trimmedCode);
      setRedeemResult(result);
      setCode('');
      setPlayer((current) => current ? { ...current, gold: result.gold_balance } : current);
      setNotice({
        kind: 'success',
        title: 'Карточка активирована',
        message: result.creature_slug
          ? `Начислено ${formatNumber(result.gold_added)} золота. Новый Ино-мекоп уже в коллекции.`
          : `На баланс добавлено ${formatNumber(result.gold_added)} золота.`,
      });
      telegram?.HapticFeedback?.notificationOccurred('success');
      // Redemption is already committed. A failed collection refresh must not report it as a failure.
      try {
        const updatedCreatures = await api.creatures(initData);
        setCreatures(updatedCreatures.items ?? []);
      } catch {
        // The current screen remains usable; collection refreshes on the next app launch.
      }
    } catch (error) {
      setNotice({ kind: 'error', title: 'Не удалось активировать карточку', message: getErrorMessage(error) });
      telegram?.HapticFeedback?.notificationOccurred('error');
    } finally {
      setRedeeming(false);
    }
  }, [initData, telegram]);

  const handleRedeem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await redeemCode(code);
  };

  useEffect(() => {
    if (!launchCode || loading || loadError || !player || !canOpen) return;
    if (autoRedeemAttempted.current === launchCode) return;
    autoRedeemAttempted.current = launchCode;
    setPage('home');
    void redeemCode(launchCode);
  }, [launchCode, loading, loadError, player, canOpen, redeemCode]);

  const handleCreateBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const count = Number(batchCount);
    const expiry = Number(expiresInDays);
    if (!batchLabel.trim() || !Number.isInteger(count) || count < 1 || count > 500) {
      setNotice({ kind: 'error', title: 'Проверь параметры партии', message: 'Название обязательно, количество должно быть от 1 до 500.' });
      return;
    }
    if (!Number.isInteger(expiry) || expiry < 0 || expiry > 365) {
      setNotice({ kind: 'error', title: 'Неверный срок', message: 'Укажи срок от 0 до 365 дней. Ноль означает отсутствие срока.' });
      return;
    }
    setCreatingBatch(true);
    setNotice(null);
    setCreatedBatch(null);
    setQrCards([]);
    setShowQRSheet(false);
    setCopiedCodes(false);
    try {
      const response = await api.createBatch(initData, {
        label: batchLabel.trim(),
        count,
        reward_preset: rewardPreset,
        expires_in_days: expiry,
      });
      setCreatedBatch(response);
      await loadBatches();
      setNotice({ kind: 'success', title: 'Партия создана', message: `${response.count} одноразовых кодов создано. Скачай CSV сейчас: исходные коды повторно не получить.` });
      telegram?.HapticFeedback?.notificationOccurred('success');
    } catch (error) {
      setNotice({ kind: 'error', title: 'Не удалось создать партию', message: getErrorMessage(error) });
    } finally {
      setCreatingBatch(false);
    }
  };

  const handlePrepareQR = async () => {
    if (!createdBatch) return;
    if (!validBotUsername) {
      setNotice({ kind: 'error', title: 'Не задан username бота', message: 'Добавь VITE_TELEGRAM_BOT_USERNAME в frontend/.env.local без символа @ и перезапусти Vite.' });
      return;
    }
    if (demoMode) {
      setNotice({ kind: 'error', title: 'Демо-коды нельзя печатать', message: 'Включён демо-режим: эти коды фиктивные и не сработают в настоящем боте.' });
      return;
    }
    setGeneratingQR(true);
    setNotice(null);
    try {
      const cards = await Promise.all(createdBatch.codes.map(async (code) => {
        const url = buildStartAppURL(botUsername, code);
        const dataUrl = await QRCode.toDataURL(url, {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 360,
          color: { dark: '#10131c', light: '#ffffff' },
        });
        return { code, url, dataUrl };
      }));
      setQrCards(cards);
      setShowQRSheet(true);
    } catch (error) {
      setNotice({ kind: 'error', title: 'Не удалось создать QR', message: getErrorMessage(error) });
    } finally {
      setGeneratingQR(false);
    }
  };

  const handleCopyCodes = async () => {
    if (!createdBatch) return;
    try {
      await navigator.clipboard.writeText(createdBatch.codes.join('\n'));
      setCopiedCodes(true);
      setNotice({ kind: 'success', title: 'Коды скопированы', message: 'Сохрани их в защищённом месте или скачай CSV.' });
    } catch {
      setNotice({ kind: 'error', title: 'Буфер недоступен', message: 'Скачай CSV — в нём есть все сгенерированные коды.' });
    }
  };

  const handleRevokeBatch = async (batch: Batch) => {
    if (batch.revoked_at) return;
    const accepted = window.confirm(`Отозвать партию «${batch.label}»? Все ещё не активированные коды этой партии перестанут работать.`);
    if (!accepted) return;
    setRevokingID(batch.id);
    setNotice(null);
    try {
      await api.revokeBatch(initData, batch.id);
      await loadBatches();
      setNotice({ kind: 'success', title: 'Партия отозвана', message: 'Неиспользованные коды больше нельзя активировать.' });
    } catch (error) {
      setNotice({ kind: 'error', title: 'Не удалось отозвать партию', message: getErrorMessage(error) });
    } finally {
      setRevokingID(null);
    }
  };

  const totals = useMemo(() => ({
    codes: batches.reduce((sum, batch) => sum + batch.code_count, 0),
    used: batches.reduce((sum, batch) => sum + batch.redeemed_count, 0),
    active: batches.reduce((sum, batch) => sum + (batch.revoked_at ? 0 : Math.max(0, batch.code_count - batch.redeemed_count)), 0),
  }), [batches]);

  if (!canOpen) {
    return (
      <div className="launch-screen">
        <div className="launch-glow launch-glow--one" />
        <div className="launch-glow launch-glow--two" />
        <div className="launch-card">
          <BrandMark />
          <p className="eyebrow">ИГРОВОЙ МИР</p>
          <h1>Ино-мекопы</h1>
          <p className="muted launch-copy">Карточки, редкие существа и твоя личная коллекция — внутри Telegram.</p>
          <div className="launch-instruction"><span className="launch-icon">↗</span><span>Открой эту Mini App через бота в Telegram, чтобы войти в свой профиль.</span></div>
          {demoMode && <p className="demo-note">Демо-режим включён, но Telegram initData не найден.</p>}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <BrandMark />
        <div className="loading-indicator" />
        <p>Подключаемся к миру Ино-мекопов…</p>
      </div>
    );
  }

  if (loadError || !player) {
    return (
      <div className="launch-screen">
        <div className="launch-card launch-card--error">
          <BrandMark />
          <p className="eyebrow">НЕ УДАЛОСЬ ПОДКЛЮЧИТЬСЯ</p>
          <h1>Портал пока закрыт</h1>
          <p className="muted launch-copy">{loadError || 'Не удалось загрузить профиль.'}</p>
          <button className="button button--primary button--wide" onClick={() => void loadData()}>Попробовать ещё раз <span>↻</span></button>
          <p className="tiny-note">Проверь, что Go API запущен и доступен по адресу, на который настроен прокси фронтенда.</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="app-shell">
      <div className="background-orb background-orb--top" />
      <div className="background-orb background-orb--bottom" />
      <header className="topbar">
        <button className="brand-button" onClick={() => changePage('home')} aria-label="На главную">
          <BrandMark small />
          <span className="brand-wordmark"><strong>ИНО-МЕКОПЫ</strong><small>МИР НАХОДОК</small></span>
        </button>
        <nav className="main-nav" aria-label="Основная навигация">
          <button className={page === 'home' ? 'nav-link nav-link--active' : 'nav-link'} onClick={() => changePage('home')}>Обзор</button>
          <button className={page === 'collection' ? 'nav-link nav-link--active' : 'nav-link'} onClick={() => changePage('collection')}>Коллекция <span className="nav-count">{collectionCount}</span></button>
          {isAdmin && <button className={page === 'admin' ? 'nav-link nav-link--active' : 'nav-link'} onClick={() => changePage('admin')}>Управление <span className="admin-dot" /></button>}
        </nav>
        <div className="top-profile">
          <div className="top-profile-copy"><span>Привет,</span><strong>{shortName}</strong></div>
          <div className="profile-avatar"><BrandMark small /></div>
        </div>
      </header>

      {notice && (
        <div className={`notice notice--${notice.kind}`} role="status">
          <span className="notice-symbol">{notice.kind === 'success' ? '✓' : notice.kind === 'error' ? '!' : 'i'}</span>
          <div><strong>{notice.title}</strong><p>{notice.message}</p></div>
          <button className="notice-close" aria-label="Закрыть сообщение" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {page === 'home' && (
        <main className="page-content">
          <section className="welcome-row">
            <div className="welcome-copy">
              <p className="eyebrow"><span className="eyebrow-line" /> СЕЗОН 01 <span className="eyebrow-dot">•</span> КОЛЛЕКЦИОНИРОВАНИЕ НАЧИНАЕТСЯ ЗДЕСЬ</p>
              <h1>Твой мир.<br /><span>Твои находки.</span></h1>
              <p className="welcome-description">Каждая карточка открывает что-то новое. Активируй код, собирай Ино-мекопов и пополняй свой запас золота.</p>
              <div className="welcome-meta"><span className="live-dot" /> Портал активен <span className="meta-divider" /> <span className="meta-number">ID {player.telegram_id}</span></div>
            </div>
            <div className="hero-art-wrap">
              <div className="hero-art-grid" />
              <div className="hero-art-glow" />
              <div className="hero-art-spark hero-art-spark--one">✦</div>
              <div className="hero-art-spark hero-art-spark--two">✧</div>
              <CreatureArt />
              <div className="hero-art-caption"><span className="caption-dot" /> ТВОЙ ПЕРВЫЙ СПУТНИК</div>
              <div className="hero-art-orbit-label">INO / 001</div>
            </div>
          </section>

          <section className="dashboard-grid">
            <article className="panel balance-panel">
              <div className="panel-topline"><span className="section-label">ТВОЙ БАЛАНС</span><span className="panel-icon panel-icon--gold">✳</span></div>
              <div className="balance-value">{formatNumber(player.gold)} <span>золота</span></div>
              <div className="balance-footer"><span className="coin-symbol">✦</span><span>Игровая валюта</span><span className="balance-note">Пополняется карточками</span></div>
              <div className="balance-decoration balance-decoration--one" /><div className="balance-decoration balance-decoration--two" />
            </article>
            <article className="panel collection-stat-panel">
              <div className="stat-icon stat-icon--mint"><BrandMark small /></div>
              <div><span className="section-label">В КОЛЛЕКЦИИ</span><div className="stat-number">{collectionCount.toString().padStart(2, '0')} <span>сущ.</span></div><p>Каждая находка уникальна</p></div>
              <button className="round-arrow" onClick={() => changePage('collection')} aria-label="Открыть коллекцию">↗</button>
            </article>
          </section>

          <section className="content-grid">
            <article className="panel redeem-panel">
              <div className="section-heading"><div><p className="eyebrow">ЕСТЬ КАРТОЧКА?</p><h2>Открой свою находку</h2></div><span className="step-number">01 <i>/ 02</i></span></div>
              <p className="panel-description">Введи уникальный код с карточки. Награда сразу появится в твоём профиле.</p>
              <form className="redeem-form" onSubmit={handleRedeem}>
                <label className="input-wrap"><span className="input-prefix">#</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="НАПРИМЕР, INOME-…" autoComplete="off" autoCapitalize="characters" maxLength={64} aria-label="Код карточки" /><span className="input-hint">ОДНОРАЗОВЫЙ КОД</span></label>
                <button className="button button--primary" type="submit" disabled={redeeming || !code.trim()}>{redeeming ? <><span className="button-spinner" /> Проверяем…</> : <>Активировать код <span className="button-arrow">↗</span></>}</button>
              </form>
              <div className="redeem-footnote"><span className="lock-symbol">◇</span> Один код — одна награда. Использованный код повторно не активировать.</div>
              {redeemResult && <div className="reward-result"><div className="reward-result-icon">✦</div><div><strong>Награда получена</strong><span>+{formatNumber(redeemResult.gold_added)} золота{redeemResult.creature_slug ? ` · ${creatureName(redeemResult.creature_slug)}` : ''}</span></div><span className="reward-result-check">✓</span></div>}
            </article>

            <article className="panel how-panel">
              <div className="section-heading section-heading--compact"><div><p className="eyebrow">НАЧАТЬ ПРОСТО</p><h2>Три шага</h2></div><span className="how-spark">✧</span></div>
              <div className="how-steps">
                <div className="how-step"><span className="how-step-index">01</span><span className="how-step-icon how-step-icon--mint">⌁</span><div><strong>Найди карточку</strong><p>Ищи их в школьном пространстве.</p></div></div>
                <div className="how-step"><span className="how-step-index">02</span><span className="how-step-icon how-step-icon--violet">⌗</span><div><strong>Активируй код</strong><p>Введи его выше — награда твоя.</p></div></div>
                <div className="how-step"><span className="how-step-index">03</span><span className="how-step-icon how-step-icon--gold">✦</span><div><strong>Собирай коллекцию</strong><p>Открывай новых Ино-мекопов.</p></div></div>
              </div>
              <div className="how-bottom"><span>ИССЛЕДУЙ СВОЙ МИР</span><span>↗</span></div>
            </article>
          </section>

          <section className="section-lower-heading"><div><p className="eyebrow">ТВОЯ КОМАНДА</p><h2>Последние находки</h2></div><button className="text-link" onClick={() => changePage('collection')}>Вся коллекция <span>↗</span></button></section>
          {creatures.length ? (
            <section className="creature-strip">
              {creatures.slice(0, 3).map((creature) => <CreatureCard key={creature.id} creature={creature} />)}
              <button className="add-creature-card" onClick={() => changePage('collection')}><span>+</span><strong>Найти ещё</strong><small>Твоя следующая история начинается с карточки</small></button>
            </section>
          ) : <EmptyCollection onExplore={() => document.querySelector<HTMLInputElement>('.input-wrap input')?.focus()} />}
          <footer className="site-footer"><span>ИНО-МЕКОПЫ <i>©</i> 2026</span><span>Создано для любопытных <b>✦</b></span><span>ИГРОВАЯ ВАЛЮТА НЕ ИМЕЕТ ДЕНЕЖНОЙ ЦЕННОСТИ</span></footer>
        </main>
      )}

      {page === 'collection' && (
        <main className="page-content subpage-content">
          <div className="subpage-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> АРХИВ НАХОДОК</p><h1>Твоя <span>коллекция.</span></h1><p>Каждый Ино-мекоп — часть твоей истории.</p></div><div className="collection-count-card"><span>СОБРАНО</span><strong>{collectionCount.toString().padStart(2, '0')}<i> / ∞</i></strong><small>найденных существ</small></div></div>
          {creatures.length ? <section className="creature-grid">{creatures.map((creature) => <CreatureCard key={creature.id} creature={creature} large />)}<button className="add-creature-card add-creature-card--large" onClick={() => changePage('home')}><span>+</span><strong>Здесь есть место новым открытиям</strong><small>Найди карточку и активируй код, чтобы пополнить коллекцию.</small><em>Перейти к активации ↗</em></button></section> : <EmptyCollection onExplore={() => changePage('home')} />}
          <footer className="site-footer"><span>ИНО-МЕКОПЫ <i>©</i> 2026</span><span>Твоя коллекция — твоя история</span></footer>
        </main>
      )}

      {page === 'admin' && isAdmin && (
        <main className="page-content subpage-content admin-page">
          <div className="subpage-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> СЛУЖЕБНАЯ ЗОНА</p><h1>Управление <span>кодами.</span></h1><p>Создавай партии карточек, экспортируй коды и контролируй активации.</p></div><span className="admin-verified"><span /> ДОСТУП ПОДТВЕРЖДЁН</span></div>
          <section className="admin-stats-grid">
            <AdminStat label="Всего кодов" value={formatNumber(totals.codes)} detail="Создано во всех партиях" icon="⌗" tone="mint" />
            <AdminStat label="Активировано" value={formatNumber(totals.used)} detail={totals.codes ? `${Math.round((totals.used / totals.codes) * 100)}% от общего числа` : 'Пока нет активаций'} icon="✓" tone="violet" />
            <AdminStat label="Доступно" value={formatNumber(totals.active)} detail="Не отозвано и не использовано" icon="✦" tone="gold" />
          </section>
          <section className="admin-layout">
            <article className="panel admin-form-panel">
              <div className="section-heading"><div><p className="eyebrow">ГЕНЕРАТОР КАРТОЧЕК</p><h2>Новая партия</h2></div><span className="section-icon">＋</span></div>
              <p className="panel-description">Коды генерируются один раз. Сохрани CSV сразу после выпуска партии.</p>
              <form className="admin-form" onSubmit={handleCreateBatch}>
                <label className="field-label">Название партии<input value={batchLabel} onChange={(event) => setBatchLabel(event.target.value)} maxLength={100} placeholder="Например, Корпус А — первая партия" required /></label>
                <div className="form-row">
                  <label className="field-label">Количество кодов<input type="number" value={batchCount} onChange={(event) => setBatchCount(event.target.value)} min={1} max={500} step={1} required /><small>От 1 до 500</small></label>
                  <label className="field-label">Срок действия<select value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}><option value="0">Без срока</option><option value="7">7 дней</option><option value="30">30 дней</option><option value="90">90 дней</option><option value="180">180 дней</option><option value="365">365 дней</option></select></label>
                </div>
                <fieldset className="reward-selector"><legend>Награда за активацию</legend>
                  {(Object.entries(REWARDS) as [CreateBatchInput['reward_preset'], typeof REWARDS[keyof typeof REWARDS]][]).map(([value, reward]) => (
                    <label className={`reward-option${rewardPreset === value ? ' reward-option--selected' : ''}`} key={value}>
                      <input type="radio" name="reward_preset" value={value} checked={rewardPreset === value} onChange={() => setRewardPreset(value)} />
                      <span className={`reward-glyph reward-glyph--${value}`}>{value === 'gold500' ? '✧' : value === 'mecop150' ? '♧' : '✦'}</span>
                      <span className="reward-option-copy"><strong>{reward.label}</strong><small>{reward.gold} золота{reward.creature ? ' + Иноспрут' : ''}</small></span>
                      <span className="radio-dot" />
                    </label>
                  ))}
                </fieldset>
                <button className="button button--primary button--wide" type="submit" disabled={creatingBatch}>{creatingBatch ? <><span className="button-spinner" /> Генерируем…</> : <>Сгенерировать коды <span className="button-arrow">↗</span></>}</button>
                <p className="form-security-note"><span>◇</span> В базе хранятся хеши. Исходные коды повторно получить нельзя.</p>
              </form>
            </article>
            <div className="admin-side-column">
              {createdBatch ? (
                <article className="panel generated-panel">
                  <div className="generated-head"><span className="generated-icon">✓</span><div><p className="eyebrow">ПАРТИЯ #{createdBatch.batch_id}</p><h3>Коды готовы</h3></div></div>
                  <p className="panel-description">Создано {createdBatch.count} кодов. Сохрани их сейчас, повторно сервер их не покажет.</p>
                  <div className="generated-summary"><div><span>Награда</span><strong>{createdBatch.reward_gold} золота{createdBatch.reward_creature_slug ? ' + Иноспрут' : ''}</strong></div><div><span>Срок действия</span><strong>{formatDate(createdBatch.expires_at)}</strong></div></div>
                  <div className="code-preview-list">{createdBatch.codes.slice(0, 5).map((value) => <code key={value}>{value}</code>)}{createdBatch.codes.length > 5 && <span className="more-codes">+ ещё {createdBatch.codes.length - 5} кодов</span>}</div>
                  <div className="generated-actions generated-actions--three"><button className="button button--primary button--wide" onClick={() => downloadCSV(createdBatch, validBotUsername ? botUsername : '')}>{validBotUsername ? '↓ CSV + ссылки' : '↓ Скачать CSV'}</button><button className="button button--secondary button--wide" onClick={() => void handlePrepareQR()} disabled={generatingQR || !validBotUsername || demoMode}>{generatingQR ? 'Создаём QR…' : '▦ QR-карточки'}</button><button className="button button--secondary button--wide" onClick={() => void handleCopyCodes()}>{copiedCodes ? '✓ Скопировано' : 'Копировать коды'}</button></div>
                  {!validBotUsername && <p className="qr-config-note">Чтобы создавать QR-ссылки, добавь VITE_TELEGRAM_BOT_USERNAME в frontend/.env.local (без @).</p>}
                  {demoMode && <p className="qr-config-note">Печать QR отключена в демо-режиме, чтобы случайно не распечатать фиктивные коды.</p>}
                </article>
              ) : (
                <article className="panel admin-tip-panel"><div className="tip-mark"><BrandMark /></div><p className="eyebrow">ВАЖНО</p><h3>Сохрани коды сразу</h3><p>После создания партии исходные коды показываются только в ответе генератора. Если закрыть экран до экспорта, придётся выпускать новую партию.</p><div className="tip-bottom"><span>ЗАЩИТА ОТ ПОВТОРА</span><span>↗</span></div></article>
              )}
              <article className="panel batches-panel">
                <div className="section-heading section-heading--compact"><div><p className="eyebrow">ИСТОРИЯ</p><h2>Партии кодов</h2></div><button className="icon-button" onClick={() => void loadBatches()} aria-label="Обновить список">↻</button></div>
                {batches.length ? <div className="batch-list">{batches.map((batch) => <BatchRow key={batch.id} batch={batch} onRevoke={() => void handleRevokeBatch(batch)} revoking={revokingID === batch.id} />)}</div> : <div className="batch-empty">Пока нет партий. Создай первую слева.</div>}
              </article>
            </div>
          </section>
          <footer className="site-footer"><span>ИНО-МЕКОПЫ <i>©</i> 2026</span><span>Административная панель</span><span>Доступ защищён серверной проверкой Telegram ID</span></footer>
        </main>
      )}

      {page === 'admin' && !isAdmin && <main className="page-content subpage-content"><div className="access-denied panel"><span>⌁</span><h1>Доступ закрыт</h1><p>У этой учётной записи нет прав на управление кодами.</p><button className="button button--primary" onClick={() => changePage('home')}>Вернуться на главную</button></div></main>}
    </div>
    {showQRSheet && createdBatch && (
      <div className="qr-overlay" role="dialog" aria-modal="true" aria-label="QR-карточки партии">
        <section className="qr-dialog">
          <div className="qr-dialog-toolbar">
            <div>
              <p className="eyebrow">ПЕЧАТЬ КАРТОЧЕК</p>
              <h2>QR готовы</h2>
              <p>Сканирование открывает Mini App в Telegram и автоматически активирует одноразовый код.</p>
            </div>
            <button className="icon-button" onClick={() => setShowQRSheet(false)} aria-label="Закрыть QR-карточки">×</button>
          </div>
          <div className="qr-dialog-actions">
            <span>{qrCards.length} карточек · {createdBatch.reward_gold} золота{createdBatch.reward_creature_slug ? ' + Иноспрут' : ''}</span>
            <button className="button button--primary" onClick={() => window.print()}>Печать / сохранить PDF</button>
          </div>
          <div className="qr-print-grid">
            {qrCards.map((card, index) => (
              <article className="qr-print-card" key={card.code}>
                <strong className="qr-card-brand">ИНО-МЕКОПЫ</strong>
                <span className="qr-card-reward">{createdBatch.reward_gold} ЗОЛОТА{createdBatch.reward_creature_slug ? ' + ИНО-МЕКОП' : ''}</span>
                <img src={card.dataUrl} alt={`QR-код карточки ${index + 1}`} />
                <strong className="qr-card-instruction">Сканируй и забирай награду</strong>
                <code>{card.code}</code>
                <small>Одноразовый код · {index + 1} / {qrCards.length}</small>
              </article>
            ))}
          </div>
        </section>
      </div>
    )}
    </>
  );
}

function CreatureCard({ creature, large = false }: { creature: Creature; large?: boolean }) {
  const sprout = creature.species_slug === 'ino-sprout';
  return (
    <article className={`creature-card${large ? ' creature-card--large' : ''}`}>
      <div className="creature-card-art"><span className="rarity-label"><span /> {sprout ? 'ОБЫЧНЫЙ' : 'НЕИЗВЕСТНЫЙ'}</span><CreatureArt variant={sprout ? 'sprout' : 'unknown'} /><span className="creature-serial">INO / {String(creature.id).padStart(3, '0')}</span></div>
      <div className="creature-card-info"><div><h3>{creatureName(creature.species_slug)}</h3><p>Найден {formatDate(creature.obtained_at)}</p></div><span className="creature-card-arrow">↗</span></div>
    </article>
  );
}

function EmptyCollection({ onExplore }: { onExplore: () => void }) {
  return (
    <div className="empty-collection panel"><div className="empty-art"><CreatureArt variant="unknown" /></div><p className="eyebrow">НЕИЗВЕДАННАЯ ТЕРРИТОРИЯ</p><h3>Здесь пока пусто</h3><p>Найди карточку Ино-мекопа и активируй код — первое открытие запомнится.</p><button className="button button--primary" onClick={onExplore}>Активировать карточку <span className="button-arrow">↗</span></button></div>
  );
}

function AdminStat({ label, value, detail, icon, tone }: { label: string; value: string; detail: string; icon: string; tone: 'mint' | 'violet' | 'gold' }) {
  return <article className="panel admin-stat"><span className={`admin-stat-icon admin-stat-icon--${tone}`}>{icon}</span><div><span className="section-label">{label}</span><strong>{value}</strong><p>{detail}</p></div></article>;
}

function BatchRow({ batch, onRevoke, revoking }: { batch: Batch; onRevoke: () => void; revoking: boolean }) {
  const percent = batch.code_count ? Math.min(100, Math.round((batch.redeemed_count / batch.code_count) * 100)) : 0;
  return (
    <div className={`batch-row${batch.revoked_at ? ' batch-row--revoked' : ''}`}>
      <div className="batch-row-main"><div className="batch-avatar">{batch.reward_creature_slug ? '♧' : batch.reward_gold >= 500 ? '✧' : '✦'}</div><div className="batch-row-copy"><strong>{batch.label}</strong><span>#{batch.id} · {formatDate(batch.created_at)} · {batch.reward_gold} золота{batch.reward_creature_slug ? ' + Иноспрут' : ''}</span></div><span className={`batch-status${batch.revoked_at ? ' batch-status--revoked' : ''}`}>{batch.revoked_at ? 'Отозвана' : 'Активна'}</span></div>
      <div className="batch-progress-meta"><span>{batch.redeemed_count} из {batch.code_count} активировано</span><strong>{percent}%</strong></div><div className="batch-progress"><span style={{ width: `${percent}%` }} /></div>
      <div className="batch-row-footer"><span>Срок: {formatDate(batch.expires_at)}</span>{!batch.revoked_at && <button className="batch-revoke" onClick={onRevoke} disabled={revoking}>{revoking ? 'Отзываем…' : 'Отозвать партию'}</button>}</div>
    </div>
  );
}

export default App;
