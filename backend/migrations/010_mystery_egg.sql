-- Configurable mystery egg: one egg can hatch any active creature rarity according to admin-defined odds.
BEGIN;

ALTER TABLE public.shop_egg_catalog
    DROP CONSTRAINT IF EXISTS shop_egg_catalog_rarity_check;
ALTER TABLE public.shop_egg_catalog
    ADD CONSTRAINT shop_egg_catalog_rarity_check
    CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'mythic', 'mystery'));

ALTER TABLE public.player_eggs
    DROP CONSTRAINT IF EXISTS player_eggs_rarity_check;
ALTER TABLE public.player_eggs
    ADD CONSTRAINT player_eggs_rarity_check
    CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'mythic', 'mystery'));

INSERT INTO public.shop_egg_catalog
    (rarity, label, price_gold, image_url, description, is_active)
VALUES
    ('mystery', 'Загадочное яйцо', 1800, '', 'Содержит иномекона любой редкости. Мифические находки очень редкие.', TRUE)
ON CONFLICT (rarity) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.shop_mystery_egg_odds (
    rarity TEXT PRIMARY KEY CHECK (rarity IN ('common', 'rare', 'epic', 'legendary', 'mythic')),
    chance_percent INTEGER NOT NULL CHECK (chance_percent BETWEEN 0 AND 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.shop_mystery_egg_odds (rarity, chance_percent) VALUES
    ('common', 60),
    ('rare', 25),
    ('epic', 10),
    ('legendary', 4),
    ('mythic', 1)
ON CONFLICT (rarity) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.shop_egg_catalog,
    public.shop_mystery_egg_odds,
    public.player_eggs,
    public.creature_species,
    public.player_creatures,
    public.player_discovered_species,
    public.wallet_transactions,
    public.players
TO inomecops;

COMMIT;
