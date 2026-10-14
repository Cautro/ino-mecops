package admin_panel

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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
	if batch.RewardMode == "" {
		batch.RewardMode = "fixed"
	}
	rarityJSON, err := json.Marshal(batch.RewardCreatureRarities)
	if err != nil {
		return 0, err
	}
	goldMin, goldMax := batch.RewardGoldMin, batch.RewardGoldMax
	if batch.RewardMode == "fixed" {
		goldMin, goldMax = batch.RewardGold, batch.RewardGold
	}
	var id int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO code_batches
		(label,reward_gold,reward_creature_slug,reward_name,reward_rarity,created_by,expires_at,reward_mode,reward_gold_min,reward_gold_max,reward_creature_rarities)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING id
	`, batch.Label, batch.RewardGold, creature, batch.RewardName, batch.RewardRarity, batch.CreatedBy, batch.ExpiresAt,
		batch.RewardMode, goldMin, goldMax, string(rarityJSON)).Scan(&id)
	if err != nil {
		return 0, err
	}
	if len(batch.CodeHashes) != len(batch.CodeValues) || len(batch.CodeHashes) != len(batch.CodeRewards) {
		return 0, errors.New("code hashes, values and rewards count mismatch")
	}
	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO promo_codes (batch_id,code_hash,code_value,reward_gold,reward_creature_slug,reward_name,reward_rarity)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
	`)
	if err != nil {
		return 0, err
	}
	defer stmt.Close()
	for index, hash := range batch.CodeHashes {
		if len(hash) != 32 {
			return 0, errors.New("invalid code hash length")
		}
		reward := batch.CodeRewards[index]
		var rewardCreature any
		if reward.CreatureSlug != "" {
			rewardCreature = reward.CreatureSlug
		}
		if _, err := stmt.ExecContext(ctx, id, hash, batch.CodeValues[index], reward.Gold, rewardCreature, reward.Name, reward.Rarity); err != nil {
			return 0, err
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return id, nil
}

func (r *PostgresRepository) ActiveSpeciesExists(ctx context.Context, slug string) (bool, error) {
	var exists bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM creature_species WHERE slug = $1 AND is_active = TRUE)`, slug).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) ActiveSpeciesByRarities(ctx context.Context, rarities []string) ([]ActiveSpeciesOption, error) {
	if len(rarities) == 0 {
		return []ActiveSpeciesOption{}, nil
	}
	placeholders := make([]string, len(rarities))
	args := make([]any, len(rarities))
	for i, rarity := range rarities {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = rarity
	}
	query := `SELECT slug,name,rarity FROM creature_species WHERE is_active=TRUE AND rarity IN (` + strings.Join(placeholders, ",") + `) ORDER BY rarity,slug`
	rows, err := r.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]ActiveSpeciesOption, 0)
	for rows.Next() {
		var item ActiveSpeciesOption
		if err := rows.Scan(&item.Slug, &item.Name, &item.Rarity); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *PostgresRepository) ListBatchCodes(ctx context.Context, batchID int64) ([]BatchCode, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT c.code_value, c.redeemed_at,
		       COALESCE(c.reward_gold,b.reward_gold), COALESCE(c.reward_creature_slug,b.reward_creature_slug),
		       COALESCE(c.reward_name,b.reward_name), COALESCE(c.reward_rarity,b.reward_rarity)
		FROM promo_codes c JOIN code_batches b ON b.id=c.batch_id
		WHERE c.batch_id = $1
		ORDER BY c.id
	`, batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	codes := make([]BatchCode, 0)
	for rows.Next() {
		var code, creature, name, rarity sql.NullString
		var redeemedAt sql.NullTime
		var rewardGold sql.NullInt64
		if err := rows.Scan(&code, &redeemedAt, &rewardGold, &creature, &name, &rarity); err != nil {
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
		if rewardGold.Valid {
			item.RewardGold = rewardGold.Int64
		}
		if creature.Valid {
			item.RewardCreatureSlug = creature.String
		}
		if name.Valid {
			item.RewardName = name.String
		}
		if rarity.Valid {
			item.RewardRarity = rarity.String
		}
		codes = append(codes, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(codes) == 0 {
		var exists bool
		if err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM code_batches WHERE id = $1)`, batchID).Scan(&exists); err != nil {
			return nil, err
		}
		if !exists {
			return nil, ErrBatchNotFound
		}
	}
	return codes, nil
}

func (r *PostgresRepository) ListBatches(ctx context.Context, limit, offset int) ([]BatchSummary, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT b.id, b.label, b.reward_name, b.reward_rarity, b.reward_gold, b.reward_creature_slug, b.created_by,
		       b.created_at, b.expires_at, b.revoked_at, b.reward_mode, b.reward_gold_min, b.reward_gold_max, b.reward_creature_rarities::text,
		       COUNT(c.id) AS code_count, COUNT(c.redeemed_at) AS redeemed_count
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
		var creature, rarityJSON sql.NullString
		var expiresAt, revokedAt sql.NullTime
		if err := rows.Scan(
			&batch.ID, &batch.Label, &batch.RewardName, &batch.RewardRarity, &batch.RewardGold, &creature, &batch.CreatedBy,
			&batch.CreatedAt, &expiresAt, &revokedAt, &batch.RewardMode, &batch.RewardGoldMin, &batch.RewardGoldMax, &rarityJSON, &batch.CodeCount, &batch.RedeemedCount,
		); err != nil {
			return nil, err
		}
		batch.RewardCreatureRarities = make([]string, 0)
		if rarityJSON.Valid {
			if err := json.Unmarshal([]byte(rarityJSON.String), &batch.RewardCreatureRarities); err != nil {
				return nil, err
			}
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
