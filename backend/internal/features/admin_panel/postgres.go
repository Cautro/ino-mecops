package admin_panel

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var ErrBatchNotFound = errors.New("batch not found or already revoked")
var ErrBatchHasRedemptions = errors.New("batch has redeemed codes")

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

	if len(batch.CodeHashes) != len(batch.CodeValues) {
		return 0, errors.New("code hashes and values count mismatch")
	}
	stmt, err := tx.PrepareContext(ctx, `INSERT INTO promo_codes (batch_id, code_hash, code_value) VALUES ($1, $2, $3)`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()
	for index, hash := range batch.CodeHashes {
		if len(hash) != 32 {
			return 0, errors.New("invalid code hash length")
		}
		if _, err := stmt.ExecContext(ctx, id, hash, batch.CodeValues[index]); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return id, nil
}

func (r *PostgresRepository) ListBatchCodes(ctx context.Context, batchID int64) ([]BatchCode, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT code_value, redeemed_at
		FROM promo_codes
		WHERE batch_id = $1
		ORDER BY id
	`, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	codes := make([]BatchCode, 0)
	for rows.Next() {
		var code sql.NullString
		var redeemedAt sql.NullTime
		if err := rows.Scan(&code, &redeemedAt); err != nil {
			return nil, err
		}
		item := BatchCode{}
		if code.Valid {
			item.Code = code.String
		}
		if redeemedAt.Valid {
			t := redeemedAt.Time
			item.RedeemedAt = &t
		}
		codes = append(codes, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(codes) == 0 {
		return nil, ErrBatchNotFound
	}
	return codes, nil
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

func (r *PostgresRepository) DeleteBatch(ctx context.Context, id int64) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var batchID int64
	if err := tx.QueryRowContext(ctx, `SELECT id FROM code_batches WHERE id = $1 FOR UPDATE`, id).Scan(&batchID); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrBatchNotFound
		}
		return err
	}
	var hasRedemptions bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM promo_codes WHERE batch_id = $1 AND redeemed_at IS NOT NULL)`, id).Scan(&hasRedemptions); err != nil {
		return err
	}
	if hasRedemptions {
		return ErrBatchHasRedemptions
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM promo_codes WHERE batch_id = $1`, id); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM code_batches WHERE id = $1`, id); err != nil {
		return err
	}
	return tx.Commit()
}
