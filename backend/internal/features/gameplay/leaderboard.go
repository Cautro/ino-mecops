package gameplay

import "context"

func (s *Store) Leaderboards(ctx context.Context) (LeaderboardData, error) {
	data := LeaderboardData{
		Collection:        make([]CollectionLeaderboardEntry, 0),
		ContainerSpending: make([]ContainerSpendLeaderboardEntry, 0),
		Battles:           PlaceholderLeaderboard{Available: false, Message: "В скором будущем", Items: make([]any, 0)},
	}

	rows, err := s.db.QueryContext(ctx, `
		WITH stats AS (
			SELECT p.telegram_id,
			       COALESCE(NULLIF('@' || p.username, '@'), NULLIF(p.first_name, ''), 'Игрок') AS display_name,
			       COUNT(pc.id)::int AS creature_count,
			       COALESCE(SUM(cs.passive_gold_per_hour), 0)::numeric AS base_passive_income,
			       COALESCE(MAX(CASE WHEN main_species.main_bonus_type='passive_income'
			                         THEN main_species.main_bonus_multiplier ELSE 1 END), 1)::numeric AS income_multiplier
		FROM players p
		LEFT JOIN player_creatures pc ON pc.owner_telegram_id=p.telegram_id
		LEFT JOIN creature_species cs ON cs.slug=pc.species_slug
		LEFT JOIN player_main_slots ms ON ms.player_telegram_id=p.telegram_id
		LEFT JOIN player_creatures main_pc ON main_pc.id=ms.player_creature_id
		LEFT JOIN creature_species main_species ON main_species.slug=main_pc.species_slug
		GROUP BY p.telegram_id, p.username, p.first_name
		)
		SELECT display_name, creature_count, (base_passive_income * income_multiplier)::double precision AS passive_gold_per_hour
		FROM stats
		ORDER BY passive_gold_per_hour DESC, creature_count DESC, display_name ASC
		LIMIT 10
	`)
	if err != nil {
		return LeaderboardData{}, err
	}
	for rows.Next() {
		var item CollectionLeaderboardEntry
		if err := rows.Scan(&item.Name, &item.CreatureCount, &item.PassiveGoldPerHour); err != nil {
			rows.Close()
			return LeaderboardData{}, err
		}
		item.Rank = len(data.Collection) + 1
		data.Collection = append(data.Collection, item)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return LeaderboardData{}, err
	}
	if err := rows.Close(); err != nil {
		return LeaderboardData{}, err
	}

	rows, err = s.db.QueryContext(ctx, `
		SELECT COALESCE(NULLIF('@' || p.username, '@'), NULLIF(p.first_name, ''), 'Игрок') AS display_name,
		       p.lootbox_gold_spent_total,
		       COUNT(wt.id) FILTER (WHERE wt.transaction_type='lootbox_purchase')::bigint AS containers_bought
		FROM players p
		LEFT JOIN wallet_transactions wt ON wt.player_telegram_id=p.telegram_id AND wt.transaction_type='lootbox_purchase' AND wt.delta_gold < 0
		GROUP BY p.telegram_id, p.username, p.first_name, p.lootbox_gold_spent_total
		HAVING p.lootbox_gold_spent_total > 0
		ORDER BY p.lootbox_gold_spent_total DESC, containers_bought DESC, display_name ASC
		LIMIT 10
	`)
	if err != nil {
		return LeaderboardData{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var item ContainerSpendLeaderboardEntry
		if err := rows.Scan(&item.Name, &item.TotalSpentGold, &item.ContainersBought); err != nil {
			return LeaderboardData{}, err
		}
		item.Rank = len(data.ContainerSpending) + 1
		data.ContainerSpending = append(data.ContainerSpending, item)
	}
	if err := rows.Err(); err != nil {
		return LeaderboardData{}, err
	}
	return data, nil
}

var _ interface {
	Leaderboards(context.Context) (LeaderboardData, error)
} = (*Store)(nil)
