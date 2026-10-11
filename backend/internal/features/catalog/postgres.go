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
SELECT s.id, s.slug, s.name, s.description, s.image_url, s.rarity, s.passive_gold_per_hour,
       s.health, s.damage, s.crit_chance, s.ability_id, a.name, a.slug, s.is_active, s.created_at, s.updated_at
FROM creature_species s
JOIN abilities a ON a.id=s.ability_id
`

func scanSpecies(scanner interface{ Scan(...any) error }) (Species, error) {
	var item Species
	err := scanner.Scan(&item.ID, &item.Slug, &item.Name, &item.Description, &item.ImageURL, &item.Rarity, &item.PassiveGoldPerHour,
		&item.Health, &item.Damage, &item.CritChance, &item.AbilityID, &item.AbilityName, &item.AbilitySlug, &item.IsActive, &item.CreatedAt, &item.UpdatedAt)
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

func (r *PostgresRepository) CreateSpecies(ctx context.Context, input SpeciesInput) (Species, error) {
	var id int64
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO creature_species (slug, name, description, image_url, rarity, passive_gold_per_hour, health, damage, crit_chance, ability_id)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
		input.Slug, input.Name, input.Description, input.ImageURL, input.Rarity, input.PassiveGoldPerHour, input.Health, input.Damage, input.CritChance, input.AbilityID).Scan(&id)
	if err != nil {
		return Species{}, mapDatabaseError(err)
	}
	return r.getSpecies(ctx, id)
}

func (r *PostgresRepository) UpdateSpecies(ctx context.Context, id int64, input SpeciesUpdateInput) (Species, error) {
	var updatedID int64
	err := r.db.QueryRowContext(ctx, `
		UPDATE creature_species SET name=$2, description=$3, image_url=$4, rarity=$5, passive_gold_per_hour=$6,
			health=$7, damage=$8, crit_chance=$9, ability_id=$10, updated_at=now()
		WHERE id=$1 RETURNING id`, id, input.Name, input.Description, input.ImageURL, input.Rarity, input.PassiveGoldPerHour, input.Health, input.Damage, input.CritChance, input.AbilityID).Scan(&updatedID)
	if errors.Is(err, sql.ErrNoRows) {
		return Species{}, ErrNotFound
	}
	if err != nil {
		return Species{}, mapDatabaseError(err)
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
