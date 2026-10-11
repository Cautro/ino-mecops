package admin_panel

import (
	"regexp"
	"testing"
)

func TestRewardForPreset(t *testing.T) {
	tests := []struct {
		name      string
		gold      int64
		creature  string
		wantError bool
	}{
		{name: "gold50", gold: 50},
		{name: "gold500", gold: 500},
		{name: "mecop150", gold: 150, creature: "ino-sprout"},
		{name: "unknown", wantError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			reward, err := rewardForPreset(test.name)
			if test.wantError {
				if err == nil {
					t.Fatal("expected invalid preset error")
				}
				return
			}
			if err != nil {
				t.Fatalf("rewardForPreset() error = %v", err)
			}
			if reward.Gold != test.gold || reward.CreatureSlug != test.creature {
				t.Fatalf("unexpected reward: %+v", reward)
			}
		})
	}
}

func TestGenerateCodeFormatAndUniqueness(t *testing.T) {
	pattern := regexp.MustCompile(`^INOME-[A-Z2-7]{26}$`)
	seen := make(map[string]struct{}, 500)
	for i := 0; i < 500; i++ {
		code, err := generateCode()
		if err != nil {
			t.Fatalf("generateCode() error = %v", err)
		}
		if !pattern.MatchString(code) {
			t.Fatalf("unexpected code format: %q", code)
		}
		if _, exists := seen[code]; exists {
			t.Fatalf("duplicate generated code: %q", code)
		}
		seen[code] = struct{}{}
	}
}
