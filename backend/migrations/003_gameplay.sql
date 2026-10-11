BEGIN;

ALTER TABLE players
    ADD COLUMN IF NOT EXISTS last_passive_claim_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS passive_gold_remainder NUMERIC(20,10) NOT NULL DEFAULT 0
        CHECK (passive_gold_remainder >= 0 AND passive_gold_remainder < 1);

-- Combat durations are measured in turns, not wall-clock seconds.
ALTER TABLE abilities RENAME COLUMN effect_duration_seconds TO effect_duration_turns;

CREATE TABLE game_battles (
    id BIGSERIAL PRIMARY KEY,
    challenger_telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE RESTRICT,
    opponent_telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE RESTRICT,
    challenger_creature_id BIGINT NOT NULL REFERENCES player_creatures(id) ON DELETE RESTRICT,
    opponent_creature_id BIGINT NOT NULL REFERENCES player_creatures(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','finished','declined','cancelled')),
    current_turn_telegram_id BIGINT REFERENCES players(telegram_id) ON DELETE RESTRICT,
    winner_telegram_id BIGINT REFERENCES players(telegram_id) ON DELETE RESTRICT,
    challenger_snapshot JSONB NOT NULL,
    opponent_snapshot JSONB NOT NULL,
    combat_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    CHECK (challenger_telegram_id <> opponent_telegram_id),
    CHECK (challenger_creature_id <> opponent_creature_id)
);

CREATE INDEX game_battles_challenger_status_idx ON game_battles(challenger_telegram_id, status, updated_at DESC);
CREATE INDEX game_battles_opponent_status_idx ON game_battles(opponent_telegram_id, status, updated_at DESC);
CREATE INDEX game_battles_status_updated_idx ON game_battles(status, updated_at DESC);

COMMIT;
