package admin_panel

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var ErrBatchNotFound = errors.New("batch not found or already revoked")

type PostgresRepository struct {
	db *sql.DB
}

func NewPostgresRepository(db *sql.DB) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) CreateBatch(ctx context.Context, batch NewBatch) (int64, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	var creature any
	if batch.RewardCreatureSlug != "" {
		creature = batch.RewardCreatureSlug
	}
	var id int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO code_batches (label, reward_gold, reward_creature_slug, created_by, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, batch.Label, batch.RewardGold, creature, batch.CreatedBy, batch.ExpiresAt).Scan(&id)
	if err != nil {
		return 0, err
	}

	stmt, err := tx.PrepareContext(ctx, `INSERT INTO promo_codes (batch_id, code_hash) VALUES ($1, $2)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()
	for _, hash := range batch.CodeHashes {
		if len(hash) != 32 {
			return 0, errors.New("invalid code hash length")
		}
		if _, err := stmt.ExecContext(ctx, id, hash); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return id, nil
}

func (r *PostgresRepository) ListBatches(ctx context.Context, limit, offset int) ([]BatchSummary, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT b.id, b.label, b.reward_gold, b.reward_creature_slug, b.created_by,
		       b.created_at, b.expires_at, b.revoked_at,
		       COUNT(c.id) AS code_count,
		       COUNT(c.redeemed_at) AS redeemed_count
		FROM code_batches b
		LEFT JOIN promo_codes c ON c.batch_id = b.id
		GROUP BY b.id
		ORDER BY b.created_at DESC, b.id DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	batches := make([]BatchSummary, 0)
	for rows.Next() {
		var batch BatchSummary
		var creature sql.NullString
		var expiresAt, revokedAt sql.NullTime
		if err := rows.Scan(
			&batch.ID, &batch.Label, &batch.RewardGold, &creature, &batch.CreatedBy,
			&batch.CreatedAt, &expiresAt, &revokedAt, &batch.CodeCount, &batch.RedeemedCount,
		); err != nil {
			return nil, err
		}
		if creature.Valid {
			batch.RewardCreatureSlug = creature.String
		}
		if expiresAt.Valid {
			t := expiresAt.Time
			batch.ExpiresAt = &t
		}
		if revokedAt.Valid {
			t := revokedAt.Time
			batch.RevokedAt = &t
		}
		batches = append(batches, batch)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return batches, nil
}

func (r *PostgresRepository) RevokeBatch(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `
		UPDATE code_batches SET revoked_at = $2
		WHERE id = $1 AND revoked_at IS NULL
	`, id, time.Now().UTC())
	if err != nil {
		return err
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return ErrBatchNotFound
	}
	return nil
}
