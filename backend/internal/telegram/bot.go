package telegram

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const apiBase = "https://api.telegram.org/bot"

type updateResponse struct {
	OK          bool     `json:"ok"`
	Description string   `json:"description"`
	Result      []Update `json:"result"`
}

type Update struct {
	UpdateID int64    `json:"update_id"`
	Message  *Message `json:"message"`
}

type Message struct {
	Text string `json:"text"`
	Chat struct {
		ID int64 `json:"id"`
	} `json:"chat"`
}

type sendMessageRequest struct {
	ChatID      int64        `json:"chat_id"`
	Text        string       `json:"text"`
	ReplyMarkup *replyMarkup `json:"reply_markup,omitempty"`
}

type replyMarkup struct {
	InlineKeyboard [][]inlineButton `json:"inline_keyboard"`
}

type inlineButton struct {
	Text   string  `json:"text"`
	WebApp *webApp `json:"web_app,omitempty"`
}

type webApp struct {
	URL string `json:"url"`
}

func RunPollingBot(ctx context.Context, token, webAppURL string, logger *log.Logger) {
	client := &http.Client{Timeout: 40 * time.Second}
	var offset int64
	for ctx.Err() == nil {
		updates, err := getUpdates(ctx, client, token, offset)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			if logger != nil {
				logger.Printf("Telegram getUpdates failed: %v", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-time.After(2 * time.Second):
			}
			continue
		}
		for _, update := range updates {
			if update.UpdateID >= offset {
				offset = update.UpdateID + 1
			}
			if update.Message == nil || strings.TrimSpace(update.Message.Text) == "" {
				continue
			}
			text := strings.TrimSpace(update.Message.Text)
			command := strings.Fields(text)[0]
			if strings.Contains(command, "@") {
				command = strings.SplitN(command, "@", 2)[0]
			}
			if command != "/start" && command != "/help" {
				continue
			}
			if err := sendWelcome(ctx, client, token, webAppURL, update.Message.Chat.ID); err != nil && logger != nil {
				logger.Printf("Telegram sendMessage failed: %v", err)
			}
		}
	}
}

func getUpdates(ctx context.Context, client *http.Client, token string, offset int64) ([]Update, error) {
	endpoint := apiBase + token + "/getUpdates?timeout=25&allowed_updates=%5B%22message%22%5D"
	if offset > 0 {
		endpoint += fmt.Sprintf("&offset=%d", offset)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("Telegram returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var result updateResponse
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&result); err != nil {
		return nil, err
	}
	if !result.OK {
		return nil, fmt.Errorf("Telegram API: %s", result.Description)
	}
	return result.Result, nil
}

func sendWelcome(ctx context.Context, client *http.Client, token, webAppURL string, chatID int64) error {
	message := sendMessageRequest{ChatID: chatID, Text: "Добро пожаловать в мир Ино-мекопов!\n\nАктивируй код с карточки, получай золото и собирай свою коллекцию."}
	if webAppURL != "" {
		message.ReplyMarkup = &replyMarkup{InlineKeyboard: [][]inlineButton{{
			{Text: "Открыть игру", WebApp: &webApp{URL: webAppURL}},
		}}}
	} else {
		message.Text += "\n\nMini App пока не настроен."
	}
	payload, err := json.Marshal(message)
	if err != nil {
		return err
	}
	endpoint := apiBase + token + "/sendMessage"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("Telegram sendMessage returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return err
	}
	if !result.OK {
		return fmt.Errorf("Telegram sendMessage: %s", result.Description)
	}
	return nil
}

// ValidateWebAppURL is kept available for a future deployment/config UI.
func ValidateWebAppURL(raw string) error {
	u, err := url.ParseRequestURI(raw)
	if err != nil || u.Scheme != "https" || u.Host == "" {
		return fmt.Errorf("Mini App URL must use HTTPS")
	}
	return nil
}
