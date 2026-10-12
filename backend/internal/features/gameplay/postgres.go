package gameplay

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrInvalidInput    = errors.New("invalid input")
	ErrNotFound        = errors.New("not found")
	ErrForbidden       = errors.New("forbidden")
	ErrConflict        = errors.New("conflict")
	ErrNotYourTurn     = errors.New("not your turn")
	ErrAbilityCooldown = errors.New("ability cooldown")
	ErrBattleClosed    = errors.New("battle is not active")
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
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(SUM(s.passive_gold_per_hour),0)::bigint, COUNT(pc.id)::int FROM player_creatures pc JOIN creature_species s ON s.slug=pc.species_slug WHERE pc.owner_telegram_id=$1`, telegramID).Scan(&out.PassiveGoldPerHour, &out.OwnedCreatureCount); err != nil {
		return Overview{}, err
	}
	var earnedText string
	if err := tx.QueryRowContext(ctx, `
		SELECT (COALESCE(SUM(s.passive_gold_per_hour::numeric * GREATEST(0, EXTRACT(EPOCH FROM (clock_timestamp() - GREATEST($2::timestamptz, pc.obtained_at))) / 3600)),0) + p.passive_gold_remainder)::text
		FROM players p
		LEFT JOIN player_creatures pc ON pc.owner_telegram_id=p.telegram_id
		LEFT JOIN creature_species s ON s.slug=pc.species_slug
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

const snapshotQuery = `
SELECT pc.owner_telegram_id, COALESCE(NULLIF(p.first_name,''), NULLIF(p.username,''), 'Игрок'), pc.id,
       s.slug, s.name, s.image_url, s.rarity, s.health, s.damage, s.crit_chance::float8, s.passive_gold_per_hour,
       a.slug, a.name, a.power, a.accuracy_percent::float8, a.cooldown_seconds, a.effect_type, a.effect_value, a.effect_duration_turns
FROM player_creatures pc
JOIN players p ON p.telegram_id=pc.owner_telegram_id
JOIN creature_species s ON s.slug=pc.species_slug
JOIN abilities a ON a.id=s.ability_id
`

func readSnapshot(scanner interface{ Scan(...any) error }) (CreatureSnapshot, error) {
	var c CreatureSnapshot
	err := scanner.Scan(&c.PlayerTelegramID, &c.PlayerName, &c.CreatureID, &c.SpeciesSlug, &c.Name, &c.ImageURL, &c.Rarity, &c.Health, &c.Damage, &c.CritChance, &c.PassiveGoldHour,
		&c.Ability.Slug, &c.Ability.Name, &c.Ability.Power, &c.Ability.AccuracyPercent, &c.Ability.CooldownSeconds, &c.Ability.EffectType, &c.Ability.EffectValue, &c.Ability.EffectDurationTurns)
	return c, err
}

func (s *Store) listPlayerOptions(ctx context.Context, me int64) ([]PlayerOption, error) {
	rows, err := s.db.QueryContext(ctx, snapshotQuery+` WHERE p.telegram_id<>$1 ORDER BY p.updated_at DESC, pc.obtained_at DESC LIMIT 500`, me)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	players := make([]PlayerOption, 0)
	indexes := map[int64]int{}
	for rows.Next() {
		c, err := readSnapshot(rows)
		if err != nil {
			return nil, err
		}
		idx, ok := indexes[c.PlayerTelegramID]
		if !ok {
			idx = len(players)
			indexes[c.PlayerTelegramID] = idx
			players = append(players, PlayerOption{TelegramID: c.PlayerTelegramID, FirstName: c.PlayerName, Creatures: []CreatureSnapshot{}})
		}
		players[idx].Creatures = append(players[idx].Creatures, c)
	}
	return players, rows.Err()
}

