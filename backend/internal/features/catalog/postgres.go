package catalog

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

type PostgresRepository struct{ db *sql.DB }

func NewPostgresRepository(db *sql.DB) *PostgresRepository { return &PostgresRepository{db: db} }

const abilityColumns = `id, slug, name, description, element, power, accuracy_percent, cooldown_seconds, effect_type, effect_value, effect_duration_turns, is_default, created_at, updated_at`

func scanAbility(scanner interface{ Scan(...any) error }) (Ability, error) {
	var item Ability
	err := scanner.Scan(&item.ID, &item.Slug, &item.Name, &item.Description, &item.Element, &item.Power, &item.AccuracyPercent, &item.CooldownSeconds, &item.EffectType, &item.EffectValue, &item.EffectDurationTurns, &item.IsDefault, &item.CreatedAt, &item.UpdatedAt)
	return item, err
}

func (r *PostgresRepository) ListAbilities(ctx context.Context) ([]Ability, error) {
	rows, err := r.db.QueryContext(ctx, `SELECT `+abilityColumns+` FROM abilities ORDER BY is_default DESC, name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Ability, 0)
	for rows.Next() {
		item, err := scanAbility(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) CreateAbility(ctx context.Context, item Ability) (Ability, error) {
	created, err := scanAbility(r.db.QueryRowContext(ctx, `
		INSERT INTO abilities (slug, name, description, element, power, accuracy_percent, cooldown_seconds, effect_type, effect_value, effect_duration_turns)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
		RETURNING `+abilityColumns,
		item.Slug, item.Name, item.Description, item.Element, item.Power, item.AccuracyPercent, item.CooldownSeconds, item.EffectType, item.EffectValue, item.EffectDurationTurns))
	return created, mapDatabaseError(err)
}

func (r *PostgresRepository) UpdateAbility(ctx context.Context, id int64, input AbilityUpdateInput) (Ability, error) {
	item, err := scanAbility(r.db.QueryRowContext(ctx, `
		UPDATE abilities SET name=$2, description=$3, element=$4, power=$5, accuracy_percent=$6,
			cooldown_seconds=$7, effect_type=$8, effect_value=$9, effect_duration_turns=$10, updated_at=now()
		WHERE id=$1
		RETURNING `+abilityColumns,
		id, input.Name, input.Description, input.Element, input.Power, input.AccuracyPercent, input.CooldownSeconds, input.EffectType, input.EffectValue, input.EffectDurationTurns))
	if errors.Is(err, sql.ErrNoRows) {
		return Ability{}, ErrNotFound
	}
	return item, mapDatabaseError(err)
}

func (r *PostgresRepository) DeleteAbility(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `DELETE FROM abilities WHERE id=$1 AND is_default=FALSE`, id)
	if err != nil {
		return mapDatabaseError(err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	var exists, isDefault bool
	err = r.db.QueryRowContext(ctx, `SELECT TRUE, is_default FROM abilities WHERE id=$1`, id).Scan(&exists, &isDefault)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if exists && isDefault {
		return ErrProtected
	}
	return ErrNotFound
}

const speciesSelect = `
SELECT s.id, s.slug, s.name, s.description, s.image_url, s.sell_price_gold, s.rarity, s.passive_gold_per_hour,
       s.health, s.damage, s.crit_chance, s.ability_id, a.name, a.slug, s.is_active, s.created_at, s.updated_at, s.is_featured, s.main_bonus_type, s.main_bonus_multiplier
FROM creature_species s
JOIN abilities a ON a.id=s.ability_id
`

func scanSpecies(scanner interface{ Scan(...any) error }) (Species, error) {
	var item Species
	err := scanner.Scan(&item.ID, &item.Slug, &item.Name, &item.Description, &item.ImageURL, &item.SellPriceGold, &item.Rarity, &item.PassiveGoldPerHour,
		&item.Health, &item.Damage, &item.CritChance, &item.AbilityID, &item.AbilityName, &item.AbilitySlug, &item.IsActive, &item.CreatedAt, &item.UpdatedAt, &item.IsFeatured, &item.MainBonusType, &item.MainBonusMultiplier)
	return item, err
}

func (r *PostgresRepository) ListSpecies(ctx context.Context, includeArchived bool) ([]Species, error) {
	query := speciesSelect
	if !includeArchived {
		query += ` WHERE s.is_active=TRUE`
	}
	query += ` ORDER BY s.updated_at DESC, s.id DESC`
	rows, err := r.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Species, 0)
	for rows.Next() {
		item, err := scanSpecies(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// ListCollectionSpecies returns every active species plus any archived species
// the player already owns. Unowned entries are reduced to an opaque catalogue
// ID and locked flag; the name, slug, image and stats never leave the server.
func (r *PostgresRepository) ListCollectionSpecies(ctx context.Context, ownerTelegramID int64) ([]CollectionSpecies, error) {
	query := `SELECT s.id, s.slug, s.name, s.description, s.image_url, s.sell_price_gold, s.rarity, s.passive_gold_per_hour,
		s.health, s.damage, s.crit_chance, s.ability_id, a.name, a.slug, s.is_active, s.created_at, s.updated_at,
		s.is_featured, s.main_bonus_type, s.main_bonus_multiplier,
		(EXISTS (SELECT 1 FROM player_discovered_species ds WHERE ds.player_telegram_id = $1 AND ds.species_slug = s.slug)
		 OR EXISTS (SELECT 1 FROM player_creatures pc WHERE pc.owner_telegram_id = $1 AND pc.species_slug = s.slug)) AS is_discovered
		FROM creature_species s
		JOIN abilities a ON a.id = s.ability_id
		WHERE s.is_active = TRUE
		   OR EXISTS (SELECT 1 FROM player_discovered_species ds WHERE ds.player_telegram_id = $1 AND ds.species_slug = s.slug)
		   OR EXISTS (SELECT 1 FROM player_creatures pc WHERE pc.owner_telegram_id = $1 AND pc.species_slug = s.slug)
		ORDER BY s.updated_at DESC, s.id DESC`
	rows, err := r.db.QueryContext(ctx, query, ownerTelegramID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]CollectionSpecies, 0)
	for rows.Next() {
		var item Species
		var discovered bool
		if err := rows.Scan(&item.ID, &item.Slug, &item.Name, &item.Description, &item.ImageURL, &item.SellPriceGold, &item.Rarity, &item.PassiveGoldPerHour,
			&item.Health, &item.Damage, &item.CritChance, &item.AbilityID, &item.AbilityName, &item.AbilitySlug, &item.IsActive, &item.CreatedAt, &item.UpdatedAt, &item.IsFeatured, &item.MainBonusType, &item.MainBonusMultiplier, &discovered); err != nil {
			return nil, err
		}
		items = append(items, collectionSpecies(item, discovered))
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return items, nil
}

func (r *PostgresRepository) CreateSpecies(ctx context.Context, input SpeciesInput) (Species, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return Species{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if input.IsFeatured {
		if _, err := tx.ExecContext(ctx, `UPDATE creature_species SET is_featured=FALSE, updated_at=now() WHERE is_featured=TRUE`); err != nil {
			return Species{}, err
		}
	}
	var id int64
	err = tx.QueryRowContext(ctx, `
		INSERT INTO creature_species (slug, name, description, image_url, sell_price_gold, rarity, passive_gold_per_hour, health, damage, crit_chance, ability_id, is_featured, main_bonus_type, main_bonus_multiplier)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
		input.Slug, input.Name, input.Description, input.ImageURL, input.SellPriceGold, input.Rarity, input.PassiveGoldPerHour, input.Health, input.Damage, input.CritChance, input.AbilityID, input.IsFeatured, input.MainBonusType, input.MainBonusMultiplier).Scan(&id)
	if err != nil {
		return Species{}, mapDatabaseError(err)
	}
	if err := tx.Commit(); err != nil {
		return Species{}, err
	}
	return r.getSpecies(ctx, id)
}

