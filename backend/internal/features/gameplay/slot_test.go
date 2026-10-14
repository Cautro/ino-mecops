package gameplay

import "testing"

func TestEvaluateSlotTriplePayouts(t *testing.T) {
	cases := []struct {
		name       string
		symbol     string
		multiplier int64
		creature   bool
	}{
		{name: "cherries", symbol: "🍒", multiplier: 4},
		{name: "lemon", symbol: "🍋", multiplier: 5},
		{name: "diamond", symbol: "💎", multiplier: 7},
		{name: "star", symbol: "⭐", multiplier: 10},
		{name: "DNA awards a creature", symbol: "🧬", multiplier: 15, creature: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := evaluateSlot([3]string{tc.symbol, tc.symbol, tc.symbol}, 100)
			if got.payout != 100*tc.multiplier || got.creature != tc.creature {
				t.Fatalf("evaluateSlot() = %+v; payout=%d, creature=%t", got, 100*tc.multiplier, tc.creature)
			}
		})
	}
}

func TestEvaluateSlotPairPaysTwelveTenths(t *testing.T) {
	got := evaluateSlot([3]string{"🍒", "🍒", "⭐"}, 100)
	if got.payout != 120 || got.winType != "pair" || got.multiplier != 1.2 {
		t.Fatalf("unexpected pair outcome: %+v", got)
	}
}

func TestEvaluateSlotMissPaysNothing(t *testing.T) {
	got := evaluateSlot([3]string{"🍒", "🍋", "⭐"}, 100)
	if got.payout != 0 || got.winType != "miss" {
		t.Fatalf("unexpected miss outcome: %+v", got)
	}
}

func TestCreatureStakeOutcomeRules(t *testing.T) {
	cases := []struct {
		name        string
		winType     string
		loseStake   bool
		rewardCount int
	}{
		{name: "miss loses selected creature", winType: "miss", loseStake: true, rewardCount: 0},
		{name: "pair preserves selected creature", winType: "pair", loseStake: false, rewardCount: 0},
		{name: "regular triple awards one creature", winType: "triple", loseStake: false, rewardCount: 1},
		{name: "DNA jackpot awards two creatures", winType: "creature", loseStake: false, rewardCount: 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			loseStake, rewardCount := creatureStakeRewards(tc.winType)
			if loseStake != tc.loseStake || rewardCount != tc.rewardCount {
				t.Fatalf("creatureStakeRewards(%q) = (%t, %d); want (%t, %d)", tc.winType, loseStake, rewardCount, tc.loseStake, tc.rewardCount)
			}
		})
	}
}

func TestMainSlotBonusControlsServerSideAttempts(t *testing.T) {
	cases := []struct {
		name  string
		bonus mainBonus
		want  int
	}{
		{name: "no bonus", bonus: mainBonus{Type: string(MainBonusNone), Multiplier: 1}, want: 1},
		{name: "payout bonus does not increase attempts", bonus: mainBonus{Type: string(MainBonusSlotPayout), Multiplier: 5}, want: 1},
		{name: "chance bonus uses configured attempts", bonus: mainBonus{Type: string(MainBonusSlotChance), Multiplier: 5}, want: 5},
		{name: "attempts are capped", bonus: mainBonus{Type: string(MainBonusSlotChance), Multiplier: 50}, want: 10},
		{name: "invalid multiplier becomes one", bonus: mainBonus{Type: string(MainBonusSlotChance), Multiplier: 0}, want: 1},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := bonusAttempts(tc.bonus); got != tc.want {
				t.Fatalf("bonusAttempts(%+v) = %d; want %d", tc.bonus, got, tc.want)
			}
		})
	}
}

func TestRollBestSlotReturnsValidThreeSymbols(t *testing.T) {
	symbols, _, err := rollBestSlot(100, 3)
	if err != nil {
		t.Fatalf("rollBestSlot returned error: %v", err)
	}
	for i, symbol := range symbols {
		found := false
		for _, allowed := range slotSymbols {
			if symbol == allowed {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("symbols[%d]=%q is not a slot symbol", i, symbol)
		}
	}
}
