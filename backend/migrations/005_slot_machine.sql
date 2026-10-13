BEGIN;

-- Slot-machine jackpots award creatures without requiring a promo code.
ALTER TABLE player_creatures ALTER COLUMN source_code_id DROP NOT NULL;

-- Keep every debit and payout in the existing server-side wallet ledger.
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_transaction_type_check;
ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transactions_transaction_type_check
    CHECK (transaction_type IN (
        'code_reward', 'passive_income', 'game_win', 'game_loss', 'admin_adjustment', 'slot_bet', 'slot_win'
    ));

-- The old arena data is not used by the new game loop.
DROP TABLE IF EXISTS game_battles;

CREATE TABLE IF NOT EXISTS slot_spins (
    id BIGSERIAL PRIMARY KEY,
    player_telegram_id BIGINT NOT NULL REFERENCES players(telegram_id) ON DELETE RESTRICT,
    bet_amount BIGINT NOT NULL CHECK (bet_amount BETWEEN 10 AND 10000),
    payout_amount BIGINT NOT NULL DEFAULT 0 CHECK (payout_amount >= 0),
    symbols TEXT NOT NULL CHECK (char_length(symbols) > 0),
    reward_creature_slug TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slot_spins_player_created
    ON slot_spins(player_telegram_id, created_at DESC);

COMMIT;
