-- Configurable egg products, one featured species for slot rewards, and a one-time
-- server-verified Telegram subscription reward.
BEGIN;

ALTER TABLE public.creature_species
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS uq_creature_species_single_featured
    ON public.creature_species (is_featured)
    WHERE is_featured = TRUE;

CREATE TABLE IF NOT EXISTS public.shop_egg_catalog (
    rarity TEXT PRIMARY KEY CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'mythic')),
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
    price_gold BIGINT NOT NULL CHECK (price_gold BETWEEN 1 AND 100000000),
    image_url TEXT NOT NULL DEFAULT '' CHECK (char_length(image_url) <= 500),
    description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.shop_egg_catalog (rarity, label, price_gold, description)
VALUES
    ('common', 'Обычное яйцо', 250, 'Простое яйцо с обычным иномеконом.'),
    ('rare', 'Редкое яйцо', 1000, 'Яйцо с шансом получить редкого иномекона.'),
    ('epic', 'Эпическое яйцо', 2500, 'Яйцо с эпическим иномеконом.'),
    ('legendary', 'Легендарное яйцо', 7500, 'Яйцо с легендарным иномеконом.'),
    ('mythic', 'Мифическое яйцо', 15000, 'Яйцо с мифическим иномеконом.')
ON CONFLICT (rarity) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.subscription_claims (
    player_telegram_id BIGINT PRIMARY KEY REFERENCES public.players(telegram_id) ON DELETE RESTRICT,
    reward_gold BIGINT NOT NULL DEFAULT 0 CHECK (reward_gold >= 0),
    reward_creature_slug TEXT,
    claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (reward_gold > 0 OR reward_creature_slug IS NOT NULL)
);

ALTER TABLE public.wallet_transactions
    DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_transaction_type_check
    CHECK (transaction_type IN (
        'code_reward', 'passive_income', 'game_win', 'game_loss', 'admin_adjustment',
        'slot_bet', 'slot_win', 'egg_purchase', 'creature_sale', 'subscription_reward'
    ));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.shop_egg_catalog,
    public.subscription_claims,
    public.creature_species,
    public.player_creatures,
    public.player_discovered_species,
    public.players,
    public.wallet_transactions,
    public.player_eggs,
    public.code_batches,
    public.promo_codes
TO inomecops;
GRANT USAGE, SELECT ON SEQUENCE
    public.player_creatures_id_seq,
    public.wallet_transactions_id_seq,
    public.player_eggs_id_seq
TO inomecops;

COMMIT;
