package codes

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var ErrInvalidCode = errors.New("invalid, expired, revoked, or already redeemed code")

type PostgresRepository struct {
	db *sql.DB
}

func NewPostgresRepository(db *sql.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) Redeem(ctx context.Context, telegramID int64, codeHash []byte) (RedeemResult, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return RedeemResult{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var result RedeemResult
	var creature sql.NullString
	var redeemedAt time.Time
	err = tx.QueryRowContext(ctx, `
		UPDATE promo_codes AS c
		SET redeemed_by = $1, redeemed_at = now()
		FROM code_batches AS b
		WHERE c.code_hash = $2
		  AND c.batch_id = b.id
		  AND c.redeemed_by IS NULL
		  AND c.revoked_at IS NULL
		  AND b.revoked_at IS NULL
		  AND (b.expires_at IS NULL OR b.expires_at > now())
		RETURNING c.id, b.reward_gold, b.reward_creature_slug, c.redeemed_at
	`, telegramID, codeHash).Scan(&result.CodeID, &result.GoldAdded, &creature, &redeemedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return RedeemResult{}, ErrInvalidCode
	}
	if err != nil {
		return RedeemResult{}, err
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE players SET gold = gold + $2, updated_at = now() WHERE telegram_id = $1
	`, telegramID, result.GoldAdded); err != nil {
		return RedeemResult{}, err
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type, promo_code_id)
		VALUES ($1, $2, 'code_reward', $3)
	`, telegramID, result.GoldAdded, result.CodeID); err != nil {
		return RedeemResult{}, err
	}

	if creature.Valid && creature.String != "" {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO player_creatures (owner_telegram_id, species_slug, source_code_id)
			VALUES ($1, $2, $3)
		`, telegramID, creature.String, result.CodeID); err != nil {
			return RedeemResult{}, err
		}
		result.CreatureSlug = creature.String
	}

	if err := tx.QueryRowContext(ctx, `SELECT gold FROM players WHERE telegram_id = $1`, telegramID).Scan(&result.GoldBalance); err != nil {
		return RedeemResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return RedeemResult{}, err
	}
	result.RedeemedAt = redeemedAt
	return result, nil
}

func (r *PostgresRepository) ListCreatures(ctx context.Context, telegramID int64) ([]OwnedCreature, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, species_slug, obtained_at
		FROM player_creatures
		WHERE owner_telegram_id = $1
		ORDER BY obtained_at DESC, id DESC
	`, telegramID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	creatures := make([]OwnedCreature, 0)
	for rows.Next() {
		var item OwnedCreature
		if err := rows.Scan(&item.ID, &item.SpeciesSlug, &item.ObtainedAt); err != nil {
			return nil, err
		}
		creatures = append(creatures, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return creatures, nil
}
