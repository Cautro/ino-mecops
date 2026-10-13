package catalog

import (
	"encoding/json"
	"strings"
	"testing"
)

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

func TestCollectionSpeciesOmitsUndiscoveredData(t *testing.T) {
	item := Species{ID: 99, Slug: "secret-species", Name: "Секретный иномекон", Description: "Скрытая запись", ImageURL: "/uploads/secret.png", Rarity: "mythic", PassiveGoldPerHour: 900, Health: 500, Damage: 250, CritChance: 99, AbilityID: 7, AbilityName: "Тайная способность", AbilitySlug: "secret-ability"}
	locked := collectionSpecies(item, false)
	if !locked.Locked || locked.ID != item.ID {
		t.Fatalf("locked catalogue card should expose only its stable id and lock state: %#v", locked)
	}
	encoded, err := json.Marshal(locked)
	if err != nil {
		t.Fatal(err)
	}
	for _, privateValue := range []string{"secret-species", "Секретный иномекон", "/uploads/secret.png", "Тайная способность", "500", "250"} {
		if strings.Contains(string(encoded), privateValue) {
			t.Errorf("locked catalogue JSON leaked %q: %s", privateValue, encoded)
		}
	}
	if !strings.Contains(string(encoded), `"locked":true`) {
		t.Errorf("locked state missing from JSON: %s", encoded)
	}
}

func TestCollectionSpeciesIncludesOwnedData(t *testing.T) {
	item := Species{ID: 12, Slug: "known-one", Name: "Знакомый иномекон", Health: 100}
	card := collectionSpecies(item, true)
	if card.Locked || card.Slug == nil || *card.Slug != item.Slug || card.Name == nil || *card.Name != item.Name || card.Health == nil || *card.Health != item.Health {
		t.Fatalf("owned species should reveal full catalogue data: %#v", card)
	}
}
