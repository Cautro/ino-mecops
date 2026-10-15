package gameplay

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

var (
	ErrInvalidInput     = errors.New("invalid input")
	ErrNotFound         = errors.New("not found")
	ErrInsufficientGold = errors.New("insufficient gold")
	ErrCreatureNotOwned = errors.New("creature is not owned by player")
)

type Store struct{ db *sql.DB }

func NewStore(db *sql.DB) *Store { return &Store{db: db} }

func (s *Store) Overview(ctx context.Context, telegramID int64) (Overview, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return Overview{}, err
	}
	defer func() { _ = tx.Rollback() }()

	var out Overview
	var last time.Time
	var created time.Time
	var username sql.NullString
	if err := tx.QueryRowContext(ctx, `SELECT telegram_id, username, first_name, gold, created_at, last_passive_claim_at FROM players WHERE telegram_id=$1 FOR UPDATE`, telegramID).Scan(&out.TelegramID, &username, &out.FirstName, &out.Gold, &created, &last); err != nil {
		return Overview{}, err
	}
	if username.Valid {
		out.Username = username.String
	}
	out.CreatedAt, out.LastPassiveClaimAt = created, last
	var basePassiveRate float64
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(s.passive_gold_per_hour),0)::double precision, COUNT(pc.id)::int FROM player_creatures pc JOIN creature_species s ON s.slug=pc.species_slug WHERE pc.owner_telegram_id=$1`, telegramID).Scan(&basePassiveRate, &out.OwnedCreatureCount); err != nil {
		return Overview{}, err
	}
	bonus, err := currentMainBonus(ctx, tx, telegramID)
	if err != nil {
		return Overview{}, err
	}
	out.PassiveGoldPerHour = basePassiveRate
	if bonus.Type == string(MainBonusPassiveIncome) {
		out.PassiveGoldPerHour = basePassiveRate * bonus.Multiplier
	}
	var earnedText string
	if err := tx.QueryRowContext(ctx, `
		SELECT (
			COALESCE(SUM(s.passive_gold_per_hour::numeric * GREATEST(0, EXTRACT(EPOCH FROM (clock_timestamp() - GREATEST($2::timestamptz, pc.obtained_at))) / 3600)),0)
			+ COALESCE(SUM(s.passive_gold_per_hour::numeric * GREATEST(0, EXTRACT(EPOCH FROM (clock_timestamp() - GREATEST($2::timestamptz, pc.obtained_at, ms.selected_at))) / 3600)
				* CASE WHEN main_species.main_bonus_type='passive_income' THEN (main_species.main_bonus_multiplier - 1) ELSE 0 END),0)
			+ p.passive_gold_remainder
		)::text
		FROM players p
		LEFT JOIN player_creatures pc ON pc.owner_telegram_id=p.telegram_id
		LEFT JOIN creature_species s ON s.slug=pc.species_slug
		LEFT JOIN player_main_slots ms ON ms.player_telegram_id=p.telegram_id
		LEFT JOIN player_creatures main_pc ON main_pc.id=ms.player_creature_id
		LEFT JOIN creature_species main_species ON main_species.slug=main_pc.species_slug
		WHERE p.telegram_id=$1
		GROUP BY p.passive_gold_remainder`, telegramID, last).Scan(&earnedText); err != nil {
		return Overview{}, err
	}
	// PostgreSQL performs rounding and fractional accounting as NUMERIC to avoid losing fractions over many claims.
	var gained int64
	if err := tx.QueryRowContext(ctx, `
		WITH amount AS MATERIALIZED (SELECT $2::numeric AS total), updated AS (
			UPDATE players p SET gold=p.gold+floor(amount.total)::bigint,
				passive_gold_remainder=amount.total-floor(amount.total),
				last_passive_claim_at=clock_timestamp(),
				updated_at=CASE WHEN floor(amount.total)>0 THEN clock_timestamp() ELSE p.updated_at END
			FROM amount WHERE p.telegram_id=$1
			RETURNING p.gold, floor(amount.total)::bigint AS gained, p.last_passive_claim_at
		)
		SELECT gold, gained, last_passive_claim_at FROM updated`, telegramID, earnedText).Scan(&out.Gold, &gained, &out.LastPassiveClaimAt); err != nil {
		return Overview{}, err
	}
	out.PassiveGoldClaimed = gained
	if gained > 0 {
		if _, err := tx.ExecContext(ctx, `INSERT INTO wallet_transactions (player_telegram_id, delta_gold, transaction_type) VALUES ($1,$2,'passive_income')`, telegramID, gained); err != nil {
			return Overview{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Overview{}, err
	}
	return out, nil
}
