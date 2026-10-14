-- Per-player main creature slot, configurable bonuses and public leaderboards.
BEGIN;

ALTER TABLE public.creature_species
    ADD COLUMN IF NOT EXISTS main_bonus_type TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS main_bonus_multiplier INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'creature_species_main_bonus_type_check'
          AND conrelid = 'public.creature_species'::regclass
    ) THEN
        ALTER TABLE public.creature_species
            ADD CONSTRAINT creature_species_main_bonus_type_check
            CHECK (main_bonus_type IN ('none', 'slot_chance', 'slot_payout', 'passive_income'));
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'creature_species_main_bonus_multiplier_check'
          AND conrelid = 'public.creature_species'::regclass
    ) THEN
        ALTER TABLE public.creature_species
            ADD CONSTRAINT creature_species_main_bonus_multiplier_check
            CHECK (main_bonus_multiplier BETWEEN 1 AND 10);
    END IF;
END $$;

-- The previous global is_featured setting is obsolete: the main creature belongs
-- to each player and is selected from their actual inventory.
UPDATE public.creature_species SET is_featured = FALSE WHERE is_featured = TRUE;

CREATE TABLE IF NOT EXISTS public.player_main_slots (
    player_telegram_id BIGINT PRIMARY KEY
        REFERENCES public.players(telegram_id) ON DELETE CASCADE,
    player_creature_id BIGINT NOT NULL UNIQUE
        REFERENCES public.player_creatures(id) ON DELETE CASCADE,
    selected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_player_main_slots_creature_id
    ON public.player_main_slots(player_creature_id);
CREATE INDEX IF NOT EXISTS idx_slot_spins_type_created
    ON public.slot_spins(bet_type, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    public.player_main_slots,
    public.creature_species,
    public.player_creatures,
    public.players,
    public.slot_spins
TO inomecops;

COMMIT;
