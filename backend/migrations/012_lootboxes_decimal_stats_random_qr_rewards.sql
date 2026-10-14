-- Replace wager-based slot/egg UX with guaranteed collection containers,
-- store cumulative container spend, support decimal creature stats and per-code random rewards.
BEGIN;

-- Decimal balance-adjacent creature stats and configurable fractional bonuses.
ALTER TABLE public.creature_species
    DROP CONSTRAINT IF EXISTS creature_species_passive_gold_per_hour_check,
    DROP CONSTRAINT IF EXISTS creature_species_health_check,
    DROP CONSTRAINT IF EXISTS creature_species_damage_check,
    DROP CONSTRAINT IF EXISTS creature_species_crit_chance_check,
    DROP CONSTRAINT IF EXISTS creature_species_main_bonus_multiplier_check,
    DROP CONSTRAINT IF EXISTS creature_species_main_bonus_type_check;
ALTER TABLE public.creature_species
    ALTER COLUMN passive_gold_per_hour TYPE NUMERIC(14,4) USING passive_gold_per_hour::numeric,
    ALTER COLUMN health TYPE NUMERIC(12,3) USING health::numeric,
    ALTER COLUMN damage TYPE NUMERIC(12,3) USING damage::numeric,
    ALTER COLUMN crit_chance TYPE NUMERIC(7,3) USING crit_chance::numeric,
    ALTER COLUMN main_bonus_multiplier TYPE NUMERIC(8,3) USING main_bonus_multiplier::numeric;
UPDATE public.creature_species SET main_bonus_type = CASE main_bonus_type
    WHEN 'slot_chance' THEN 'lootbox_chance'
    WHEN 'slot_payout' THEN 'lootbox_gold'
    ELSE main_bonus_type END;
ALTER TABLE public.creature_species
    ADD CONSTRAINT creature_species_passive_gold_per_hour_check CHECK (passive_gold_per_hour BETWEEN 0 AND 10000000),
    ADD CONSTRAINT creature_species_health_check CHECK (health BETWEEN 1 AND 1000000),
    ADD CONSTRAINT creature_species_damage_check CHECK (damage BETWEEN 0 AND 1000000),
    ADD CONSTRAINT creature_species_crit_chance_check CHECK (crit_chance BETWEEN 0 AND 100),
    ADD CONSTRAINT creature_species_main_bonus_type_check CHECK (main_bonus_type IN ('none', 'lootbox_chance', 'lootbox_gold', 'passive_income')),
    ADD CONSTRAINT creature_species_main_bonus_multiplier_check CHECK (main_bonus_multiplier BETWEEN 1 AND 10);

-- Keep inventory rows, but convert legacy fixed-rarity entries to the single container type.
-- Drop the old rarity check before the conversion so the migration also tolerates older schemas.
ALTER TABLE public.player_eggs DROP CONSTRAINT IF EXISTS player_eggs_rarity_check;
UPDATE public.player_eggs SET rarity='mystery' WHERE rarity <> 'mystery';
UPDATE public.shop_egg_catalog SET is_active=FALSE WHERE rarity <> 'mystery';
UPDATE public.shop_egg_catalog SET label='Коллекционный контейнер', description='Гарантированно содержит иномекона. Вероятности редкостей показаны до открытия.', is_active=TRUE WHERE rarity='mystery';

-- Cumulative gold spent on containers never decreases when future rewards are received.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS lootbox_gold_spent_total BIGINT NOT NULL DEFAULT 0;
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_lootbox_gold_spent_total_check;
ALTER TABLE public.players ADD CONSTRAINT players_lootbox_gold_spent_total_check CHECK (lootbox_gold_spent_total >= 0);
UPDATE public.players p SET lootbox_gold_spent_total = COALESCE((
    SELECT SUM(-wt.delta_gold)
    FROM public.wallet_transactions wt
    WHERE wt.player_telegram_id = p.telegram_id
      AND wt.delta_gold < 0
      AND wt.transaction_type IN ('egg_purchase', 'lootbox_purchase')
), 0) WHERE p.lootbox_gold_spent_total = 0;

-- Keep one shared catalog row for the single collection container, rather than rarity-specific eggs.
ALTER TABLE public.shop_egg_catalog DROP CONSTRAINT IF EXISTS shop_egg_catalog_rarity_check;
-- Delete legacy fixed-rarity products before adding the single-container constraint.
DELETE FROM public.shop_egg_catalog WHERE rarity <> 'mystery';
ALTER TABLE public.shop_egg_catalog ADD CONSTRAINT shop_egg_catalog_rarity_check CHECK (rarity='mystery');
ALTER TABLE public.player_eggs ADD CONSTRAINT player_eggs_rarity_check CHECK (rarity='mystery');
INSERT INTO public.shop_egg_catalog (rarity, label, price_gold, image_url, description, is_active)
VALUES ('mystery', 'Коллекционный контейнер', 1800, '', 'Гарантированно выдаёт иномекона. Вероятности редкостей видны до открытия.', TRUE)
ON CONFLICT (rarity) DO UPDATE SET label=EXCLUDED.label, description=EXCLUDED.description, is_active=TRUE;

