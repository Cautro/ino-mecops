BEGIN;

-- Players hidden by an administrator disappear from other viewers' leaderboards,
-- but remain visible in their own view because leaderboard queries are viewer-aware.
CREATE TABLE IF NOT EXISTS public.leaderboard_hidden_players (
    player_telegram_id BIGINT PRIMARY KEY REFERENCES public.players(telegram_id) ON DELETE CASCADE,
    hidden_by_telegram_id BIGINT NOT NULL REFERENCES public.players(telegram_id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_hidden_by ON public.leaderboard_hidden_players(hidden_by_telegram_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leaderboard_hidden_players TO inomecops;

COMMIT;
