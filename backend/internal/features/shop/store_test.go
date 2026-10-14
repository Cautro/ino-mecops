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
