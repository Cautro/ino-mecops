package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Config struct {
	BotToken                       string
	DatabaseURL                    string
	WebAppURL                      string
	UploadDir                      string
	Port                           string
	AdminIDs                       map[int64]struct{}
	SubscriptionURL                string
	SubscriptionChatID             string
	SubscriptionTitle              string
	SubscriptionMessage            string
	SubscriptionRewardGold         int64
	SubscriptionRewardCreatureSlug string
}

func Load() (Config, error) {
	cfg := Config{
		BotToken:                       strings.TrimSpace(os.Getenv("BOT_TOKEN")),
		DatabaseURL:                    strings.TrimSpace(os.Getenv("DATABASE_URL")),
		WebAppURL:                      strings.TrimSpace(os.Getenv("WEBAPP_URL")),
		UploadDir:                      strings.TrimSpace(os.Getenv("UPLOAD_DIR")),
		Port:                           strings.TrimSpace(os.Getenv("PORT")),
		SubscriptionURL:                strings.TrimSpace(os.Getenv("SUBSCRIPTION_URL")),
		SubscriptionChatID:             strings.TrimSpace(os.Getenv("SUBSCRIPTION_CHAT_ID")),
		SubscriptionTitle:              strings.TrimSpace(os.Getenv("SUBSCRIPTION_TITLE")),
		SubscriptionMessage:            strings.TrimSpace(os.Getenv("SUBSCRIPTION_MESSAGE")),
		SubscriptionRewardCreatureSlug: strings.TrimSpace(os.Getenv("SUBSCRIPTION_REWARD_CREATURE_SLUG")),
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	if cfg.UploadDir == "" {
		cfg.UploadDir = "/var/lib/inomecops/uploads"
	} else if !filepath.IsAbs(cfg.UploadDir) {
		// systemd does not guarantee a working directory; resolve relative paths
		// against the deployment root next to /bin/inomecops.
		if executable, err := os.Executable(); err == nil {
			appRoot := filepath.Dir(filepath.Dir(executable))
			cfg.UploadDir = filepath.Join(appRoot, cfg.UploadDir)
		} else if absolute, err := filepath.Abs(cfg.UploadDir); err == nil {
			cfg.UploadDir = absolute
		}
	}
	if raw := strings.TrimSpace(os.Getenv("SUBSCRIPTION_REWARD_GOLD")); raw != "" {
		reward, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || reward < 0 || reward > 100_000_000 {
			return Config{}, errors.New("SUBSCRIPTION_REWARD_GOLD must be between 0 and 100000000")
		}
		cfg.SubscriptionRewardGold = reward
	}
	if cfg.SubscriptionURL != "" {
		u, err := url.ParseRequestURI(cfg.SubscriptionURL)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			return Config{}, errors.New("SUBSCRIPTION_URL must be a public HTTPS URL")
		}
	}

	if _, err := strconv.Atoi(cfg.Port); err != nil {
		return Config{}, fmt.Errorf("PORT must be a number: %w", err)
	}
	if cfg.Port == "0" || strings.HasPrefix(cfg.Port, "-") || strings.Contains(cfg.Port, " ") {
		return Config{}, errors.New("PORT must be between 1 and 65535")
	}
	port, _ := strconv.Atoi(cfg.Port)
	if port < 1 || port > 65535 {
		return Config{}, errors.New("PORT must be between 1 and 65535")
	}
	if cfg.BotToken == "" {
		return Config{}, errors.New("BOT_TOKEN is required")
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if cfg.WebAppURL != "" {
		u, err := url.ParseRequestURI(cfg.WebAppURL)
		if err != nil || u.Scheme != "https" || u.Host == "" {
			return Config{}, errors.New("WEBAPP_URL must be a public HTTPS URL")
		}
	}

	cfg.AdminIDs = make(map[int64]struct{})
	for _, raw := range strings.Split(os.Getenv("ADMIN_TELEGRAM_IDS"), ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		id, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || id <= 0 {
			return Config{}, fmt.Errorf("invalid Telegram ID in ADMIN_TELEGRAM_IDS: %q", raw)
		}
		cfg.AdminIDs[id] = struct{}{}
	}
	if len(cfg.AdminIDs) == 0 {
		return Config{}, errors.New("ADMIN_TELEGRAM_IDS must contain at least one Telegram user ID")
	}
	return cfg, nil
}
