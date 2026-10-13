import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { APIError, api } from './api';
import type {
  Ability,
  AbilityInput,
  AbilityUpdateInput,
  Batch,
  BatchCodesResponse,
  CreateBatchInput,
  CreatedBatch,
  Rarity,
  Species,
  SpeciesInput,
  SpeciesUpdateInput,
} from './api';

type AdminPanelProps = {
  initData: string;
  onCatalogChanged: () => Promise<void>;
};
type Section = 'species' | 'abilities' | 'batches';

const RARITY_OPTIONS: { value: Rarity; label: string }[] = [
  { value: 'common', label: 'Обычная' },
  { value: 'rare', label: 'Редкая' },
  { value: 'epic', label: 'Эпическая' },
  { value: 'legendary', label: 'Легендарная' },
  { value: 'mythic', label: 'Мифическая' },
];
const ELEMENT_OPTIONS = [
  ['meteor', 'Метеор'], ['wind', 'Ветер'], ['earth', 'Земля'], ['water', 'Вода'], ['arcane', 'Магия'], ['custom', 'Особая'],
];
const EFFECT_OPTIONS = [
  ['none', 'Без эффекта'], ['burn', 'Ожог'], ['slow', 'Замедление'], ['stun', 'Оглушение'], ['weaken', 'Ослабление'], ['shield', 'Щит'],
];

const blankSpecies = (): SpeciesInput => ({
  slug: '', name: '', description: '', image_url: '', rarity: 'common', passive_gold_per_hour: 5,
  health: 100, damage: 10, crit_chance: 5, ability_id: 1,
});
const blankAbility = (): AbilityInput => ({
  slug: '', name: '', description: '', element: 'meteor', power: 10, accuracy_percent: 95,
  cooldown_seconds: 0, effect_type: 'none', effect_value: 0, effect_duration_turns: 0,
});
const blankBatch = (): CreateBatchInput => ({ label: '', count: 20, reward_preset: 'gold50', expires_in_days: 0 });

function explain(error: unknown): string {
  if (error instanceof APIError && error.status === 403) return 'Нет доступа. Проверь Telegram ID в ADMIN_TELEGRAM_IDS на сервере.';
  return error instanceof Error ? error.message : 'Не удалось выполнить операцию.';
}
function prettyDate(value?: string): string {
  if (!value) return 'Без срока';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium' }).format(date);
}