func (r *PostgresRepository) UpdateSpecies(ctx context.Context, id int64, input SpeciesUpdateInput) (Species, error) {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return Species{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if input.IsFeatured {
		if _, err := tx.ExecContext(ctx, `UPDATE creature_species SET is_featured=FALSE, updated_at=now() WHERE is_featured=TRUE AND id<>$1`, id); err != nil {
			return Species{}, err
		}
	}
	var updatedID int64
	err = tx.QueryRowContext(ctx, `
		UPDATE creature_species SET name=$2, description=$3, image_url=$4, sell_price_gold=$5, rarity=$6, passive_gold_per_hour=$7,
			health=$8, damage=$9, crit_chance=$10, ability_id=$11, is_featured=$12, main_bonus_type=$13, main_bonus_multiplier=$14, updated_at=now()
		WHERE id=$1 RETURNING id`, id, input.Name, input.Description, input.ImageURL, input.SellPriceGold, input.Rarity, input.PassiveGoldPerHour, input.Health, input.Damage, input.CritChance, input.AbilityID, input.IsFeatured, input.MainBonusType, input.MainBonusMultiplier).Scan(&updatedID)
	if errors.Is(err, sql.ErrNoRows) {
		return Species{}, ErrNotFound
	}
	if err != nil {
		return Species{}, mapDatabaseError(err)
	}
	if err := tx.Commit(); err != nil {
		return Species{}, err
	}
	return r.getSpecies(ctx, updatedID)
}

func (r *PostgresRepository) getSpecies(ctx context.Context, id int64) (Species, error) {
	item, err := scanSpecies(r.db.QueryRowContext(ctx, speciesSelect+` WHERE s.id=$1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Species{}, ErrNotFound
	}
	return item, err
}

func (r *PostgresRepository) ArchiveSpecies(ctx context.Context, id int64) error {
	result, err := r.db.ExecContext(ctx, `UPDATE creature_species SET is_active=FALSE, updated_at=now() WHERE id=$1 AND is_active=TRUE`, id)
	if err != nil {
		return err
	}
	count, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *PostgresRepository) DeleteSpecies(ctx context.Context, id int64) error {
	tx, err := r.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var slug string
	if err := tx.QueryRowContext(ctx, `SELECT slug FROM creature_species WHERE id=$1 FOR UPDATE`, id).Scan(&slug); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}

	// A permanent delete removes owned copies and discovery records. Any active
	// promo-code batch promising this species is revoked first so it cannot issue
	// a reward for a creature which no longer exists.
	if _, err := tx.ExecContext(ctx, `
		UPDATE code_batches SET revoked_at=COALESCE(revoked_at, now())
		WHERE reward_creature_slug=$1 AND revoked_at IS NULL
		  AND EXISTS (
		    SELECT 1 FROM promo_codes c
		    WHERE c.batch_id=code_batches.id AND c.redeemed_by IS NULL AND c.revoked_at IS NULL
		  )
	`, slug); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM player_creatures WHERE species_slug=$1`, slug); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM player_discovered_species WHERE species_slug=$1`, slug); err != nil {
		return err
	}

	result, err := tx.ExecContext(ctx, `DELETE FROM creature_species WHERE id=$1`, id)
	if err != nil {
		return mapDatabaseError(err)
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed == 0 {
		return ErrNotFound
	}
	if err := tx.Commit(); err != nil {
		return mapDatabaseError(err)
	}
	return nil
}

func mapDatabaseError(err error) error {
	if err == nil {
		return nil
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			return fmt.Errorf("%w: %s", ErrConflict, pgErr.ConstraintName)
		case "23503":
			return fmt.Errorf("%w: %s", ErrInUse, pgErr.ConstraintName)
		case "23514", "22001", "22P02":
			return ErrInvalidInput
		}
	}
	return err
}