func (s *Store) createBattle(ctx context.Context, me int64, input CreateBattleInput) (Battle, error) {
	if input.MyCreatureID < 1 || input.OpponentCreatureID < 1 || input.MyCreatureID == input.OpponentCreatureID {
		return Battle{}, ErrInvalidInput
	}
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return Battle{}, err
	}
	defer func() { _ = tx.Rollback() }()
	mine, err := readSnapshot(tx.QueryRowContext(ctx, snapshotQuery+` WHERE pc.id=$1 AND pc.owner_telegram_id=$2`, input.MyCreatureID, me))
	if errors.Is(err, sql.ErrNoRows) {
		return Battle{}, ErrNotFound
	}
	if err != nil {
		return Battle{}, err
	}
	theirs, err := readSnapshot(tx.QueryRowContext(ctx, snapshotQuery+` WHERE pc.id=$1`, input.OpponentCreatureID))
	if errors.Is(err, sql.ErrNoRows) {
		return Battle{}, ErrNotFound
	}
	if err != nil {
		return Battle{}, err
	}
	if mine.PlayerTelegramID == theirs.PlayerTelegramID {
		return Battle{}, ErrInvalidInput
	}
	// Serialize challenge creation/acceptance for the same pair of players.
	// Lock IDs in ascending order to avoid advisory-lock deadlocks.
	if err := lockPlayerPair(ctx, tx, me, theirs.PlayerTelegramID); err != nil {
		return Battle{}, err
	}
	var busy bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM game_battles WHERE status='active' AND (challenger_telegram_id IN ($1,$2) OR opponent_telegram_id IN ($1,$2)))`, me, theirs.PlayerTelegramID).Scan(&busy); err != nil {
		return Battle{}, err
	}
	if busy {
		return Battle{}, ErrConflict
	}
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM game_battles WHERE challenger_telegram_id=$1 AND status='waiting')`, me).Scan(&busy); err != nil {
		return Battle{}, err
	}
	if busy {
		return Battle{}, ErrConflict
	}
	mineJSON, _ := json.Marshal(mine)
	theirsJSON, _ := json.Marshal(theirs)
	var id int64
	err = tx.QueryRowContext(ctx, `INSERT INTO game_battles (challenger_telegram_id, opponent_telegram_id, challenger_creature_id, opponent_creature_id, challenger_snapshot, opponent_snapshot)
		VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb) RETURNING id`, me, theirs.PlayerTelegramID, mine.CreatureID, theirs.CreatureID, string(mineJSON), string(theirsJSON)).Scan(&id)
	if err != nil {
		return Battle{}, err
	}
	if err := tx.Commit(); err != nil {
		return Battle{}, err
	}
	return s.getBattle(ctx, id, 0)
}

func (s *Store) listBattles(ctx context.Context, me int64) ([]Battle, error) {
	rows, err := s.db.QueryContext(ctx, battleSelect+` WHERE b.challenger_telegram_id=$1 OR b.opponent_telegram_id=$1 ORDER BY b.updated_at DESC, b.id DESC LIMIT 50`, me)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]Battle, 0)
	for rows.Next() {
		b, err := scanBattle(rows)
		if err != nil {
			return nil, err
		}
		items = append(items, b)
	}
	return items, rows.Err()
}

const battleSelect = `SELECT b.id,b.status,b.challenger_telegram_id,COALESCE(NULLIF(p1.first_name,''),NULLIF(p1.username,''),'Игрок'),
 b.opponent_telegram_id,COALESCE(NULLIF(p2.first_name,''),NULLIF(p2.username,''),'Игрок'),b.challenger_snapshot,b.opponent_snapshot,
 b.current_turn_telegram_id,b.winner_telegram_id,b.combat_state,b.created_at,b.updated_at,b.finished_at
 FROM game_battles b JOIN players p1 ON p1.telegram_id=b.challenger_telegram_id JOIN players p2 ON p2.telegram_id=b.opponent_telegram_id`

func scanBattle(scanner interface{ Scan(...any) error }) (Battle, error) {
	var b Battle
	var leftRaw, rightRaw, stateRaw []byte
	var turn, winner sql.NullInt64
	var finished sql.NullTime
	err := scanner.Scan(&b.ID, &b.Status, &b.ChallengerTelegramID, &b.ChallengerName, &b.OpponentTelegramID, &b.OpponentName, &leftRaw, &rightRaw, &turn, &winner, &stateRaw, &b.CreatedAt, &b.UpdatedAt, &finished)
	if err != nil {
		return Battle{}, err
	}
	if err := json.Unmarshal(leftRaw, &b.ChallengerCreature); err != nil {
		return Battle{}, err
	}
	if err := json.Unmarshal(rightRaw, &b.OpponentCreature); err != nil {
		return Battle{}, err
	}
	if len(stateRaw) > 0 {
		if err := json.Unmarshal(stateRaw, &b.State); err != nil {
			return Battle{}, err
		}
	}
	if turn.Valid {
		b.CurrentTurnTelegramID = turn.Int64
	}
	if winner.Valid {
		b.WinnerTelegramID = winner.Int64
	}
	if finished.Valid {
		value := finished.Time
		b.FinishedAt = &value
	}
	return b, nil
}

