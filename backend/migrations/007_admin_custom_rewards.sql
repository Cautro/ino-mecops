-- Custom reward fields for promo-code batches and application DB permissions.
-- Run once against the same database configured for the backend service.
BEGIN;

ALTER TABLE public.promo_codes
    ADD COLUMN IF NOT EXISTS code_value TEXT;

ALTER TABLE public.code_batches
    ADD COLUMN IF NOT EXISTS reward_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.code_batches
    ADD COLUMN IF NOT EXISTS reward_rarity TEXT NOT NULL DEFAULT 'Обычная';

UPDATE public.code_batches
SET reward_name = CASE
    WHEN reward_creature_slug IS NOT NULL AND reward_gold > 0 THEN 'Набор: золото и иномекон'
    WHEN reward_creature_slug IS NOT NULL THEN 'Иномекон'
    ELSE 'Золотой запас'
END
WHERE reward_name = '';

-- The service DB role is named inomecops on the current deployment. Previous
-- migrations may have been run by postgres, leaving the application without
-- permissions on newly-created tables and sequences.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.code_batches,
    public.promo_codes,
    public.players,
    public.player_creatures,
    public.wallet_transactions,
    public.slot_spins,
    public.creature_species,
    public.abilities
TO inomecops;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO inomecops;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO inomecops;

COMMIT;
