package gameplay

import (
	"crypto/rand"
	"math/big"
	"time"
)

func randomPercent() float64 {
	n, err := rand.Int(rand.Reader, big.NewInt(10000))
	if err != nil {
		return 50
	}
	return float64(n.Int64()) / 100
}

func rollChance(chance float64) bool { return randomPercent() < chance }

func applyDamage(state *FighterState, amount int, attackerName, targetName string, log *[]BattleLog, kind string) int {
	if amount < 0 {
		amount = 0
	}
	reduction := 0
	for _, effect := range state.Effects {
		if effect.Type == "shield" && effect.TurnsLeft > 0 && effect.Value > reduction {
			reduction = effect.Value
		}
	}
	if reduction >= 100 {
		amount = 0
	} else if reduction > 0 {
		amount = amount * (100 - reduction) / 100
	}
	if amount < 0 {
		amount = 0
	}
	if amount > state.HP {
		amount = state.HP
	}
	state.HP -= amount
	*log = append(*log, BattleLog{At: time.Now().UTC(), Type: kind, Message: attackerName + " наносит " + targetName + " " + itoa(amount) + " урона."})
	return amount
}

func addEffect(state *FighterState, effect StatusEffect) {
	for i := range state.Effects {
		if state.Effects[i].Type == effect.Type {
			if effect.TurnsLeft > state.Effects[i].TurnsLeft {
				state.Effects[i].TurnsLeft = effect.TurnsLeft
			}
			state.Effects[i].Value = effect.Value
			state.Effects[i].DamagePerTurn = effect.DamagePerTurn
			return
		}
	}
	state.Effects = append(state.Effects, effect)
}

func decrementEffects(state *FighterState) {
	active := state.Effects[:0]
	for _, effect := range state.Effects {
		effect.TurnsLeft--
		if effect.TurnsLeft > 0 {
			active = append(active, effect)
		}
	}
	state.Effects = active
}

func turnsForDuration(value int) int {
	if value < 1 {
		return 1
	}
	return value
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	buf := [20]byte{}
	i := len(buf)
	for value > 0 {
		i--
		buf[i] = byte('0' + value%10)
		value /= 10
	}
	return string(buf[i:])
}
