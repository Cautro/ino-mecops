import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { FormEvent } from 'react';
import { APIError, api } from './api';
import type { Batch, BatchCodesResponse, CreateBatchInput, CreatedBatch, EggKind, EggProduct, EggProductUpdateInput, MainBonusType, Rarity, Species, SpeciesInput, SpeciesUpdateInput } from './api';

type AdminPanelProps = {
  initData: string;
  onCatalogChanged: () => Promise<void>;
};
type Section = 'species' | 'eggs' | 'batches';

const RARITY_OPTIONS: { value: Rarity; label: string }[] = [
  { value: 'common', label: 'Обычная' },
  { value: 'rare', label: 'Редкая' },
  { value: 'epic', label: 'Эпическая' },
  { value: 'legendary', label: 'Легендарная' },
  { value: 'mythic', label: 'Мифическая' },
];

const blankSpecies = (abilityID = 1): SpeciesInput => ({
  slug: '', name: '', description: '', image_url: '', sell_price_gold: 0, rarity: 'common', passive_gold_per_hour: 5,
  health: 100, damage: 10, crit_chance: 5, ability_id: abilityID, is_featured: false, main_bonus_type: 'none', main_bonus_multiplier: 1,
});
const blankBatch = (): CreateBatchInput => ({
  label: '', count: 20, reward_mode: 'random', reward_name: 'Случайная награда', reward_rarity: 'Случайная', reward_gold: 0,
  reward_gold_min: 50, reward_gold_max: 250, reward_creature_rarities: ['common', 'rare', 'epic', 'legendary', 'mythic'],
  reward_creature_slug: '', expires_in_days: 0,
});

function explain(error: unknown): string {
  if (error instanceof APIError && error.status === 403) return 'Нет доступа. Проверь Telegram ID в ADMIN_TELEGRAM_IDS на сервере.';
  return error instanceof Error ? error.message : 'Не удалось выполнить операцию.';
}
function prettyDate(value?: string): string {
  if (!value) return 'Без срока';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(date);
}
function creatureName(species: Species[], slug?: string): string {
  if (!slug) return 'Без иномекона';
  return species.find((item) => item.slug === slug)?.name ?? slug;
}
function rarityLabel(rarity: string): string {
  return RARITY_OPTIONS.find((item) => item.value === rarity)?.label ?? rarity;
}
function rewardSummary(reward?: { reward_gold?: number; reward_creature_slug?: string; reward_name?: string; reward_rarity?: string }, species: Species[] = []): string {
  if (!reward) return 'Награда';
  const pieces = [reward.reward_name, reward.reward_rarity, `${Number(reward.reward_gold ?? 0).toLocaleString('ru-RU')} золота`];
  if (reward.reward_creature_slug) pieces.push(creatureName(species, reward.reward_creature_slug));
  return pieces.filter(Boolean).join(' · ');
}
const telegramBotUsername = (import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? '').trim().replace(/^@/, '');
function qrPayload(code: string): string {
  return telegramBotUsername ? `https://t.me/${telegramBotUsername}?start=${encodeURIComponent(code)}` : code;
}

