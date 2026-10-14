package telegram

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"strings"

	"github.com/mymmrac/telego"
	th "github.com/mymmrac/telego/telegohandler"
	tu "github.com/mymmrac/telego/telegoutil"
)

func RunPollingBot(ctx context.Context, token, webAppURL string, logger *log.Logger) {
	bot, err := telego.NewBot(token)
	if err != nil {
		if logger != nil {
			logger.Printf("Failed to create telego bot: %v", err)
		}
		return
	}

	updates, err := bot.UpdatesViaLongPolling(ctx, &telego.GetUpdatesParams{
		Timeout:        25,
		AllowedUpdates: []string{"message"},
	})
	if err != nil {
		if logger != nil {
			logger.Printf("Failed to start long polling: %v", err)
		}
		return
	}

	bh, err := th.NewBotHandler(bot, updates)
	if err != nil {
		if logger != nil {
			logger.Printf("Failed to create bot handlers: %v", err)
		}
		return
	}
	defer func() {
		_ = bh.Stop()
	}()

	bh.Handle(func(ctx *th.Context, update telego.Update) error {
		msg := update.Message
		if msg == nil || strings.TrimSpace(msg.Text) == "" {
			return nil
		}

		text := strings.TrimSpace(msg.Text)
		command := strings.Fields(text)[0]
		if strings.Contains(command, "@") {
			command = strings.SplitN(command, "@", 2)[0]
		}

		if command != "/start" && command != "/help" {
			return nil
		}

		fields := strings.Fields(text)
		startPayload := ""
		if command == "/start" && len(fields) > 1 {
			candidate := strings.TrimSpace(fields[1])
			if len(candidate) <= 64 && validStartPayload(candidate) {
				startPayload = candidate
			}
		}
		welcomeText := "Добро пожаловать в мир Ино-мекопов!\n\nАктивируй код с карточки, получай золото и собирай свою коллекцию."
		buttonText := "Открыть игру"
		launchURL := webAppURL
		if startPayload != "" {
			welcomeText = "Ты открыл карточку с кодом. Нажми кнопку ниже, чтобы проверить и получить награду."
			buttonText = "Открыть игру и забрать награду"
			if parsed, parseErr := url.Parse(webAppURL); parseErr == nil {
				query := parsed.Query()
				query.Set("startapp", startPayload)
				parsed.RawQuery = query.Encode()
				launchURL = parsed.String()
			}
		}
		var replyMarkup *telego.InlineKeyboardMarkup

		if launchURL != "" {
			replyMarkup = tu.InlineKeyboard(
				tu.InlineKeyboardRow(
					tu.InlineKeyboardButton(buttonText).WithWebApp(&telego.WebAppInfo{URL: launchURL}),
				),
			)
		} else {
			welcomeText += "\n\nMini App пока не настроен."
		}

		_, err := bot.SendMessage(ctx, &telego.SendMessageParams{
			ChatID:      tu.ID(msg.Chat.ID),
			Text:        welcomeText,
			ReplyMarkup: replyMarkup,
		})
		if err != nil && logger != nil {
			logger.Printf("Telegram sendMessage failed: %v", err)
		}
		return nil
	}, th.AnyMessage())

	go bh.Start()
	<-ctx.Done()
}

func validStartPayload(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if !((r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_') {
			return false
		}
	}
	return true
}

func ValidateWebAppURL(raw string) error {
	u, err := url.ParseRequestURI(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fmt.Errorf("Mini App URL must use HTTPS")
	}
	return nil
}
