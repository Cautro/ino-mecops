-- Shop: rarity-based eggs, creature buyback prices and persistent discovery.
BEGIN;

ALTER TABLE public.creature_species
    ADD COLUMN IF NOT EXISTS sell_price_gold BIGINT NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'creature_species_sell_price_gold_check'
          AND conrelid = 'public.creature_species'::regclass
    ) THEN
        ALTER TABLE public.creature_species
            ADD CONSTRAINT creature_species_sell_price_gold_check
            CHECK (sell_price_gold BETWEEN 0 AND 1000000000);
    END IF;
END $$;

-- Eggs and slot wins must be able to grant creatures without a promo-code ID.
ALTER TABLE public.player_creatures
    ALTER COLUMN source_code_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.player_eggs (
    id BIGSERIAL PRIMARY KEY,
    owner_telegram_id BIGINT NOT NULL REFERENCES public.players(telegram_id) ON DELETE RESTRICT,
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'mythic')),
    price_gold BIGINT NOT NULL CHECK (price_gold > 0),
    purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_player_eggs_owner_purchased
    ON public.player_eggs(owner_telegram_id, purchased_at DESC, id DESC);

-- Discovery persists after selling the last copy of a species.
CREATE TABLE IF NOT EXISTS public.player_discovered_species (
    player_telegram_id BIGINT NOT NULL REFERENCES public.players(telegram_id) ON DELETE RESTRICT,
    species_slug TEXT NOT NULL REFERENCES public.creature_species(slug) ON DELETE RESTRICT,
    discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (player_telegram_id, species_slug)
);
INSERT INTO public.player_discovered_species (player_telegram_id, species_slug)
SELECT DISTINCT discovery.player_telegram_id, discovery.species_slug
FROM (
    SELECT owner_telegram_id AS player_telegram_id, species_slug
    FROM public.player_creatures
    UNION
    SELECT player_telegram_id, reward_creature_slug AS species_slug
    FROM public.slot_spins
    WHERE reward_creature_slug IS NOT NULL
    UNION
    SELECT player_telegram_id, bet_creature_slug AS species_slug
    FROM public.slot_spins
    WHERE bet_type = 'creature' AND bet_creature_slug IS NOT NULL
    UNION
    SELECT c.redeemed_by AS player_telegram_id, b.reward_creature_slug AS species_slug
    FROM public.promo_codes c
    JOIN public.code_batches b ON b.id = c.batch_id
    WHERE c.redeemed_by IS NOT NULL AND b.reward_creature_slug IS NOT NULL
) AS discovery
JOIN public.players p ON p.telegram_id = discovery.player_telegram_id
JOIN public.creature_species s ON s.slug = discovery.species_slug
ON CONFLICT DO NOTHING;

-- Keep the server-side wallet ledger compatible with existing slot transactions.
ALTER TABLE public.wallet_transactions
    DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_transaction_type_check
    CHECK (transaction_type IN (
        'code_reward', 'passive_income', 'game_win', 'game_loss', 'admin_adjustment',
        'slot_bet', 'slot_win', 'egg_purchase', 'creature_sale'
    ));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.player_eggs,
    public.player_discovered_species,
    public.creature_species,
    public.player_creatures,
    public.wallet_transactions,
    public.players
TO inomecops;
GRANT USAGE, SELECT ON SEQUENCE
    public.player_eggs_id_seq
TO inomecops;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO inomecops;

COMMIT;