-- Per-code randomized reward configuration and resolved reward snapshot.
ALTER TABLE public.code_batches
    ADD COLUMN IF NOT EXISTS reward_mode TEXT NOT NULL DEFAULT 'fixed',
    ADD COLUMN IF NOT EXISTS reward_gold_min BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reward_gold_max BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reward_creature_rarities JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.code_batches SET reward_gold_min=reward_gold, reward_gold_max=reward_gold WHERE reward_mode='fixed';
ALTER TABLE public.code_batches DROP CONSTRAINT IF EXISTS code_batches_reward_mode_check;
ALTER TABLE public.code_batches ADD CONSTRAINT code_batches_reward_mode_check CHECK (reward_mode IN ('fixed','random'));
ALTER TABLE public.code_batches DROP CONSTRAINT IF EXISTS code_batches_check;
ALTER TABLE public.code_batches DROP CONSTRAINT IF EXISTS code_batches_reward_source_check;
ALTER TABLE public.code_batches ADD CONSTRAINT code_batches_reward_source_check CHECK (reward_mode='random' OR reward_gold > 0 OR reward_creature_slug IS NOT NULL);
ALTER TABLE public.code_batches DROP CONSTRAINT IF EXISTS code_batches_reward_gold_min_check;
ALTER TABLE public.code_batches ADD CONSTRAINT code_batches_reward_gold_min_check CHECK (reward_gold_min BETWEEN 0 AND 100000000);
ALTER TABLE public.code_batches DROP CONSTRAINT IF EXISTS code_batches_reward_gold_max_check;
ALTER TABLE public.code_batches ADD CONSTRAINT code_batches_reward_gold_max_check CHECK (reward_gold_max BETWEEN reward_gold_min AND 100000000);
ALTER TABLE public.code_batches DROP CONSTRAINT IF EXISTS code_batches_reward_creature_rarities_check;
ALTER TABLE public.code_batches ADD CONSTRAINT code_batches_reward_creature_rarities_check CHECK (jsonb_typeof(reward_creature_rarities)='array');

ALTER TABLE public.promo_codes
    ADD COLUMN IF NOT EXISTS reward_gold BIGINT,
    ADD COLUMN IF NOT EXISTS reward_creature_slug TEXT,
    ADD COLUMN IF NOT EXISTS reward_name TEXT,
    ADD COLUMN IF NOT EXISTS reward_rarity TEXT;
UPDATE public.promo_codes c SET
    reward_gold=COALESCE(c.reward_gold,b.reward_gold),
    reward_creature_slug=COALESCE(c.reward_creature_slug,b.reward_creature_slug),
    reward_name=COALESCE(c.reward_name,b.reward_name),
    reward_rarity=COALESCE(c.reward_rarity,b.reward_rarity)
FROM public.code_batches b WHERE b.id=c.batch_id;
ALTER TABLE public.promo_codes DROP CONSTRAINT IF EXISTS promo_codes_reward_gold_check;
ALTER TABLE public.promo_codes ADD CONSTRAINT promo_codes_reward_gold_check CHECK (reward_gold IS NULL OR reward_gold BETWEEN 0 AND 100000000);

-- Auditable opening snapshots for monitoring and support diagnostics.
CREATE TABLE IF NOT EXISTS public.lootbox_open_events (
    id BIGSERIAL PRIMARY KEY,
    player_telegram_id BIGINT NOT NULL REFERENCES public.players(telegram_id) ON DELETE RESTRICT,
    species_slug TEXT NOT NULL,
    result_rarity TEXT NOT NULL CHECK (result_rarity IN ('common','rare','epic','legendary','mythic')),
    container_price_gold BIGINT NOT NULL CHECK (container_price_gold >= 0),
    bonus_gold BIGINT NOT NULL DEFAULT 0 CHECK (bonus_gold >= 0),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lootbox_open_events_opened_at ON public.lootbox_open_events(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_lootbox_open_events_player ON public.lootbox_open_events(player_telegram_id, opened_at DESC);

-- Add non-wager accounting types while leaving historical entries readable.
ALTER TABLE public.wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check CHECK (transaction_type IN (
    'code_reward','passive_income','game_win','game_loss','admin_adjustment',
    'slot_bet','slot_win','egg_purchase','creature_sale','subscription_reward',
    'lootbox_purchase','lootbox_gold_bonus'
));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.players, public.creature_species, public.player_creatures,
    public.player_discovered_species, public.player_eggs, public.shop_egg_catalog,
    public.shop_mystery_egg_odds, public.wallet_transactions, public.code_batches,
    public.promo_codes, public.lootbox_open_events
TO inomecops;
GRANT USAGE, SELECT ON SEQUENCE public.lootbox_open_events_id_seq TO inomecops;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO inomecops;

COMMIT;
