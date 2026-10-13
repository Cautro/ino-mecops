BEGIN;

-- A spin can now stake either gold or one owned creature. Gold spins keep their
-- existing numeric bet; creature spins leave bet_amount NULL and record a snapshot.
ALTER TABLE public.slot_spins
    ALTER COLUMN bet_amount DROP NOT NULL;

ALTER TABLE public.slot_spins
    DROP CONSTRAINT IF EXISTS slot_spins_bet_amount_check;
ALTER TABLE public.slot_spins
    ADD CONSTRAINT slot_spins_bet_amount_check
    CHECK (bet_amount IS NULL OR bet_amount BETWEEN 10 AND 10000);

ALTER TABLE public.slot_spins
    ADD COLUMN IF NOT EXISTS bet_type TEXT NOT NULL DEFAULT 'gold',
    ADD COLUMN IF NOT EXISTS bet_creature_id BIGINT,
    ADD COLUMN IF NOT EXISTS bet_creature_slug TEXT,
    ADD COLUMN IF NOT EXISTS creature_stake_lost BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'slot_spins_bet_type_check'
          AND conrelid = 'public.slot_spins'::regclass
    ) THEN
        ALTER TABLE public.slot_spins
            ADD CONSTRAINT slot_spins_bet_type_check
            CHECK (bet_type IN ('gold', 'creature'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'slot_spins_bet_type_amount_check'
          AND conrelid = 'public.slot_spins'::regclass
    ) THEN
        ALTER TABLE public.slot_spins
            ADD CONSTRAINT slot_spins_bet_type_amount_check
            CHECK (
                (bet_type = 'gold' AND bet_amount IS NOT NULL)
                OR (bet_type = 'creature' AND bet_amount IS NULL)
            );
    END IF;
END $$;

-- These tables are accessed by the application role. In particular, creature
-- stakes require DELETE on player_creatures when a spin misses.
GRANT SELECT, INSERT, DELETE ON TABLE public.player_creatures TO inomecops;
GRANT USAGE, SELECT ON SEQUENCE public.player_creatures_id_seq TO inomecops;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.slot_spins TO inomecops;
GRANT USAGE, SELECT ON SEQUENCE public.slot_spins_id_seq TO inomecops;

COMMIT;