export default function AdminPanel({ initData, onCatalogChanged }: AdminPanelProps) {
  const [section, setSection] = useState<Section>('species');
  const [species, setSpecies] = useState<Species[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [eggProducts, setEggProducts] = useState<EggProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [speciesFormOpen, setSpeciesFormOpen] = useState(false);
  const [editingSpeciesID, setEditingSpeciesID] = useState<number | null>(null);
  const [speciesForm, setSpeciesForm] = useState<SpeciesInput>(blankSpecies());
  const [imageBusy, setImageBusy] = useState(false);
  const [batchForm, setBatchForm] = useState<CreateBatchInput>(blankBatch());
  const [createdBatch, setCreatedBatch] = useState<CreatedBatch | null>(null);
  const [viewCodes, setViewCodes] = useState<BatchCodesResponse | null>(null);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [speciesResponse, batchResponse, eggResponse] = await Promise.all([
        api.listAdminSpecies(initData), api.listBatches(initData), api.listAdminEggProducts(initData),
      ]);
      const loadedSpecies = speciesResponse.items ?? [];
      setSpecies(loadedSpecies);
      setBatches(batchResponse.items ?? []);
      setEggProducts(eggResponse.items ?? []);
      const abilityID = loadedSpecies[0]?.ability_id ?? 1;
      setSpeciesForm((current) => current.ability_id ? current : { ...current, ability_id: abilityID });
    } catch (caught) { setError(explain(caught)); }
    finally { setLoading(false); }
  }, [initData]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    const all = new Map<string, string>();
    if (createdBatch) createdBatch.codes.forEach((code, index) => all.set(code, rewardSummary(createdBatch.rewards?.[index], species)));
    if (viewCodes) viewCodes.codes.forEach((entry) => all.set(entry.code, rewardSummary(entry, species)));
    const make = async () => {
      const pairs = await Promise.all(Array.from(all.keys()).map(async (code) => {
        try { return [code, await QRCode.toDataURL(qrPayload(code), { errorCorrectionLevel: 'M', width: 144, margin: 1 })] as const; }
        catch { return [code, ''] as const; }
      }));
      if (!cancelled) setQrImages(Object.fromEntries(pairs.filter((pair) => pair[1])));
    };
    void make();
    return () => { cancelled = true; };
  }, [createdBatch, viewCodes, species]);

  const resetSpeciesForm = () => {
    setEditingSpeciesID(null);
    setSpeciesForm(blankSpecies(species[0]?.ability_id ?? 1));
    setSpeciesFormOpen(true); setError(''); setSuccess('');
  };
  const editSpecies = (item: Species) => {
    setEditingSpeciesID(item.id);
    setSpeciesForm({
      slug: item.slug, name: item.name, description: item.description, image_url: item.image_url, sell_price_gold: item.sell_price_gold,
      rarity: item.rarity, passive_gold_per_hour: item.passive_gold_per_hour, health: item.health,
      damage: item.damage, crit_chance: item.crit_chance, ability_id: item.ability_id, is_featured: false, main_bonus_type: item.main_bonus_type ?? 'none', main_bonus_multiplier: item.main_bonus_multiplier ?? 1,
    });
    setSpeciesFormOpen(true); setError(''); setSuccess('');
  };
  const saveSpecies = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      if (editingSpeciesID === null) {
        await api.createSpecies(initData, speciesForm);
        setSuccess('Иномекон добавлен в каталог.');
      } else {
        const { slug: _slug, ...update }: SpeciesInput = speciesForm;
        await api.updateSpecies(initData, editingSpeciesID, update as SpeciesUpdateInput);
        setSuccess('Изменения иномекона сохранены.');
      }
      setSpeciesFormOpen(false); await refresh(); await onCatalogChanged();
    } catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const deleteSpecies = async (item: Species) => {
    if (!window.confirm(`Удалить «${item.name}» НАВСЕГДА? Все экземпляры исчезнут из коллекций игроков, а неиспользованные промокоды с этим иномеконом будут отозваны. Отменить это действие нельзя.`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await api.deleteSpecies(initData, item.id); setSuccess(`«${item.name}» окончательно удалён из каталога.`); await refresh(); await onCatalogChanged(); }
    catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const uploadSpeciesImage = async (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) {
      setError('Выбери изображение PNG, JPEG или GIF.'); return;
    }
    if (file.size > 5 * 1024 * 1024) { setError('Размер изображения не должен превышать 5 МБ.'); return; }
    setImageBusy(true); setError(''); setSuccess('');
    try {
      const result = await api.uploadImage(initData, file);
      setSpeciesForm((current) => ({ ...current, image_url: result.image_url }));
      setSuccess('Изображение загружено. Не забудь сохранить иномекона.');
    } catch (caught) { setError(explain(caught)); }
    finally { setImageBusy(false); }
  };

  const uploadEggImage = async (rarity: EggKind, file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif'].includes(file.type)) { setError('Выбери изображение PNG, JPEG или GIF.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('Размер изображения не должен превышать 5 МБ.'); return; }
    setImageBusy(true); setError(''); setSuccess('');
    try {
      const result = await api.uploadImage(initData, file);
      setEggProducts((items) => items.map((item) => item.rarity === rarity ? { ...item, image_url: result.image_url } : item));
      setSuccess('Изображение контейнера загружено. Нажми «Сохранить контейнер».');
    } catch (caught) { setError(explain(caught)); }
    finally { setImageBusy(false); }
  };

  const saveEggProduct = async (item: EggProduct) => {
    setBusy(true); setError(''); setSuccess('');
    const payload: EggProductUpdateInput = { label: item.label, price_gold: item.price_gold, image_url: item.image_url, description: item.description, is_active: item.is_active, ...(item.rarity === 'mystery' ? { rarity_chances: item.rarity_chances } : {}) };
    try {
      const updated = await api.updateAdminEggProduct(initData, item.rarity, payload);
      setEggProducts((items) => items.map((egg) => egg.rarity === updated.rarity ? updated : egg));
      setSuccess(`Настройки «${updated.label}» сохранены.`);
      await onCatalogChanged();
    } catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };

  const createBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess(''); setCreatedBatch(null);
    if (batchForm.reward_mode === 'fixed' && (batchForm.reward_gold < 0 || (batchForm.reward_gold === 0 && !batchForm.reward_creature_slug))) {
      setError('Награда должна содержать золото и/или одного иномекона.'); setBusy(false); return;
    }
    if (batchForm.reward_mode === 'random' && (batchForm.reward_gold_min < 0 || batchForm.reward_gold_max < batchForm.reward_gold_min || (batchForm.reward_creature_rarities.length === 0 && batchForm.reward_gold_min < 1))) {
      setError('Если иномекон не выбран, минимальное золото должно быть больше нуля. Проверь диапазон награды.'); setBusy(false); return;
    }
    try {
      const created = await api.createBatch(initData, { ...batchForm, reward_creature_slug: batchForm.reward_creature_slug || undefined });
      setCreatedBatch(created); setSuccess(`Создана партия «${created.label}» на ${created.count} кодов.`);
      setBatchForm((value) => ({ ...value, label: '' }));
      await refresh();
    } catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const openCodes = async (id: number) => {
    setBusy(true); setError(''); setSuccess('');
    try { setViewCodes(await api.batchCodes(initData, id)); }
    catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const revokeBatch = async (item: Batch) => {
    if (!window.confirm(`Отозвать все неиспользованные коды партии «${item.label}»?`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await api.revokeBatch(initData, item.id); setSuccess('Партия отозвана.'); await refresh(); }
    catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const deleteBatch = async (item: Batch) => {
    if (!window.confirm(`Удалить партию «${item.label}»? Это возможно, только если коды ещё не активировали.`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await api.deleteBatch(initData, item.id); setSuccess('Партия удалена.'); await refresh(); }
    catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const copyCodes = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setSuccess('Коды скопированы в буфер обмена.'); }
    catch { setError('Браузер запретил копирование. Выдели коды в поле и скопируй вручную.'); }
  };
  const field = (label: string, value: string | number, onChange: (value: string) => void, opts: { type?: string; required?: boolean; min?: number; max?: number; maxLength?: number; step?: number | 'any'; disabled?: boolean; placeholder?: string } = {}) => (
    <label className="field"><span className="field-label">{label}</span><input type={opts.type ?? 'text'} value={value} required={opts.required} min={opts.min} max={opts.max} maxLength={opts.maxLength} step={opts.step ?? (opts.type === 'number' ? 'any' : undefined)} disabled={opts.disabled} placeholder={opts.placeholder} onChange={(event) => onChange(event.target.value)} /></label>
  );

  return (
    <section className="subpage admin-page">
      <div className="subpage-heading">
        <div><p className="eyebrow">УПРАВЛЕНИЕ ПРОЕКТОМ</p><h1>Админ-панель</h1><p className="page-lead">Каталог существ, коллекционные контейнеры и QR-коды с наградами.</p></div>
        <button className="button button--secondary" onClick={() => void refresh()} disabled={busy || loading}>↻ Обновить</button>
      </div>

      <div className="admin-stats">
        <div className="surface admin-stat"><span>Активные иномеконы</span><strong>{species.filter((item) => item.is_active).length}</strong></div>
        <div className="surface admin-stat"><span>Партии кодов</span><strong>{batches.length}</strong></div>
        <div className="surface admin-stat"><span>Всего кодов</span><strong>{batches.reduce((sum, item) => sum + item.code_count, 0)}</strong></div>
      </div>

      <nav className="admin-tabs" aria-label="Разделы панели">
        <button className={section === 'species' ? 'is-active' : ''} onClick={() => setSection('species')}>Иномеконы</button>
        <button className={section === 'eggs' ? 'is-active' : ''} onClick={() => setSection('eggs')}>Коллекционные контейнеры</button>
        <button className={section === 'batches' ? 'is-active' : ''} onClick={() => setSection('batches')}>Награды и коды</button>
      </nav>

      {error && <div className="admin-message admin-message--error" role="alert">{error}</div>}
      {success && <div className="admin-message admin-message--success" role="status">{success}</div>}
      {loading ? <div className="surface admin-empty">Загружаем данные панели…</div> : <>
        {section === 'species' && <>
          <div className="admin-section-heading"><div><h2>Каталог иномеконов</h2><p>Настраивай параметры индивидуального бонуса. Каждый игрок сам выбирает одного из своих иномеконов в основной слот.</p></div><button className="button button--primary" onClick={resetSpeciesForm}>+ Добавить иномекона</button></div>
          {speciesFormOpen && <form className="surface admin-form" onSubmit={saveSpecies}>
            <div className="admin-form-heading"><h3>{editingSpeciesID === null ? 'Новый иномекон' : `Редактирование: ${speciesForm.name}`}</h3><button type="button" className="icon-button" onClick={() => setSpeciesFormOpen(false)} aria-label="Закрыть">×</button></div>
            <div className="admin-form-grid">
              {field('Системный ID (slug)', speciesForm.slug, (v) => setSpeciesForm((s) => ({ ...s, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })), { required: editingSpeciesID === null, disabled: editingSpeciesID !== null, placeholder: 'ino-sprout' })}
              {field('Название', speciesForm.name, (v) => setSpeciesForm((s) => ({ ...s, name: v })), { required: true })}
              <label className="field"><span className="field-label">Редкость иномекона</span><select value={speciesForm.rarity} onChange={(e) => setSpeciesForm((s) => ({ ...s, rarity: e.target.value as Rarity }))}>{RARITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="field"><span className="field-label">Бонус в основном слоте</span><select value={speciesForm.main_bonus_type} onChange={(e) => setSpeciesForm((s) => ({ ...s, main_bonus_type: e.target.value as MainBonusType }))}><option value="none">Без бонуса</option><option value="lootbox_chance">Повышенный шанс редких иномеконов</option><option value="lootbox_gold">Дополнительное золото при открытии</option><option value="passive_income">Увеличенный пассивный доход</option></select></label>
              <label className="field"><span className="field-label">Сила бонуса (×)</span><input type="number" min={1} max={10} step={0.1} required value={speciesForm.main_bonus_multiplier} onChange={(e) => setSpeciesForm((s) => ({ ...s, main_bonus_multiplier: Number(e.target.value) }))} /><small>Допускаются дробные множители, например ×1,2 или ×1,5.</small></label>
              {field('Пассивный доход (золота/час)', speciesForm.passive_gold_per_hour, (v) => setSpeciesForm((s) => ({ ...s, passive_gold_per_hour: Number(v) })), { type: 'number', min: 0, max: 10000000, required: true, step: 0.1 })}
              {field('Здоровье', speciesForm.health, (v) => setSpeciesForm((s) => ({ ...s, health: Number(v) })), { type: 'number', min: 1, max: 1000000, required: true, step: 0.1 })}
              {field('Урон', speciesForm.damage, (v) => setSpeciesForm((s) => ({ ...s, damage: Number(v) })), { type: 'number', min: 0, max: 1000000, required: true, step: 0.1 })}
              {field('Шанс критического удара (%)', speciesForm.crit_chance, (v) => setSpeciesForm((s) => ({ ...s, crit_chance: Number(v) })), { type: 'number', min: 0, max: 100, required: true, step: 0.1 })}
              {field('Цена продажи (золота)', speciesForm.sell_price_gold, (v) => setSpeciesForm((s) => ({ ...s, sell_price_gold: Number(v) })), { type: 'number', min: 0, max: 1000000000, required: true })}
              <label className="field admin-field-wide"><span className="field-label">Описание</span><textarea value={speciesForm.description} onChange={(e) => setSpeciesForm((s) => ({ ...s, description: e.target.value }))} rows={3} maxLength={1000} /></label>
              <label className="field admin-field-wide"><span className="field-label">Изображение</span><input value={speciesForm.image_url} onChange={(e) => setSpeciesForm((s) => ({ ...s, image_url: e.target.value }))} placeholder="Ссылка или загрузка файла ниже" /><input className="admin-file-input" type="file" accept="image/png,image/jpeg,image/gif" disabled={imageBusy} onChange={(e) => { const file = e.target.files?.[0]; void uploadSpeciesImage(file); e.currentTarget.value = ''; }} /><small>{imageBusy ? 'Загружаем изображение…' : 'PNG, JPEG или GIF, до 5 МБ. Файл сохраняется на сервере.'}</small>{speciesForm.image_url && <img src={speciesForm.image_url} alt="Предпросмотр иномекона" className="admin-image-preview" />}</label>
            </div>
            <div className="admin-form-actions"><button type="button" className="button button--secondary" onClick={() => setSpeciesFormOpen(false)}>Отмена</button><button className="button button--primary" disabled={busy || imageBusy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
          </form>}
          <div className="admin-list">
            {species.map((item) => <article className={`surface admin-item ${!item.is_active ? 'admin-item--archived' : ''}`} key={item.id}>
              {item.image_url ? <img src={item.image_url} alt="" className="admin-item-image" /> : <div className="admin-item-image admin-item-image--empty">◇</div>}
              <div className="admin-item-content"><div className="admin-item-title"><h3>{item.name}</h3><span className={`admin-status ${item.is_active ? 'is-active' : ''}`}>{item.is_active ? 'Активен' : 'В архиве'}</span></div><p>{item.slug} · {RARITY_OPTIONS.find((r) => r.value === item.rarity)?.label ?? item.rarity}</p><small>{item.passive_gold_per_hour} золота/час · продажа: {item.sell_price_gold.toLocaleString('ru-RU')} золота</small><small>Бонус основного слота: {item.main_bonus_type === 'lootbox_chance' ? `шанс редкостей ×${item.main_bonus_multiplier}` : item.main_bonus_type === 'lootbox_gold' ? `бонус золота ×${item.main_bonus_multiplier}` : item.main_bonus_type === 'passive_income' ? `пассивный доход ×${item.main_bonus_multiplier}` : 'нет'}</small>{item.description && <p>{item.description}</p>}</div>
              <div className="admin-item-actions"><button className="button button--secondary button--small" onClick={() => editSpecies(item)}>Изменить</button><button className="button button--danger button--small" onClick={() => void deleteSpecies(item)} disabled={busy}>Удалить навсегда</button></div>
            </article>)}
            {!species.length && <div className="surface admin-empty">Каталог пока пуст.</div>}
          </div>
        </>}

        {section === 'eggs' && <>
          <div className="admin-section-heading"><div><h2>Настройки контейнера</h2><p>Настраивай единый коллекционный контейнер: название, цену, изображение, описание и прозрачные вероятности наград.</p></div></div>
          <div className="egg-admin-grid">
            {eggProducts.map((egg) => <form className="surface egg-admin-card" key={egg.rarity} onSubmit={(event) => { event.preventDefault(); void saveEggProduct(egg); }}>
              <div className="admin-form-heading"><div><h3>{egg.label}</h3><span className={`rarity-tag rarity-tag--${egg.rarity}`}>{egg.rarity === 'mystery' ? 'Коллекционный контейнер' : RARITY_OPTIONS.find((item) => item.value === egg.rarity)?.label ?? egg.rarity}</span></div><label className="admin-inline-toggle"><input type="checkbox" checked={egg.is_active} onChange={(event) => setEggProducts((items) => items.map((item) => item.rarity === egg.rarity ? { ...item, is_active: event.target.checked } : item))} /> Доступно</label></div>
              <div className="egg-admin-preview">{egg.image_url ? <img src={egg.image_url} alt={egg.label} /> : <span>◇</span>}</div>
              <div className="admin-form-grid">
                {field('Название контейнера', egg.label, (v) => setEggProducts((items) => items.map((item) => item.rarity === egg.rarity ? { ...item, label: v } : item)), { required: true, maxLength: 80 })}
                {field('Цена (золота)', egg.price_gold, (v) => setEggProducts((items) => items.map((item) => item.rarity === egg.rarity ? { ...item, price_gold: Number(v) } : item)), { type: 'number', min: 1, max: 100000000, required: true })}
                <label className="field admin-field-wide"><span className="field-label">URL картинки</span><input value={egg.image_url} maxLength={500} onChange={(event) => setEggProducts((items) => items.map((item) => item.rarity === egg.rarity ? { ...item, image_url: event.target.value } : item))} placeholder="/uploads/container.png или https://…" /><input className="admin-file-input" type="file" accept="image/png,image/jpeg,image/gif" disabled={imageBusy} onChange={(event) => { const file = event.target.files?.[0]; void uploadEggImage(egg.rarity, file); event.currentTarget.value = ''; }} /><small>{imageBusy ? 'Загружаем изображение…' : 'PNG, JPEG или GIF до 5 МБ. Загрузка сохранит файл, затем нажми «Сохранить контейнер».'}</small></label>
                <label className="field admin-field-wide"><span className="field-label">Описание</span><textarea value={egg.description} rows={3} maxLength={500} onChange={(event) => setEggProducts((items) => items.map((item) => item.rarity === egg.rarity ? { ...item, description: event.target.value } : item))} /></label>
                {egg.rarity === 'mystery' && <div className="mystery-egg-chance-editor admin-field-wide">
                  <div><strong>Шансы редкостей</strong><small>Сумма должна быть ровно 100%. Можно указать 0% для любой редкости, если её не нужно выдавать.</small></div>
                  <div className="mystery-egg-chance-fields">
                    {RARITY_OPTIONS.map((option) => <label className="field" key={option.value}><span className="field-label">{option.label}, %</span><input type="number" min={option.value === 'mythic' ? 1 : 0} max={100} required value={egg.rarity_chances?.[option.value] ?? ({ common: 60, rare: 25, epic: 10, legendary: 4, mythic: 1 }[option.value])} onChange={(event) => setEggProducts((items) => items.map((item) => item.rarity === 'mystery' ? { ...item, rarity_chances: { common: 60, rare: 25, epic: 10, legendary: 4, mythic: 1, ...(item.rarity_chances ?? {}), [option.value]: Number(event.target.value) } } : item))} /></label>)}
                  </div>
                  <small>Если у редкости нет активных иномеконов, её шанс перераспределяется между доступными. Если все заданные шансы приходятся на отсутствующие редкости, доступные редкости получают равные шансы.</small>
                </div>}
              </div>
              <div className="admin-form-actions"><button className="button button--primary" disabled={busy || imageBusy}>{busy ? 'Сохраняем…' : 'Сохранить контейнер'}</button></div>
            </form>)}
          </div>
        </>}

        {section === 'batches' && <>
          <div className="admin-section-heading"><div><h2>Награды и QR-коды</h2><p>Создавай партии кодов с фиксированной или случайной наградой: диапазоном золота и иномеконами выбранных редкостей.</p></div></div>
          <form className="surface admin-form" onSubmit={createBatch}>
            <div className="admin-form-heading"><h3>Создать партию кодов</h3></div>
            <div className="admin-form-grid">
              {field('Название партии', batchForm.label, (v) => setBatchForm((s) => ({ ...s, label: v })), { required: true, placeholder: 'Например, призы за викторину' })}
              {field('Количество кодов (1–500)', batchForm.count, (v) => setBatchForm((s) => ({ ...s, count: Number(v) })), { type: 'number', min: 1, max: 500, step: 1, required: true })}
              <label className="field"><span className="field-label">Тип награды</span><select value={batchForm.reward_mode} onChange={(event) => setBatchForm((s) => ({ ...s, reward_mode: event.target.value as 'fixed' | 'random' }))}><option value="random">Случайный лут для каждого кода</option><option value="fixed">Одинаковая награда для всех</option></select></label>
              {batchForm.reward_mode === 'fixed' ? <>
                {field('Название награды', batchForm.reward_name, (v) => setBatchForm((s) => ({ ...s, reward_name: v })), { required: true, maxLength: 80, placeholder: 'Например, Секретный набор' })}
                {field('Редкость награды', batchForm.reward_rarity, (v) => setBatchForm((s) => ({ ...s, reward_rarity: v })), { required: true, maxLength: 32, placeholder: 'Обычная, Секретная, Ивентовая…' })}
                {field('Золото на код', batchForm.reward_gold, (v) => setBatchForm((s) => ({ ...s, reward_gold: Number(v) })), { type: 'number', min: 0, max: 100000000, step: 1, required: true })}
                <label className="field"><span className="field-label">Иномекон в награде (необязательно)</span><select value={batchForm.reward_creature_slug ?? ''} onChange={(e) => setBatchForm((s) => ({ ...s, reward_creature_slug: e.target.value }))}><option value="">Не выдавать иномекона</option>{species.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.slug}>{item.name} · {rarityLabel(item.rarity)}</option>)}</select></label>
              </> : <>
                {field('Минимум золота (включительно)', batchForm.reward_gold_min, (v) => setBatchForm((s) => ({ ...s, reward_gold_min: Number(v) })), { type: 'number', min: 0, max: 100000000, step: 1, required: true })}
                {field('Максимум золота (включительно)', batchForm.reward_gold_max, (v) => setBatchForm((s) => ({ ...s, reward_gold_max: Number(v) })), { type: 'number', min: 0, max: 100000000, step: 1, required: true })}
                <fieldset className="field admin-field-wide admin-rarity-picker"><legend className="field-label">Какие редкости существ могут выпасть?</legend><div className="admin-rarity-options">{RARITY_OPTIONS.map((option) => <label key={option.value}><input type="checkbox" checked={batchForm.reward_creature_rarities.includes(option.value)} onChange={(event) => setBatchForm((s) => ({ ...s, reward_creature_rarities: event.target.checked ? [...s.reward_creature_rarities, option.value] : s.reward_creature_rarities.filter((value) => value !== option.value) }))} /><span>{option.label}</span></label>)}</div><small>Если выбрано несколько редкостей, редкость определяется с относительными весами 60 / 25 / 10 / 4 / 1, затем выбирается активный иномекон этой редкости. Если выбраны все редкости, доступны все виды.</small></fieldset>
                {field('Название награды в карточке (необязательно)', batchForm.reward_name, (v) => setBatchForm((s) => ({ ...s, reward_name: v })), { maxLength: 80, placeholder: 'Случайная награда' })}
              </>}
              {field('Срок действия (дней, 0 = без срока)', batchForm.expires_in_days, (v) => setBatchForm((s) => ({ ...s, expires_in_days: Number(v) })), { type: 'number', min: 0, max: 365, step: 1, required: true })}
            </div>
            <p className="admin-hint">Для случайной партии сервер закрепляет отдельный случайный лут за каждым кодом при генерации — награда не меняется при повторном открытии истории. QR-код запускает Telegram-бота и открывает игру с нужным кодом.</p>
            <div className="admin-form-actions"><button className="button button--primary" disabled={busy}>{busy ? 'Создаём…' : 'Создать коды'}</button></div>
          </form>
          {createdBatch && <div className="surface admin-code-result">
            <div className="admin-form-heading"><div><h3>Новая партия: {createdBatch.label}</h3><p>{createdBatch.reward_mode === 'random' ? `Случайный лут · золото ${createdBatch.reward_gold_min}–${createdBatch.reward_gold_max} · редкости: ${(createdBatch.reward_creature_rarities ?? []).map(rarityLabel).join(', ') || 'без иномекона'}` : `${createdBatch.reward_name} · ${createdBatch.reward_rarity} · ${createdBatch.reward_gold} золота${createdBatch.reward_creature_slug ? ` + ${creatureName(species, createdBatch.reward_creature_slug)}` : ''}`}</p><p>Каждая карточка QR соответствует конкретному коду и закреплённой за ним награде.</p></div><div className="admin-item-actions"><button className="button button--secondary button--small" onClick={() => void copyCodes(createdBatch.codes.join('\n'))}>Копировать все</button><button className="button button--secondary button--small" onClick={() => window.print()}>Печать QR</button></div></div>
            <textarea readOnly rows={Math.min(12, Math.max(4, createdBatch.codes.length))} value={createdBatch.codes.join('\n')} />
            <div className="admin-qr-grid">{createdBatch.codes.map((code, index) => <article className="admin-qr-card" key={code}><div className="admin-qr-image">{qrImages[code] ? <img src={qrImages[code]} alt={`QR-код ${code}`} /> : <span>Создаём QR…</span>}</div><strong>{code}</strong><small>{rewardSummary(createdBatch.rewards?.[index], species)}</small><button type="button" className="button button--secondary button--small" onClick={() => void copyCodes(code)}>Копировать код</button></article>)}</div>
            {!telegramBotUsername && <p className="admin-hint">Сейчас QR кодирует текст кода. Чтобы сканирование открывало бота автоматически, добавь в frontend/.env.production переменную VITE_TELEGRAM_BOT_USERNAME=имя_бота без @ и пересобери frontend.</p>}
            <p className="admin-hint">Создано кодов: {createdBatch.count}. QR можно распечатать, а новые коды будут доступны в истории партии.</p>
          </div>}
          {viewCodes && <div className="surface admin-code-result"><div className="admin-form-heading"><div><h3>Коды партии №{viewCodes.batch_id}</h3><p>Для каждого кода сохранена собственная награда. Активированные коды тоже остаются в истории.</p></div><div className="admin-item-actions"><button className="button button--secondary button--small" onClick={() => window.print()}>Печать QR</button><button className="icon-button" onClick={() => setViewCodes(null)} aria-label="Закрыть">×</button></div></div><textarea readOnly rows={Math.min(12, Math.max(4, viewCodes.codes.length))} value={viewCodes.codes.map((item) => `${item.code ?? 'Исходный код не сохранён'} — ${rewardSummary(item, species)}${item.redeemed_at ? ` — активирован ${prettyDate(item.redeemed_at)}` : ''}`).join('\n')} /><div className="admin-form-actions"><button className="button button--secondary button--small" onClick={() => void copyCodes(viewCodes.codes.map((item) => item.code ?? '').filter(Boolean).join('\n'))}>Копировать коды</button></div><div className="admin-qr-grid">{viewCodes.codes.map((item) => <article className="admin-qr-card" key={item.code}><div className="admin-qr-image">{qrImages[item.code] ? <img src={qrImages[item.code]} alt={`QR-код ${item.code}`} /> : <span>Создаём QR…</span>}</div><strong>{item.code}</strong><small>{rewardSummary(item, species)}</small>{item.redeemed_at && <small>Активирован {prettyDate(item.redeemed_at)}</small>}<button type="button" className="button button--secondary button--small" onClick={() => void copyCodes(item.code)}>Копировать код</button></article>)}</div>{!telegramBotUsername && <p className="admin-hint">Для открытия бота из QR настрой VITE_TELEGRAM_BOT_USERNAME и пересобери frontend.</p>}{viewCodes.unavailable_count > 0 && <p className="admin-hint">У {viewCodes.unavailable_count} старых кодов нельзя восстановить исходный текст: в базе был сохранён только хеш.</p>}</div>}
          <div className="admin-list">{batches.map((item) => <article className="surface admin-batch" key={item.id}>
            <div className="admin-batch-top"><div><h3>{item.label}</h3><small>Партия №{item.id} · создана {prettyDate(item.created_at)}</small></div><span className={`admin-status ${item.revoked_at ? '' : 'is-active'}`}>{item.revoked_at ? 'Отозвана' : 'Активна'}</span></div>
            <p className="admin-reward-label"><strong>{item.reward_mode === 'random' ? 'Случайная награда каждого кода' : (item.reward_name || 'Награда')}</strong><span>{item.reward_mode === 'random' ? `Золото ${item.reward_gold_min ?? 0}–${item.reward_gold_max ?? 0} · ${(item.reward_creature_rarities ?? []).map(rarityLabel).join(', ') || 'без иномекона'}` : (item.reward_rarity || 'Обычная')}</span></p>
            <div className="admin-batch-metrics"><span><strong>{item.code_count}</strong> кодов</span><span><strong>{item.redeemed_count}</strong> активировано</span><span><strong>{item.reward_gold}</strong> золота</span><span><strong>{creatureName(species, item.reward_creature_slug)}</strong></span><span>Срок: <strong>{prettyDate(item.expires_at)}</strong></span></div>
            <div className="admin-item-actions"><button className="button button--secondary button--small" onClick={() => void openCodes(item.id)} disabled={busy}>Показать коды</button>{!item.revoked_at && <button className="button button--ghost button--small" onClick={() => void revokeBatch(item)} disabled={busy}>Отозвать</button>}<button className="button button--ghost button--small" onClick={() => void deleteBatch(item)} disabled={busy || item.redeemed_count > 0}>Удалить</button></div>
          </article>)}{!batches.length && <div className="surface admin-empty">Партий пока нет.</div>}</div>
        </>}
      </>}
    </section>
  );
}