export default function AdminPanel({ initData, onCatalogChanged }: AdminPanelProps) {
  const [section, setSection] = useState<Section>('species');
  const [species, setSpecies] = useState<Species[]>([]);
  const [abilities, setAbilities] = useState<Ability[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [speciesFormOpen, setSpeciesFormOpen] = useState(false);
  const [editingSpeciesID, setEditingSpeciesID] = useState<number | null>(null);
  const [speciesForm, setSpeciesForm] = useState<SpeciesInput>(blankSpecies());
  const [imageBusy, setImageBusy] = useState(false);

  const [abilityFormOpen, setAbilityFormOpen] = useState(false);
  const [editingAbilityID, setEditingAbilityID] = useState<number | null>(null);
  const [abilityForm, setAbilityForm] = useState<AbilityInput>(blankAbility());

  const [batchForm, setBatchForm] = useState<CreateBatchInput>(blankBatch());
  const [createdBatch, setCreatedBatch] = useState<CreatedBatch | null>(null);
  const [viewCodes, setViewCodes] = useState<BatchCodesResponse | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [speciesResponse, abilityResponse, batchResponse] = await Promise.all([
        api.listSpecies(initData, true), api.listAbilities(initData), api.listBatches(initData),
      ]);
      setSpecies(speciesResponse.items ?? []);
      setAbilities(abilityResponse.items ?? []);
      setBatches(batchResponse.items ?? []);
      setSpeciesForm((current) => current.ability_id ? current : { ...current, ability_id: abilityResponse.items[0]?.id ?? 1 });
    } catch (caught) {
      setError(explain(caught));
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => { void refresh(); }, [refresh]);

  const resetSpeciesForm = () => {
    setEditingSpeciesID(null);
    setSpeciesForm({ ...blankSpecies(), ability_id: abilities[0]?.id ?? 1 });
    setSpeciesFormOpen(true);
    setError('');
    setSuccess('');
  };
  const editSpecies = (item: Species) => {
    setEditingSpeciesID(item.id);
    setSpeciesForm({
      slug: item.slug, name: item.name, description: item.description, image_url: item.image_url,
      rarity: item.rarity, passive_gold_per_hour: item.passive_gold_per_hour, health: item.health,
      damage: item.damage, crit_chance: item.crit_chance, ability_id: item.ability_id,
    });
    setSpeciesFormOpen(true);
    setError('');
    setSuccess('');
  };
  const saveSpecies = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true); setError(''); setSuccess('');
    try {
      if (editingSpeciesID === null) {
        await api.createSpecies(initData, speciesForm);
        setSuccess('Иномекон добавлен в каталог.');
      } else {
        const { slug: _slug, ...update }: SpeciesInput = speciesForm;
        await api.updateSpecies(initData, editingSpeciesID, update as SpeciesUpdateInput);
        setSuccess('Изменения иномекона сохранены.');
      }
      setSpeciesFormOpen(false);
      await refresh();
      await onCatalogChanged();
    } catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const archiveSpecies = async (item: Species) => {
    if (!window.confirm(`Архивировать «${item.name}»? История игроков сохранится, но вид больше не будет доступен как новый приз.`)) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      await api.archiveSpecies(initData, item.id);
      setSuccess(`«${item.name}» перемещён в архив.`);
      await refresh(); await onCatalogChanged();
    } catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const uploadSpeciesImage = async (file?: File) => {
    if (!file) return;
    setImageBusy(true); setError('');
    try {
      const result = await api.uploadImage(initData, file);
      setSpeciesForm((current) => ({ ...current, image_url: result.image_url }));
      setSuccess('Изображение загружено. Не забудь сохранить иномекона.');
    } catch (caught) { setError(explain(caught)); }
    finally { setImageBusy(false); }
  };

  const resetAbilityForm = () => {
    setEditingAbilityID(null); setAbilityForm(blankAbility()); setAbilityFormOpen(true); setError(''); setSuccess('');
  };
  const editAbility = (item: Ability) => {
    setEditingAbilityID(item.id);
    setAbilityForm({
      slug: item.slug, name: item.name, description: item.description, element: item.element,
      power: item.power, accuracy_percent: item.accuracy_percent, cooldown_seconds: item.cooldown_seconds,
      effect_type: item.effect_type, effect_value: item.effect_value, effect_duration_turns: item.effect_duration_turns,
    });
    setAbilityFormOpen(true); setError(''); setSuccess('');
  };
  const saveAbility = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess('');
    try {
      if (editingAbilityID === null) {
        await api.createAbility(initData, abilityForm);
        setSuccess('Способность создана.');
      } else {
        const { slug: _slug, ...update }: AbilityInput = abilityForm;
        await api.updateAbility(initData, editingAbilityID, update as AbilityUpdateInput);
        setSuccess('Способность обновлена.');
      }
      setAbilityFormOpen(false); await refresh();
    } catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const deleteAbility = async (item: Ability) => {
    if (!window.confirm(`Удалить способность «${item.name}»?`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await api.deleteAbility(initData, item.id); setSuccess('Способность удалена.'); await refresh(); }
    catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };

  const createBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess(''); setCreatedBatch(null);
    try {
      const created = await api.createBatch(initData, batchForm);
      setCreatedBatch(created); setSuccess(`Создана партия на ${created.count} кодов.`); setBatchForm((value) => ({ ...value, label: '' }));
      await refresh();
    } catch (caught) { setError(explain(caught)); }
    finally { setBusy(false); }
  };
  const openCodes = async (id: number) => {
    setBusy(true); setError('');
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

  const field = (label: string, value: string | number, onChange: (value: string) => void, opts: { type?: string; required?: boolean; min?: number; max?: number; step?: number; disabled?: boolean } = {}) => (
    <label className="field"><span className="field-label">{label}</span><input type={opts.type ?? 'text'} value={value} required={opts.required} min={opts.min} max={opts.max} step={opts.step} disabled={opts.disabled} onChange={(event) => onChange(event.target.value)} /></label>
  );

  return (
    <section className="subpage admin-page">
      <div className="subpage-heading">
        <div><p className="eyebrow">УПРАВЛЕНИЕ ПРОЕКТОМ</p><h1>Админ-панель</h1><p className="page-lead">Каталог иномеконов, способности и карточки активации.</p></div>
        <button className="button button--secondary" onClick={() => void refresh()} disabled={busy || loading}>↻ Обновить</button>
      </div>

      <div className="admin-stats">
        <div className="surface admin-stat"><span>Виды в каталоге</span><strong>{species.filter((item) => item.is_active).length}</strong></div>
        <div className="surface admin-stat"><span>Способности</span><strong>{abilities.length}</strong></div>
        <div className="surface admin-stat"><span>Партии кодов</span><strong>{batches.length}</strong></div>
      </div>

      <nav className="admin-tabs" aria-label="Разделы панели">
        <button className={section === 'species' ? 'is-active' : ''} onClick={() => setSection('species')}>Иномеконы</button>
        <button className={section === 'abilities' ? 'is-active' : ''} onClick={() => setSection('abilities')}>Способности</button>
        <button className={section === 'batches' ? 'is-active' : ''} onClick={() => setSection('batches')}>Карточки и коды</button>
      </nav>

      {error && <div className="admin-message admin-message--error" role="alert">{error}</div>}
      {success && <div className="admin-message admin-message--success" role="status">{success}</div>}
      {loading ? <div className="surface admin-empty">Загружаем данные панели…</div> : <>
        {section === 'species' && <>
          <div className="admin-section-heading"><div><h2>Каталог иномеконов</h2><p>Архивирование сохраняет историю игроков.</p></div><button className="button button--primary" onClick={resetSpeciesForm}>+ Добавить иномекона</button></div>
          {speciesFormOpen && <form className="surface admin-form" onSubmit={saveSpecies}>
            <div className="admin-form-heading"><h3>{editingSpeciesID === null ? 'Новый иномекон' : `Редактирование: ${speciesForm.name}`}</h3><button type="button" className="icon-button" onClick={() => setSpeciesFormOpen(false)} aria-label="Закрыть">×</button></div>
            <div className="admin-form-grid">
              {field('Системный ID (slug)', speciesForm.slug, (v) => setSpeciesForm((s) => ({ ...s, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })), { required: editingSpeciesID === null, disabled: editingSpeciesID !== null })}
              {field('Название', speciesForm.name, (v) => setSpeciesForm((s) => ({ ...s, name: v })), { required: true })}
              <label className="field"><span className="field-label">Редкость</span><select value={speciesForm.rarity} onChange={(e) => setSpeciesForm((s) => ({ ...s, rarity: e.target.value as Rarity }))}>{RARITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="field"><span className="field-label">Способность</span><select required value={speciesForm.ability_id} onChange={(e) => setSpeciesForm((s) => ({ ...s, ability_id: Number(e.target.value) }))}>{abilities.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.slug}</option>)}</select></label>
              {field('Золота в час', speciesForm.passive_gold_per_hour, (v) => setSpeciesForm((s) => ({ ...s, passive_gold_per_hour: Number(v) })), { type: 'number', min: 0, max: 10000000, required: true })}
              {field('Здоровье', speciesForm.health, (v) => setSpeciesForm((s) => ({ ...s, health: Number(v) })), { type: 'number', min: 1, max: 1000000, required: true })}
              {field('Урон', speciesForm.damage, (v) => setSpeciesForm((s) => ({ ...s, damage: Number(v) })), { type: 'number', min: 0, max: 1000000, required: true })}
              {field('Шанс критического удара (%)', speciesForm.crit_chance, (v) => setSpeciesForm((s) => ({ ...s, crit_chance: Number(v) })), { type: 'number', min: 0, max: 100, step: 0.1, required: true })}
              <label className="field admin-field-wide"><span className="field-label">Описание</span><textarea value={speciesForm.description} onChange={(e) => setSpeciesForm((s) => ({ ...s, description: e.target.value }))} rows={3} /></label>
              <label className="field admin-field-wide"><span className="field-label">URL изображения</span><input value={speciesForm.image_url} onChange={(e) => setSpeciesForm((s) => ({ ...s, image_url: e.target.value }))} placeholder="https://… или /uploads/…" /><input className="admin-file-input" type="file" accept="image/png,image/jpeg,image/gif" disabled={imageBusy} onChange={(e) => { void uploadSpeciesImage(e.target.files?.[0]); e.currentTarget.value = ''; }} /><small>{imageBusy ? 'Загружаем изображение…' : 'PNG, JPEG или GIF, до 5 МБ.'}</small></label>
            </div>
            <div className="admin-form-actions"><button type="button" className="button button--secondary" onClick={() => setSpeciesFormOpen(false)}>Отмена</button><button className="button button--primary" disabled={busy || imageBusy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
          </form>}
          <div className="admin-list">
            {species.map((item) => <article className={`surface admin-item ${!item.is_active ? 'admin-item--archived' : ''}`} key={item.id}>
              {item.image_url ? <img src={item.image_url} alt="" className="admin-item-image" /> : <div className="admin-item-image admin-item-image--empty">◇</div>}
              <div className="admin-item-content"><div className="admin-item-title"><h3>{item.name}</h3><span className={`admin-status ${item.is_active ? 'is-active' : ''}`}>{item.is_active ? 'Активен' : 'В архиве'}</span></div><p>{item.slug} · {RARITY_OPTIONS.find((r) => r.value === item.rarity)?.label ?? item.rarity}</p><small>{item.passive_gold_per_hour} золота/час · HP {item.health} · урон {item.damage} · способность: {item.ability_name || item.ability_slug || 'не указана'}</small></div>
              <div className="admin-item-actions"><button className="button button--secondary button--small" onClick={() => editSpecies(item)}>Изменить</button>{item.is_active && <button className="button button--ghost button--small" onClick={() => void archiveSpecies(item)} disabled={busy}>В архив</button>}</div>
            </article>)}
            {!species.length && <div className="surface admin-empty">Каталог пока пуст.</div>}
          </div>
        </>}

        {section === 'abilities' && <>
          <div className="admin-section-heading"><div><h2>Способности</h2><p>У каждой способности должен быть уникальный slug.</p></div><button className="button button--primary" onClick={resetAbilityForm}>+ Добавить способность</button></div>
          {abilityFormOpen && <form className="surface admin-form" onSubmit={saveAbility}>
            <div className="admin-form-heading"><h3>{editingAbilityID === null ? 'Новая способность' : `Редактирование: ${abilityForm.name}`}</h3><button type="button" className="icon-button" onClick={() => setAbilityFormOpen(false)} aria-label="Закрыть">×</button></div>
            <div className="admin-form-grid">
              {field('Системный ID (slug)', abilityForm.slug, (v) => setAbilityForm((s) => ({ ...s, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })), { required: editingAbilityID === null, disabled: editingAbilityID !== null })}
              {field('Название', abilityForm.name, (v) => setAbilityForm((s) => ({ ...s, name: v })), { required: true })}
              <label className="field"><span className="field-label">Стихия</span><select value={abilityForm.element} onChange={(e) => setAbilityForm((s) => ({ ...s, element: e.target.value as AbilityInput['element'] }))}>{ELEMENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {field('Сила', abilityForm.power, (v) => setAbilityForm((s) => ({ ...s, power: Number(v) })), { type: 'number', min: 0, max: 100000, required: true })}
              {field('Точность (%)', abilityForm.accuracy_percent, (v) => setAbilityForm((s) => ({ ...s, accuracy_percent: Number(v) })), { type: 'number', min: 0, max: 100, step: 0.1, required: true })}
              {field('Перезарядка (сек.)', abilityForm.cooldown_seconds, (v) => setAbilityForm((s) => ({ ...s, cooldown_seconds: Number(v) })), { type: 'number', min: 0, max: 3600, required: true })}
              <label className="field"><span className="field-label">Эффект</span><select value={abilityForm.effect_type} onChange={(e) => setAbilityForm((s) => ({ ...s, effect_type: e.target.value as AbilityInput['effect_type'], effect_value: e.target.value === 'none' ? 0 : Math.max(1, s.effect_value), effect_duration_turns: e.target.value === 'none' ? 0 : Math.max(1, s.effect_duration_turns) }))}>{EFFECT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              {field('Сила эффекта', abilityForm.effect_value, (v) => setAbilityForm((s) => ({ ...s, effect_value: Number(v) })), { type: 'number', min: 0, max: 100, required: true })}
              {field('Длительность эффекта (ходы)', abilityForm.effect_duration_turns, (v) => setAbilityForm((s) => ({ ...s, effect_duration_turns: Number(v) })), { type: 'number', min: 0, max: 600, required: true })}
              <label className="field admin-field-wide"><span className="field-label">Описание</span><textarea rows={3} value={abilityForm.description} onChange={(e) => setAbilityForm((s) => ({ ...s, description: e.target.value }))} /></label>
            </div>
            {abilityForm.effect_type === 'none' && <p className="admin-hint">Для эффекта «Без эффекта» сила и длительность должны быть равны нулю.</p>}
            <div className="admin-form-actions"><button type="button" className="button button--secondary" onClick={() => setAbilityFormOpen(false)}>Отмена</button><button className="button button--primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
          </form>}
          <div className="admin-list">{abilities.map((item) => <article className="surface admin-item" key={item.id}><div className="admin-item-image admin-ability-icon">✦</div><div className="admin-item-content"><div className="admin-item-title"><h3>{item.name}</h3>{item.is_default && <span className="admin-status is-active">Базовая</span>}</div><p>{item.slug} · {ELEMENT_OPTIONS.find(([v]) => v === item.element)?.[1] ?? item.element}</p><small>Сила {item.power} · точность {item.accuracy_percent}% · перезарядка {item.cooldown_seconds} сек. · эффект: {EFFECT_OPTIONS.find(([v]) => v === item.effect_type)?.[1] ?? item.effect_type}</small><p>{item.description}</p></div><div className="admin-item-actions"><button className="button button--secondary button--small" onClick={() => editAbility(item)}>Изменить</button><button className="button button--ghost button--small" onClick={() => void deleteAbility(item)} disabled={busy || item.is_default}>Удалить</button></div></article>)}</div>
        </>}

        {section === 'batches' && <>
          <div className="admin-section-heading"><div><h2>Партии карточек</h2><p>Создавай коды, выгружай их и отзыви неиспользованные.</p></div></div>
          <form className="surface admin-form" onSubmit={createBatch}>
            <div className="admin-form-heading"><h3>Создать партию кодов</h3></div>
            <div className="admin-form-grid">
              {field('Название партии', batchForm.label, (v) => setBatchForm((s) => ({ ...s, label: v })), { required: true })}
              {field('Количество кодов (1–500)', batchForm.count, (v) => setBatchForm((s) => ({ ...s, count: Number(v) })), { type: 'number', min: 1, max: 500, required: true })}
              <label className="field"><span className="field-label">Награда</span><select value={batchForm.reward_preset} onChange={(e) => setBatchForm((s) => ({ ...s, reward_preset: e.target.value as CreateBatchInput['reward_preset'] }))}><option value="gold50">50 золота</option><option value="gold500">500 золота</option><option value="mecop150">150 золота + иномекон</option></select></label>
              {field('Срок действия (дней, 0 = без срока)', batchForm.expires_in_days, (v) => setBatchForm((s) => ({ ...s, expires_in_days: Number(v) })), { type: 'number', min: 0, max: 365, required: true })}
            </div>
            <div className="admin-form-actions"><button className="button button--primary" disabled={busy}>{busy ? 'Создаём…' : 'Создать коды'}</button></div>
          </form>
          {createdBatch && <div className="surface admin-code-result"><div className="admin-form-heading"><div><h3>Новая партия: {createdBatch.label}</h3><p>Коды покажутся здесь сейчас. Сохрани их — повторно показать можно не всегда.</p></div><button className="button button--secondary button--small" onClick={() => { void navigator.clipboard?.writeText(createdBatch.codes.join('\n')); setSuccess('Коды скопированы, если браузер разрешил доступ к буферу обмена.'); }}>Копировать все</button></div><textarea readOnly rows={Math.min(10, Math.max(4, createdBatch.codes.length))} value={createdBatch.codes.join('\n')} /><p className="admin-hint">Создано кодов: {createdBatch.count}.</p></div>}
          {viewCodes && <div className="surface admin-code-result"><div className="admin-form-heading"><h3>Коды партии №{viewCodes.batch_id}</h3><button className="icon-button" onClick={() => setViewCodes(null)} aria-label="Закрыть">×</button></div><textarea readOnly rows={Math.min(10, Math.max(4, viewCodes.codes.length))} value={viewCodes.codes.map((item) => `${item.code ?? 'Код недоступен'}${item.redeemed_at ? ` — активирован ${prettyDate(item.redeemed_at)}` : ''}`).join('\n')} /><p className="admin-hint">Не удалось повторно показать кодов: {viewCodes.unavailable_count}.</p><button className="button button--secondary button--small" onClick={() => { void navigator.clipboard?.writeText(viewCodes.codes.map((item) => item.code ?? '').filter(Boolean).join('\n')); setSuccess('Коды скопированы, если браузер разрешил доступ к буферу обмена.'); }}>Копировать коды</button></div>}
          <div className="admin-list">{batches.map((item) => <article className="surface admin-batch" key={item.id}><div className="admin-batch-top"><div><h3>{item.label}</h3><small>Партия №{item.id} · создана {prettyDate(item.created_at)}</small></div><span className={`admin-status ${item.revoked_at ? '' : 'is-active'}`}>{item.revoked_at ? 'Отозвана' : 'Активна'}</span></div><div className="admin-batch-metrics"><span><strong>{item.code_count}</strong> кодов</span><span><strong>{item.redeemed_count}</strong> активировано</span><span><strong>{item.reward_gold}</strong> золота</span><span>Срок: <strong>{prettyDate(item.expires_at)}</strong></span></div><div className="admin-item-actions"><button className="button button--secondary button--small" onClick={() => void openCodes(item.id)} disabled={busy}>Показать коды</button>{!item.revoked_at && <button className="button button--ghost button--small" onClick={() => void revokeBatch(item)} disabled={busy}>Отозвать</button>}<button className="button button--ghost button--small" onClick={() => void deleteBatch(item)} disabled={busy || item.redeemed_count > 0}>Удалить</button></div></article>)}{!batches.length && <div className="surface admin-empty">Партий пока нет.</div>}</div>
        </>}
      </>}
    </section>
  );
}
