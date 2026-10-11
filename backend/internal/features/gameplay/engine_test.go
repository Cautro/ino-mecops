package gameplay

import "testing"

func TestAddEffectRefreshesWithoutDuplicate(t *testing.T) {
	state := FighterState{Effects: []StatusEffect{{Type: "burn", Value: 5, TurnsLeft: 2, DamagePerTurn: 1}}}
	addEffect(&state, StatusEffect{Type: "burn", Value: 12, TurnsLeft: 4, DamagePerTurn: 3})
	if len(state.Effects) != 1 {
		t.Fatalf("expected one burn effect, got %d", len(state.Effects))
	}
	if state.Effects[0].Value != 12 || state.Effects[0].TurnsLeft != 4 || state.Effects[0].DamagePerTurn != 3 {
		t.Fatalf("effect was not refreshed: %+v", state.Effects[0])
	}
}

func TestDecrementEffectsRemovesExpiredOnly(t *testing.T) {
	state := FighterState{Effects: []StatusEffect{{Type: "burn", TurnsLeft: 1}, {Type: "shield", TurnsLeft: 3}}}
	decrementEffects(&state)
	if len(state.Effects) != 1 {
		t.Fatalf("expected one remaining effect, got %d", len(state.Effects))
	}
	if state.Effects[0].Type != "shield" || state.Effects[0].TurnsLeft != 2 {
		t.Fatalf("unexpected remaining effect: %+v", state.Effects[0])
	}
}

func TestTurnsForDurationHasMinimumOneTurn(t *testing.T) {
	for _, tc := range []struct{ input, want int }{{0, 1}, {-1, 1}, {1, 1}, {4, 4}} {
		if got := turnsForDuration(tc.input); got != tc.want {
			t.Fatalf("turnsForDuration(%d)=%d, want %d", tc.input, got, tc.want)
		}
	}
}

func TestApplyDamageRespectsShieldAndHP(t *testing.T) {
	state := FighterState{HP: 50, MaxHP: 50, Effects: []StatusEffect{{Type: "shield", Value: 25, TurnsLeft: 1}}}
	log := []BattleLog{}
	got := applyDamage(&state, 40, "A", "B", &log, "attack")
	if got != 30 || state.HP != 20 {
		t.Fatalf("25%% shield: damage=%d hp=%d; want damage=30 hp=20", got, state.HP)
	}
	state.HP = 50
	state.Effects = []StatusEffect{{Type: "shield", Value: 100, TurnsLeft: 1}}
	got = applyDamage(&state, 40, "A", "B", &log, "attack")
	if got != 0 || state.HP != 50 {
		t.Fatalf("100%% shield: damage=%d hp=%d; want damage=0 hp=50", got, state.HP)
	}
}

func TestApplyDamageAllowsZeroAfterFullReduction(t *testing.T) {
	state := FighterState{HP: 50, MaxHP: 50}
	log := []BattleLog{}
	got := applyDamage(&state, 0, "A", "B", &log, "attack")
	if got != 0 || state.HP != 50 {
		t.Fatalf("zero damage: damage=%d hp=%d; want damage=0 hp=50", got, state.HP)
	}
}