func (s *Store) getBattle(ctx context.Context, id, lock int64) (Battle, error) {
	query := battleSelect + ` WHERE b.id=$1`
	if lock == 1 {
		query += ` FOR UPDATE OF b`
	}
	b, err := scanBattle(s.db.QueryRowContext(ctx, query, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Battle{}, ErrNotFound
	}
	return b, err
}

func lockPlayerPair(ctx context.Context, tx *sql.Tx, a, b int64) error {
	if a > b {
		a, b = b, a
	}
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, a); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock($1)`, b); err != nil {
		return err
	}
	return nil
}

func (s *Store) acceptBattle(ctx context.Context, me, id int64) (Battle, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Battle{}, err
	}
	defer func() { _ = tx.Rollback() }()
	b, err := scanBattle(tx.QueryRowContext(ctx, battleSelect+` WHERE b.id=$1 FOR UPDATE OF b`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Battle{}, ErrNotFound
	}
	if err != nil {
		return Battle{}, err
	}
	if b.OpponentTelegramID != me {
		return Battle{}, ErrForbidden
	}
	if b.Status != "waiting" {
		return Battle{}, ErrConflict
	}
	if err := lockPlayerPair(ctx, tx, b.ChallengerTelegramID, b.OpponentTelegramID); err != nil {
		return Battle{}, err
	}
	var busy bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM game_battles WHERE status='active' AND (challenger_telegram_id IN ($1,$2) OR opponent_telegram_id IN ($1,$2)))`, b.ChallengerTelegramID, b.OpponentTelegramID).Scan(&busy); err != nil {
		return Battle{}, err
	}
	if busy {
		return Battle{}, ErrConflict
	}
	state := CombatState{CurrentTurnTelegramID: b.ChallengerTelegramID, Round: 1, Challenger: FighterState{HP: b.ChallengerCreature.Health, MaxHP: b.ChallengerCreature.Health, Effects: []StatusEffect{}}, Opponent: FighterState{HP: b.OpponentCreature.Health, MaxHP: b.OpponentCreature.Health, Effects: []StatusEffect{}}, Log: []BattleLog{{At: time.Now().UTC(), Type: "system", Message: "Дуэль началась. Первый ход за вызывающим игроком."}}}
	raw, _ := json.Marshal(state)
	_, err = tx.ExecContext(ctx, `UPDATE game_battles SET status='active',current_turn_telegram_id=$2,combat_state=$3::jsonb,updated_at=now() WHERE id=$1`, id, b.ChallengerTelegramID, string(raw))
	if err != nil {
		return Battle{}, err
	}
	if err = tx.Commit(); err != nil {
		return Battle{}, err
	}
	return s.getBattle(ctx, id, 0)
}

