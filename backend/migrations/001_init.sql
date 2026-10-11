BEGIN;

CREATE TABLE IF NOT EXISTS players (
    telegram_id BIGINT PRIMARY KEY CHECK (telegram_id > 0),
    username TEXT,
    first_name TEXT NOT NULL DEFAULT '',
    gold BIGINT NOT NULL DEFAULT 0 CHECK (gold >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS code_batches (
    id BIGSERIAL PRIMARY KEY,
    label TEXT NOT NULL CHECK (char_length(label) BETWEEN 1 AND 100),
    reward_gold BIGINT NOT NULL DEFAULT 0 CHECK (reward_gold >= 0),
    reward_creature_slug TEXT,
    created_by BIGINT NOT NULL CHECK (created_by > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    CHECK (reward_gold > 0 OR reward_creature_slug IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS promo_codes (
    id BIGSERIAL PRIMARY KEY,
    batch_id BIGINT NOT NULL REFERENCES code_batches(id) ON DELETE RESTRICT,
    code_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(code_hash) = 32),
    redeemed_by BIGINT REFERENCES players(telegram_id) ON DELETE RESTRICT,
    redeemed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((redeemed_by IS NULL) = (redeemed_at IS NULL))
);

CREATE TABLE IF NOT EXISTS player_creatures (
    id BIGSERIAL PRIMARY KEY,
    owner_telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE RESTRICT,
    species_slug TEXT NOT NULL,
    source_code_id BIGINT NOT NULL UNIQUE REFERENCES promo_codes(id) ON DELETE RESTRICT,
    obtained_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
    id BIGSERIAL PRIMARY KEY,
    player_telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE RESTRICT,
    delta_gold BIGINT NOT NULL CHECK (delta_gold <> 0),
    transaction_type TEXT NOT NULL CHECK (
        transaction_type IN ('code_reward', 'passive_income', 'game_win', 'game_loss', 'admin_adjustment')
    ),
    promo_code_id BIGINT UNIQUE REFERENCES promo_codes(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_batch_id ON promo_codes(batch_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_redeemed_by ON promo_codes(redeemed_by);
CREATE INDEX IF NOT EXISTS idx_player_creatures_owner ON player_creatures(owner_telegram_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_player_created ON wallet_transactions(player_telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_code_batches_created_at ON code_batches(created_at DESC);

COMMIT;
