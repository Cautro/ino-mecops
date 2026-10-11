package catalog

import "testing"

func TestValidateAbilityInput(t *testing.T) {
	tests := []struct {
		name                              string
		slug, title, description, element string
		power                             int
		accuracy                          float64
		cooldown                          int
		effect                            string
		effectValue, effectDuration       int
		valid                             bool
	}{
		{name: "valid ability", slug: "ice-burst", title: "Ледяной всплеск", description: "", element: "water", power: 25, accuracy: 90, cooldown: 10, effect: "none", valid: true},
		{name: "invalid slug uppercase", slug: "Ice-Burst", title: "Ледяной всплеск", element: "water", power: 25, accuracy: 90, cooldown: 10, effect: "none", valid: false},
		{name: "invalid accuracy", slug: "ice-burst", title: "Ледяной всплеск", element: "water", power: 25, accuracy: 101, cooldown: 10, effect: "none", valid: false},
		{name: "effect must have values", slug: "ice-burst", title: "Ледяной всплеск", element: "water", power: 25, accuracy: 90, cooldown: 10, effect: "slow", valid: false},
		{name: "valid effect", slug: "ice-burst", title: "Ледяной всплеск", element: "water", power: 25, accuracy: 90, cooldown: 10, effect: "slow", effectValue: 20, effectDuration: 3, valid: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			err := validateAbilityInput(test.slug, test.title, test.description, test.element, test.power, test.accuracy, test.cooldown, test.effect, test.effectValue, test.effectDuration)
			if (err == nil) != test.valid {
				t.Fatalf("validateAbilityInput() error = %v, valid = %v", err, test.valid)
			}
		})
	}
}

func TestValidImageURL(t *testing.T) {
	for _, test := range []struct {
		value string
		want  bool
	}{
		{"", true}, {"/uploads/abc.png", true}, {"https://cdn.example.test/creature.png", true}, {"http://cdn.example.test/creature.png", false}, {"javascript:alert(1)", false}, {"/uploads/../secret", false},
	} {
		if got := validImageURL(test.value); got != test.want {
			t.Errorf("validImageURL(%q) = %v, want %v", test.value, got, test.want)
		}
	}
}