func (s *Store) closeWaiting(ctx context.Context, me, id int64, decline bool) error {
	status, expectedUser := "cancelled", "challenger_telegram_id"
	if decline {
		status = "declined"
		expectedUser = "opponent_telegram_id"
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	b, err := scanBattle(tx.QueryRowContext(ctx, battleSelect+` WHERE b.id=$1 FOR UPDATE OF b`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	owner := b.ChallengerTelegramID
	if expectedUser == "opponent_telegram_id" {
		owner = b.OpponentTelegramID
	}
	if owner != me {
		return ErrForbidden
	}
	if b.Status != "waiting" {
		return ErrConflict
	}
	_, err = tx.ExecContext(ctx, `UPDATE game_battles SET status=$2,updated_at=now() WHERE id=$1`, id, status)
	if err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) takeTurn(ctx context.Context, me, id int64, action string) (TurnResult, error) {
	if action != "basic" && action != "ability" {
		return TurnResult{}, ErrInvalidInput
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return TurnResult{}, err
	}
	defer func() { _ = tx.Rollback() }()
	b, err := scanBattle(tx.QueryRowContext(ctx, battleSelect+` WHERE b.id=$1 FOR UPDATE OF b`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return TurnResult{}, ErrNotFound
	}
	if err != nil {
		return TurnResult{}, err
	}
	if b.Status != "active" {
		return TurnResult{}, ErrBattleClosed
	}
	if b.ChallengerTelegramID != me && b.OpponentTelegramID != me {
		return TurnResult{}, ErrForbidden
	}
	if b.State.CurrentTurnTelegramID != me {
		return TurnResult{}, ErrNotYourTurn
	}
	isLeft := me == b.ChallengerTelegramID
	attacker, defender, attackerTemplate, defenderTemplate := &b.State.Challenger, &b.State.Opponent, b.ChallengerCreature, b.OpponentCreature
	if !isLeft {
		attacker, defender, attackerTemplate, defenderTemplate = &b.State.Opponent, &b.State.Challenger, b.OpponentCreature, b.ChallengerCreature
	}
	now := time.Now().UTC()
	if action == "ability" && now.Before(attacker.AbilityReadyAt) {
		return TurnResult{}, ErrAbilityCooldown
	}
	stunned := false
	// Damage-over-time effects trigger at the beginning of the affected creature's turn.
	for _, effect := range attacker.Effects {
		if effect.TurnsLeft > 0 && effect.Type == "burn" {
			damage := effect.DamagePerTurn
			if damage < 1 {
				damage = 1
			}
			if damage > attacker.HP {
				damage = attacker.HP
			}
			attacker.HP -= damage
			b.State.Log = append(b.State.Log, BattleLog{At: now, Type: "effect", Message: fmt.Sprintf("Горение наносит %s %d урона.", attackerTemplate.Name, damage)})
		}
		if effect.TurnsLeft > 0 && effect.Type == "stun" {
			stunned = true
		}
	}
	message := "Ход завершён."
	if attacker.HP <= 0 {
		b.Status = "finished"
		b.WinnerTelegramID = defenderTemplate.PlayerTelegramID
		b.State.Log = append(b.State.Log, BattleLog{At: now, Type: "finish", Message: defenderTemplate.Name + " победил благодаря эффекту горения."})
	} else if stunned {
		b.State.Log = append(b.State.Log, BattleLog{At: now, Type: "effect", Message: attackerTemplate.Name + " пропускает ход из-за оглушения."})
		message = "Ход пропущен: иномекон оглушён."
		decrementEffects(attacker)
	} else {
		baseDamage := attackerTemplate.Damage
		accuracy := 100.0
		if action == "ability" {
			baseDamage += attackerTemplate.Ability.Power
			accuracy = attackerTemplate.Ability.AccuracyPercent
		}
		if action == "ability" {
			// Attempting a skill consumes its cooldown even when the attack misses.
			attacker.AbilityReadyAt = now.Add(time.Duration(attackerTemplate.Ability.CooldownSeconds) * time.Second)
		}
		if !rollChance(accuracy) {
			b.State.Log = append(b.State.Log, BattleLog{At: now, Type: "miss", Message: attackerTemplate.Name + " промахивается."})
			message = "Атака не попала."
			decrementEffects(attacker)
		} else {
			reduction := 0
			for _, effect := range attacker.Effects {
				if effect.TurnsLeft > 0 && (effect.Type == "slow" || effect.Type == "weaken") && effect.Value > reduction {
					reduction = effect.Value
				}
			}
			baseDamage = baseDamage * (100 - reduction) / 100
			critical := rollChance(attackerTemplate.CritChance)
			if critical {
				baseDamage = baseDamage * 3 / 2
			}
			kind := "attack"
			if critical {
				kind = "critical"
			}
			actual := applyDamage(defender, baseDamage, attackerTemplate.Name, defenderTemplate.Name, &b.State.Log, kind)
			message = fmt.Sprintf("Нанесено %d урона%s.", actual, map[bool]string{true: " (критический удар)", false: ""}[critical])
			decrementEffects(attacker)
			if action == "ability" && defender.HP > 0 {
				if attackerTemplate.Ability.EffectType != "none" {
					duration := turnsForDuration(attackerTemplate.Ability.EffectDurationTurns)
					v := attackerTemplate.Ability.EffectValue
					if attackerTemplate.Ability.EffectType == "shield" {
						addEffect(attacker, StatusEffect{Type: "shield", Value: v, TurnsLeft: duration})
						b.State.Log = append(b.State.Log, BattleLog{At: now, Type: "effect", Message: attackerTemplate.Name + " получает щит на ход(ы)."})
					} else {
						effect := StatusEffect{Type: attackerTemplate.Ability.EffectType, Value: v, TurnsLeft: duration}
						if effect.Type == "burn" {
							effect.DamagePerTurn = max(1, attackerTemplate.Damage*v/100)
						}
						addEffect(defender, effect)
						b.State.Log = append(b.State.Log, BattleLog{At: now, Type: "effect", Message: "Способность накладывает эффект: " + effectLabel(effect.Type) + "."})
					}
				}
			}
		}
		if defender.HP <= 0 {
			b.Status = "finished"
			b.WinnerTelegramID = attackerTemplate.PlayerTelegramID
			b.State.Log = append(b.State.Log, BattleLog{At: now, Type: "finish", Message: attackerTemplate.Name + " побеждает в дуэли."})
		}
	}
	if b.Status != "finished" {
		if me == b.ChallengerTelegramID {
			b.State.CurrentTurnTelegramID = b.OpponentTelegramID
		} else {
			b.State.CurrentTurnTelegramID = b.ChallengerTelegramID
			b.State.Round++
		}
		b.CurrentTurnTelegramID = b.State.CurrentTurnTelegramID
	}
	if len(b.State.Log) > 60 {
		b.State.Log = append([]BattleLog(nil), b.State.Log[len(b.State.Log)-60:]...)
	}
	if b.Status == "finished" {
		b.State.CurrentTurnTelegramID = 0
		b.CurrentTurnTelegramID = 0
	}
	b.UpdatedAt = now
	stateRaw, marshalErr := json.Marshal(b.State)
	if marshalErr != nil {
		return TurnResult{}, marshalErr
	}
	var winner any
	var finished any
	if b.Status == "finished" {
		winner = b.WinnerTelegramID
		finished = now
	}
	_, err = tx.ExecContext(ctx, `UPDATE game_battles SET status=$2,current_turn_telegram_id=NULLIF($3,0),winner_telegram_id=$4,combat_state=$5::jsonb,updated_at=now(),finished_at=$6 WHERE id=$1`, id, b.Status, b.State.CurrentTurnTelegramID, winner, string(stateRaw), finished)
	if err != nil {
		return TurnResult{}, err
	}
	if err = tx.Commit(); err != nil {
		return TurnResult{}, err
	}
	fresh, err := s.getBattle(ctx, id, 0)
	if err != nil {
		return TurnResult{}, err
	}
	return TurnResult{Battle: fresh, Message: message}, nil
}

func (s *Store) surrender(ctx context.Context, me, id int64) (Battle, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Battle{}, err
	}
	defer func() { _ = tx.Rollback() }()
	b, err := scanBattle(tx.QueryRowContext(ctx, battleSelect+` WHERE b.id=$1 FOR UPDATE OF b`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return Battle{}, ErrNotFound
	}
	if err != nil {
		return Battle{}, err
	}
	if b.Status != "active" {
		return Battle{}, ErrBattleClosed
	}
	if me != b.ChallengerTelegramID && me != b.OpponentTelegramID {
		return Battle{}, ErrForbidden
	}
	winner := b.ChallengerTelegramID
	winnerName := b.ChallengerCreature.Name
	if me == winner {
		winner = b.OpponentTelegramID
		winnerName = b.OpponentCreature.Name
	}
	now := time.Now().UTC()
	b.State.CurrentTurnTelegramID = 0
	b.State.Log = append(b.State.Log, BattleLog{At: now, Type: "finish", Message: fmt.Sprintf("%s сдаётся. Победа: %s.", map[bool]string{true: b.ChallengerCreature.Name, false: b.OpponentCreature.Name}[me == b.ChallengerTelegramID], winnerName)})
	state, err := json.Marshal(b.State)
	if err != nil {
		return Battle{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE game_battles SET status='finished',current_turn_telegram_id=NULL,winner_telegram_id=$2,combat_state=$3::jsonb,updated_at=$4,finished_at=$4 WHERE id=$1`, id, winner, string(state), now); err != nil {
		return Battle{}, err
	}
	if err = tx.Commit(); err != nil {
		return Battle{}, err
	}
	return s.getBattle(ctx, id, 0)
}

func effectLabel(kind string) string {
	switch kind {
	case "burn":
		return "горение"
	case "slow":
		return "замедление"
	case "stun":
		return "оглушение"
	case "weaken":
		return "ослабление"
	case "shield":
		return "щит"
	default:
		return strings.TrimSpace(kind)
	}
}
