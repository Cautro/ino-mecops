package shop

import "testing"

func TestValidEggRarities(t *testing.T) {
	cases := []string{"common", "rare", "epic", "legendary", "mythic"}
	for _, rarity := range cases {
		t.Run(rarity, func(t *testing.T) {
			if !validEggRarity(rarity) {
				t.Fatalf("validEggRarity(%q) = false; want true", rarity)
			}
		})
	}
}

func TestUnknownEggRarityIsRejected(t *testing.T) {
	if validEggRarity("ultra-secret") {
		t.Fatal("unknown rarity should not be purchasable")
	}
}

func TestOnlyCollectionContainerKindIsPurchasable(t *testing.T) {
	if !validEggKind("mystery") {
		t.Fatal("collection container should be purchasable")
	}
	for _, kind := range []string{"common", "rare", "epic", "legendary", "mythic", "unknown"} {
		if validEggKind(kind) {
			t.Errorf("legacy product kind %q should not be purchasable", kind)
		}
	}
}

func TestValidMysteryChances(t *testing.T) {
	good := map[string]int{"common": 60, "rare": 25, "epic": 10, "legendary": 4, "mythic": 1}
	if !validMysteryChances(good) {
		t.Fatal("validMysteryChances(default) = false; want true")
	}
	badTotal := map[string]int{"common": 60, "rare": 25, "epic": 10, "legendary": 5, "mythic": 1}
	if validMysteryChances(badTotal) {
		t.Fatal("chances summing to 101 should be rejected")
	}
	noMythic := map[string]int{"common": 61, "rare": 25, "epic": 10, "legendary": 4, "mythic": 0}
	if !validMysteryChances(noMythic) {
		t.Fatal("a rarity may be configured to 0% when the administrator chooses")
	}
}

func TestEffectiveMysteryChancesRenormalizeAvailableRarities(t *testing.T) {
	configured := map[string]int{"common": 60, "rare": 25, "epic": 10, "legendary": 4, "mythic": 1}
	got := effectiveMysteryChances(configured, map[string]int{"common": 1, "rare": 1, "epic": 1})
	total := 0
	for _, rarity := range []string{"common", "rare", "epic", "legendary", "mythic"} {
		total += got[rarity]
	}
	if total != 100 {
		t.Fatalf("effective chances total = %d; want 100, got %#v", total, got)
	}
	if got["common"] != 63 || got["rare"] != 26 || got["epic"] != 11 || got["legendary"] != 0 || got["mythic"] != 0 {
		t.Fatalf("unexpected effective chances: %#v", got)
	}
}

func TestEffectiveMysteryChancesFallbackWhenConfiguredRaritiesAreUnavailable(t *testing.T) {
	configured := map[string]int{"common": 0, "rare": 0, "epic": 0, "legendary": 99, "mythic": 1}
	got := effectiveMysteryChances(configured, map[string]int{"common": 1, "epic": 1})
	if got["common"] != 50 || got["epic"] != 50 {
		t.Fatalf("expected equal fallback weights for active rarities, got %#v", got)
	}
}
