import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { APIError, api } from './api';
import type { Batch, BatchCodesResponse, CreateBatchInput, CreatedBatch, Rarity, Species, SpeciesInput, SpeciesUpdateInput } from './api';

type AdminPanelProps = {
  initData: string;
  onCatalogChanged: () => Promise<void>;
};
type Section = 'species' | 'batches';

const RARITY_OPTIONS: { value: Rarity; label: string }[] = [
  { value: 'common', label: 'Обычная' },
  { value: 'rare', label: 'Редкая' },
  { value: 'epic', label: 'Эпическая' },
  { value: 'legendary', label: 'Легендарная' },
  { value: 'mythic', label: 'Мифическая' },
];

const blankSpecies = (abilityID = 1): SpeciesInput => ({
  slug: '', name: '', description: '', image_url: '', rarity: 'common', passive_gold_per_hour: 5,
  health: 100, damage: 10, crit_chance: 5, ability_id: abilityID,
});
const blankBatch = (): CreateBatchInput => ({
  label: '', count: 20, reward_name: '', reward_rarity: 'Обычная', reward_gold: 50,
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

export default function AdminPanel({ initData, onCatalogChanged }: AdminPanelProps) {
  const [section, setSection] = useState<Section>('species');
  const [species, setSpecies] = useState<Species[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
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

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [speciesResponse, batchResponse] = await Promise.all([
        api.listSpecies(initData, true), api.listBatches(initData),
      ]);
      const loadedSpecies = speciesResponse.items ?? [];
      setSpecies(loadedSpecies);
      setBatches(batchResponse.items ?? []);
      const abilityID = loadedSpecies[0]?.ability_id ?? 1;
      setSpeciesForm((current) => current.ability_id ? current : { ...current, ability_id: abilityID });
    } catch (caught) { setError(explain(caught)); }
    finally { setLoading(false); }
  }, [initData]);

  useEffect(() => { void refresh(); }, [refresh]);

  const resetSpeciesForm = () => {
    setEditingSpeciesID(null);
    setSpeciesForm(blankSpecies(species[0]?.ability_id ?? 1));
    setSpeciesFormOpen(true); setError(''); setSuccess('');
  };
  const editSpecies = (item: Species) => {
    setEditingSpeciesID(item.id);
    setSpeciesForm({
      slug: item.slug, name: item.name, description: item.description, image_url: item.image_url,
      rarity: item.rarity, passive_gold_per_hour: item.passive_gold_per_hour, health: item.health,
      damage: item.damage, crit_chance: item.crit_chance, ability_id: item.ability_id,
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
  const archiveSpecies = async (item: Species) => {
    if (!window.confirm(`Архивировать «${item.name}»? История игроков сохранится, но вид нельзя будет выбрать для новых наград.`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await api.archiveSpecies(initData, item.id); setSuccess(`«${item.name}» перемещён в архив.`); await refresh(); await onCatalogChanged(); }
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

  const createBatch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setSuccess(''); setCreatedBatch(null);
    if (batchForm.reward_gold < 0 || (batchForm.reward_gold === 0 && !batchForm.reward_creature_slug)) {
      setError('Награда должна содержать золото и/или одного иномекона.'); setBusy(false); return;
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
  const field = (label: string, value: string | number, onChange: (value: string) => void, opts: { type?: string; required?: boolean; min?: number; max?: number; maxLength?: number; step?: number; disabled?: boolean; placeholder?: string } = {}) => (
    <label className="field"><span className="field-label">{label}</span><input type={opts.type ?? 'text'} value={value} required={opts.required} min={opts.min} max={opts.max} maxLength={opts.maxLength} step={opts.step} disabled={opts.disabled} placeholder={opts.placeholder} onChange={(event) => onChange(event.target.value)} /></label>
  );

  return (
    <section className="subpage admin-page">
      <div className="subpage-heading">
        <div><p className="eyebrow">УПРАВЛЕНИЕ ПРОЕКТОМ</p><h1>Админ-панель</h1><p className="page-lead">Каталог иномеконов и пользовательские награды для кодов активации.</p></div>
        <button className="button button--secondary" onClick={() => void refresh()} disabled={busy || loading}>↻ Обновить</button>
      </div>

      <div className="admin-stats">
        <div className="surface admin-stat"><span>Активные иномеконы</span><strong>{species.filter((item) => item.is_active).length}</strong></div>
        <div className="surface admin-stat"><span>Партии кодов</span><strong>{batches.length}</strong></div>
        <div className="surface admin-stat"><span>Всего кодов</span><strong>{batches.reduce((sum, item) => sum + item.code_count, 0)}</strong></div>
      </div>

      <nav className="admin-tabs" aria-label="Разделы панели">
        <button className={section === 'species' ? 'is-active' : ''} onClick={() => setSection('species')}>Иномеконы</button>
        <button className={section === 'batches' ? 'is-active' : ''} onClick={() => setSection('batches')}>Награды и коды</button>
      </nav>

      {error && <div className="admin-message admin-message--error" role="alert">{error}</div>}
      {success && <div className="admin-message admin-message--success" role="status">{success}</div>}
      {loading ? <div className="surface admin-empty">Загружаем данные панели…</div> : <>
        {section === 'species' && <>
          <div className="admin-section-heading"><div><h2>Каталог иномеконов</h2><p>Боевые характеристики больше не настраиваются здесь. Архивирование сохраняет историю игроков.</p></div><button className="button button--primary" onClick={resetSpeciesForm}>+ Добавить иномекона</button></div>
          {speciesFormOpen && <form className="surface admin-form" onSubmit={saveSpecies}>
            <div className="admin-form-heading"><h3>{editingSpeciesID === null ? 'Новый иномекон' : `Редактирование: ${speciesForm.name}`}</h3><button type="button" className="icon-button" onClick={() => setSpeciesFormOpen(false)} aria-label="Закрыть">×</button></div>
            <div className="admin-form-grid">
              {field('Системный ID (slug)', speciesForm.slug, (v) => setSpeciesForm((s) => ({ ...s, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, '') })), { required: editingSpeciesID === null, disabled: editingSpeciesID !== null, placeholder: 'ino-sprout' })}
              {field('Название', speciesForm.name, (v) => setSpeciesForm((s) => ({ ...s, name: v })), { required: true })}
              <label className="field"><span className="field-label">Редкость иномекона</span><select value={speciesForm.rarity} onChange={(e) => setSpeciesForm((s) => ({ ...s, rarity: e.target.value as Rarity }))}>{RARITY_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              {field('Пассивный доход (золота/час)', speciesForm.passive_gold_per_hour, (v) => setSpeciesForm((s) => ({ ...s, passive_gold_per_hour: Number(v) })), { type: 'number', min: 0, max: 10000000, required: true })}
              <label className="field admin-field-wide"><span className="field-label">Описание</span><textarea value={speciesForm.description} onChange={(e) => setSpeciesForm((s) => ({ ...s, description: e.target.value }))} rows={3} maxLength={1000} /></label>
              <label className="field admin-field-wide"><span className="field-label">Изображение</span><input value={speciesForm.image_url} onChange={(e) => setSpeciesForm((s) => ({ ...s, image_url: e.target.value }))} placeholder="Ссылка или загрузка файла ниже" /><input className="admin-file-input" type="file" accept="image/png,image/jpeg,image/gif" disabled={imageBusy} onChange={(e) => { const file = e.target.files?.[0]; void uploadSpeciesImage(file); e.currentTarget.value = ''; }} /><small>{imageBusy ? 'Загружаем изображение…' : 'PNG, JPEG или GIF, до 5 МБ. Файл сохраняется на сервере.'}</small>{speciesForm.image_url && <img src={speciesForm.image_url} alt="Предпросмотр иномекона" className="admin-image-preview" />}</label>
            </div>
            <div className="admin-form-actions"><button type="button" className="button button--secondary" onClick={() => setSpeciesFormOpen(false)}>Отмена</button><button className="button button--primary" disabled={busy || imageBusy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button></div>
          </form>}
          <div className="admin-list">
            {species.map((item) => <article className={`surface admin-item ${!item.is_active ? 'admin-item--archived' : ''}`} key={item.id}>
              {item.image_url ? <img src={item.image_url} alt="" className="admin-item-image" /> : <div className="admin-item-image admin-item-image--empty">◇</div>}
              <div className="admin-item-content"><div className="admin-item-title"><h3>{item.name}</h3><span className={`admin-status ${item.is_active ? 'is-active' : ''}`}>{item.is_active ? 'Активен' : 'В архиве'}</span></div><p>{item.slug} · {RARITY_OPTIONS.find((r) => r.value === item.rarity)?.label ?? item.rarity}</p><small>{item.passive_gold_per_hour} золота/час</small>{item.description && <p>{item.description}</p>}</div>
              <div className="admin-item-actions"><button className="button button--secondary button--small" onClick={() => editSpecies(item)}>Изменить</button>{item.is_active && <button className="button button--ghost button--small" onClick={() => void archiveSpecies(item)} disabled={busy}>В архив</button>}</div>
            </article>)}
            {!species.length && <div className="surface admin-empty">Каталог пока пуст.</div>}
          </div>
        </>}

        {section === 'batches' && <>
          <div className="admin-section-heading"><div><h2>Пользовательские награды</h2><p>Создавай партии с любым количеством золота, своим названием и редкостью, а также с иномеконом из каталога.</p></div></div>
          <form className="surface admin-form" onSubmit={createBatch}>
            <div className="admin-form-heading"><h3>Создать партию кодов</h3></div>
            <div className="admin-form-grid">
              {field('Название партии', batchForm.label, (v) => setBatchForm((s) => ({ ...s, label: v })), { required: true, placeholder: 'Например, призы за викторину' })}
              {field('Количество кодов (1–500)', batchForm.count, (v) => setBatchForm((s) => ({ ...s, count: Number(v) })), { type: 'number', min: 1, max: 500, required: true })}
              {field('Название награды', batchForm.reward_name, (v) => setBatchForm((s) => ({ ...s, reward_name: v })), { required: true, maxLength: 80, placeholder: 'Например, Секретный набор' })}
              {field('Редкость награды (можно свою)', batchForm.reward_rarity, (v) => setBatchForm((s) => ({ ...s, reward_rarity: v })), { required: true, maxLength: 32, placeholder: 'Обычная, Секретная, Ивентовая…' })}
              {field('Золото в награде (0–100 000 000)', batchForm.reward_gold, (v) => setBatchForm((s) => ({ ...s, reward_gold: Number(v) })), { type: 'number', min: 0, max: 100000000, required: true })}
              <label className="field"><span className="field-label">Иномекон в награде (необязательно)</span><select value={batchForm.reward_creature_slug ?? ''} onChange={(e) => setBatchForm((s) => ({ ...s, reward_creature_slug: e.target.value }))}><option value="">Не выдавать иномекона</option>{species.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.slug}>{item.name} · {item.rarity}</option>)}</select></label>
              {field('Срок действия (дней, 0 = без срока)', batchForm.expires_in_days, (v) => setBatchForm((s) => ({ ...s, expires_in_days: Number(v) })), { type: 'number', min: 0, max: 365, required: true })}
            </div>
            <p className="admin-hint">Можно выдать только золото, только иномекона или оба вида награды. Редкость — настраиваемая подпись награды; редкость самого иномекона задаётся в каталоге.</p>
            <div className="admin-form-actions"><button className="button button--primary" disabled={busy}>{busy ? 'Создаём…' : 'Создать коды'}</button></div>
          </form>
          {createdBatch && <div className="surface admin-code-result"><div className="admin-form-heading"><div><h3>Новая партия: {createdBatch.label}</h3><p>{createdBatch.reward_name} · {createdBatch.reward_rarity} · {createdBatch.reward_gold} золота{createdBatch.reward_creature_slug ? ` + ${creatureName(species, createdBatch.reward_creature_slug)}` : ''}</p><p>Сохрани коды: они покажутся здесь сейчас, а потом будут доступны в истории.</p></div><button className="button button--secondary button--small" onClick={() => void copyCodes(createdBatch.codes.join('\n'))}>Копировать все</button></div><textarea readOnly rows={Math.min(12, Math.max(4, createdBatch.codes.length))} value={createdBatch.codes.join('\n')} /><p className="admin-hint">Создано кодов: {createdBatch.count}.</p></div>}
          {viewCodes && <div className="surface admin-code-result"><div className="admin-form-heading"><div><h3>Коды партии №{viewCodes.batch_id}</h3><p>Коды, которые уже были активированы, тоже остаются в списке.</p></div><button className="icon-button" onClick={() => setViewCodes(null)} aria-label="Закрыть">×</button></div><textarea readOnly rows={Math.min(12, Math.max(4, viewCodes.codes.length))} value={viewCodes.codes.map((item) => `${item.code ?? 'Исходный код не сохранён'}${item.redeemed_at ? ` — активирован ${prettyDate(item.redeemed_at)}` : ''}`).join('\n')} /><div className="admin-form-actions"><button className="button button--secondary button--small" onClick={() => void copyCodes(viewCodes.codes.map((item) => item.code ?? '').filter(Boolean).join('\n'))}>Копировать коды</button></div>{viewCodes.unavailable_count > 0 && <p className="admin-hint">У {viewCodes.unavailable_count} старых кодов нельзя восстановить исходный текст: до обновления в базе хранился только хеш. Новые коды сохраняются и будут доступны здесь.</p>}</div>}
          <div className="admin-list">{batches.map((item) => <article className="surface admin-batch" key={item.id}>
            <div className="admin-batch-top"><div><h3>{item.label}</h3><small>Партия №{item.id} · создана {prettyDate(item.created_at)}</small></div><span className={`admin-status ${item.revoked_at ? '' : 'is-active'}`}>{item.revoked_at ? 'Отозвана' : 'Активна'}</span></div>
            <p className="admin-reward-label"><strong>{item.reward_name || 'Награда'}</strong><span>{item.reward_rarity || 'Обычная'}</span></p>
            <div className="admin-batch-metrics"><span><strong>{item.code_count}</strong> кодов</span><span><strong>{item.redeemed_count}</strong> активировано</span><span><strong>{item.reward_gold}</strong> золота</span><span><strong>{creatureName(species, item.reward_creature_slug)}</strong></span><span>Срок: <strong>{prettyDate(item.expires_at)}</strong></span></div>
            <div className="admin-item-actions"><button className="button button--secondary button--small" onClick={() => void openCodes(item.id)} disabled={busy}>Показать коды</button>{!item.revoked_at && <button className="button button--ghost button--small" onClick={() => void revokeBatch(item)} disabled={busy}>Отозвать</button>}<button className="button button--ghost button--small" onClick={() => void deleteBatch(item)} disabled={busy || item.redeemed_count > 0}>Удалить</button></div>
          </article>)}{!batches.length && <div className="surface admin-empty">Партий пока нет.</div>}</div>
        </>}
      </>}
    </section>
  );
}
