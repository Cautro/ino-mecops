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

		welcomeText := "Добро пожаловать в мир Ино-мекопов!\n\nАктивируй код с карточки, получай золото и собирай свою коллекцию."
		var replyMarkup *telego.InlineKeyboardMarkup

		if webAppURL != "" {
			replyMarkup = tu.InlineKeyboard(
				tu.InlineKeyboardRow(
					tu.InlineKeyboardButton("Открыть игру").WithWebApp(&telego.WebAppInfo{URL: webAppURL}),
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

func ValidateWebAppURL(raw string) error {
	u, err := url.ParseRequestURI(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fmt.Errorf("Mini App URL must use HTTPS")
	}
	return nil
}