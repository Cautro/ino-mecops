package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

func makeTestInitData(values url.Values, token string) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		if key != "hash" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, key+"="+values.Get(key))
	}
	secret := hmac.New(sha256.New, []byte("WebAppData"))
	secret.Write([]byte(token))
	mac := hmac.New(sha256.New, secret.Sum(nil))
	mac.Write([]byte(strings.Join(parts, "\n")))
	values.Set("hash", hex.EncodeToString(mac.Sum(nil)))
	return values.Encode()
}

func TestValidateInitDataValid(t *testing.T) {
	now := time.Now().UTC()
	values := url.Values{
		"auth_date": {unixString(now.Unix())},
		"user":      {`{"id":123456,"first_name":"Test","username":"tester"}`},
	}
	const token = "test-token"
	raw := makeTestInitData(values, token)
	user, err := ValidateInitData(raw, token, time.Hour, now)
	if err != nil {
		t.Fatalf("ValidateInitData() error = %v", err)
	}
	if user.ID != 123456 || user.Username != "tester" || user.FirstName != "Test" {
		t.Fatalf("unexpected user: %+v", user)
	}
}

func TestValidateInitDataRejectsTampering(t *testing.T) {
	now := time.Now().UTC()
	values := url.Values{
		"auth_date": {unixString(now.Unix())},
		"user":      {`{"id":123456,"first_name":"Test"}`},
	}
	raw := makeTestInitData(values, "test-token")
	parsed, _ := url.ParseQuery(raw)
	parsed.Set("user", `{"id":999999,"first_name":"Attacker"}`)
	if _, err := ValidateInitData(parsed.Encode(), "test-token", time.Hour, now); err == nil {
		t.Fatal("expected tampered init data to be rejected")
	}
}

func TestValidateInitDataRejectsExpired(t *testing.T) {
	now := time.Now().UTC()
	values := url.Values{
		"auth_date": {unixString(now.Add(-2 * time.Hour).Unix())},
		"user":      {`{"id":123456,"first_name":"Test"}`},
	}
	raw := makeTestInitData(values, "test-token")
	if _, err := ValidateInitData(raw, "test-token", time.Hour, now); err != ErrExpiredInitData {
		t.Fatalf("expected ErrExpiredInitData, got %v", err)
	}
}

func unixString(value int64) string {
	return strconv.FormatInt(value, 10)
}
