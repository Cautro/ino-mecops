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
