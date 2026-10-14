package gameplay

import (
	"context"
	"database/sql"
	"errors"
)

type mainBonus struct {
	Type       string
	Multiplier float64
	CreatureID int64
	Name       string
	SelectedAt sql.NullTime
}

func currentMainBonus(ctx context.Context, tx *sql.Tx, telegramID int64) (mainBonus, error) {
	bonus := mainBonus{Type: string(MainBonusNone), Multiplier: 1}
	err := tx.QueryRowContext(ctx, `
		SELECT cs.main_bonus_type, cs.main_bonus_multiplier, pc.id, cs.name, ms.selected_at
		FROM player_main_slots ms
		JOIN player_creatures pc ON pc.id = ms.player_creature_id
		JOIN creature_species cs ON cs.slug = pc.species_slug
		WHERE ms.player_telegram_id = $1
	`, telegramID).Scan(&bonus.Type, &bonus.Multiplier, &bonus.CreatureID, &bonus.Name, &bonus.SelectedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return bonus, nil
	}
	if err != nil {
		return mainBonus{}, err
	}
	if bonus.Type == "" {
		bonus.Type = string(MainBonusNone)
	}
	if bonus.Multiplier < 1 {
		bonus.Multiplier = 1
	}
	return bonus, nil
}

func (s *Store) MainSlot(ctx context.Context, telegramID int64) (MainSlotState, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT pc.id, pc.species_slug, cs.name, cs.image_url, cs.rarity,
		       cs.passive_gold_per_hour, cs.main_bonus_type, cs.main_bonus_multiplier,
		       (ms.player_creature_id = pc.id) IS TRUE AS selected
		FROM player_creatures pc
		JOIN creature_species cs ON cs.slug = pc.species_slug
		LEFT JOIN player_main_slots ms ON ms.player_telegram_id = pc.owner_telegram_id
		WHERE pc.owner_telegram_id = $1
		ORDER BY selected DESC, pc.obtained_at DESC, pc.id DESC
	`, telegramID)
	if err != nil {
		return MainSlotState{}, err
	}
	defer rows.Close()

	state := MainSlotState{Options: make([]MainSlotOption, 0)}
	for rows.Next() {
		var option MainSlotOption
		if err := rows.Scan(&option.CreatureID, &option.SpeciesSlug, &option.Name, &option.ImageURL, &option.Rarity,
			&option.PassiveGoldPerHour, &option.BonusType, &option.BonusMultiplier, &option.Selected); err != nil {
			return MainSlotState{}, err
		}
		if option.BonusMultiplier < 1 {
			option.BonusMultiplier = 1
		}
		state.Options = append(state.Options, option)
		if option.Selected {
			state.SelectedCreatureID = option.CreatureID
			selected := option
			state.Selected = &selected
		}
	}
	if err := rows.Err(); err != nil {
		return MainSlotState{}, err
	}
	return state, nil
}

func (s *Store) SetMainSlot(ctx context.Context, telegramID, creatureID int64) error {
	if telegramID <= 0 || creatureID <= 0 {
		return ErrInvalidInput
	}
	// Finalize passive income earned with the previously equipped creature before
	// changing its bonus window; this prevents retroactively applying the new bonus.
	if _, err := s.Overview(ctx, telegramID); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	var lockedPlayer int64
	if err := tx.QueryRowContext(ctx, `SELECT telegram_id FROM players WHERE telegram_id=$1 FOR UPDATE`, telegramID).Scan(&lockedPlayer); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	var owned bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM player_creatures WHERE id=$1 AND owner_telegram_id=$2)`, creatureID, telegramID).Scan(&owned); err != nil {
		return err
	}
	if !owned {
		return ErrCreatureNotOwned
	}
	_, err = tx.ExecContext(ctx, `
		INSERT INTO player_main_slots (player_telegram_id, player_creature_id, selected_at)
		VALUES ($1, $2, now())
		ON CONFLICT (player_telegram_id) DO UPDATE
		SET player_creature_id=EXCLUDED.player_creature_id,
		    selected_at=CASE WHEN player_main_slots.player_creature_id=EXCLUDED.player_creature_id
		                     THEN player_main_slots.selected_at ELSE now() END
	`, telegramID, creatureID)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) ClearMainSlot(ctx context.Context, telegramID int64) error {
	if telegramID <= 0 {
		return ErrInvalidInput
	}
	if _, err := s.Overview(ctx, telegramID); err != nil {
		return err
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var lockedPlayer int64
	if err := tx.QueryRowContext(ctx, `SELECT telegram_id FROM players WHERE telegram_id=$1 FOR UPDATE`, telegramID).Scan(&lockedPlayer); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM player_main_slots WHERE player_telegram_id=$1`, telegramID); err != nil {
		return err
	}
	return tx.Commit()
}
