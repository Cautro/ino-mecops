# Ино-мекопы — backend MVP

Backend на Go + `net/http` + PostgreSQL для Telegram Mini App. Реализовано:

- проверка подписи `Telegram.WebApp.initData` и `auth_date`;
- создание/обновление профиля по Telegram ID;
- активация одноразового промокода;
- начисление золота и запись транзакции в одной транзакции PostgreSQL;
- выдача существа `ino-sprout` по шаблону `mecop150`;
- админ API для генерации партий, просмотра статистики и отзыва партии;
- минимальный Telegram long-polling бот с `/start` и кнопкой Mini App.

Исходники React + TypeScript Mini App находятся в каталоге `frontend/`. Mini App отправляет исходный `Telegram.WebApp.initData` в заголовке `Authorization: tma <initData>`.

## 1. Требования

- Go 1.23+;
- PostgreSQL 14+;
- Telegram bot token от [@BotFather](https://t.me/BotFather);
- HTTPS URL для Mini App, когда фронтенд будет опубликован.

## 2. Настроить PostgreSQL

Создай базу и пользователя. Пример для локальной разработки:

```sql
CREATE USER inomecops WITH PASSWORD 'change-me';
CREATE DATABASE inomecops OWNER inomecops;
```

Примени миграцию из каталога `backend`:

```bash
psql "postgres://inomecops:change-me@localhost:5432/inomecops?sslmode=disable" -f migrations/001_init.sql
```

## 3. Переменные окружения

Скопируй `.env.example` в `.env`, подставь настоящие значения. Go сам не загружает `.env`, поэтому экспортируй переменные в окружение процесса или используй свой менеджер секретов/systemd `EnvironmentFile`.

- `BOT_TOKEN` — секретный токен BotFather;
- `DATABASE_URL` — DSN PostgreSQL;
- `WEBAPP_URL` — публичный HTTPS URL Mini App. Для локальной разработки укажи адрес фронтенда или оставь пустым до настройки веб-интерфейса;
- `ADMIN_TELEGRAM_IDS` — список числовых Telegram ID администраторов через запятую;
- `PORT` — HTTP-порт, по умолчанию `8080`.

Не коммить `.env` и не отправляй `BOT_TOKEN` во фронтенд.

## 4. Запуск

Из каталога `backend`:

```bash
go mod tidy
go test ./...
go run ./cmd/server
```

Проверка состояния:

```bash
curl http://localhost:8080/healthz
curl http://localhost:8080/readyz
```

`/healthz` проверяет, что HTTP-процесс работает; `/readyz` дополнительно проверяет соединение с PostgreSQL.

## 5. API

Все `/api/v1/...` требуют заголовка, полученного из Telegram Mini App:

```http
Authorization: tma <значение Telegram.WebApp.initData>
```

Нельзя брать пользователя из `initDataUnsafe` и отправлять его ID как доказательство личности: сервер проверяет исходный `initData` по HMAC с `BOT_TOKEN`.

### Профиль

`GET /api/v1/me`

Пример ответа:

```json
{
  "telegram_id": 123456789,
  "username": "example",
  "first_name": "Alex",
  "gold": 0,
  "created_at": "2026-01-01T10:00:00Z"
}
```

### Коллекция существ

`GET /api/v1/me/creatures`

Возвращает существ, полученных игроком-ино-мекопов, в поле `items`.

### Активировать код

`POST /api/v1/codes/redeem`

```json
{"code":"INOME-..."}
```

Примеры шаблонов: `gold50` = 50 золота, `gold500` = 500 золота, `mecop150` = 150 золота и `ino-sprout`.

### Создать партию (администратор)

`POST /api/v1/admin/code-batches`

```json
{
  "label": "Школьная партия №1",
  "count": 20,
  "reward_preset": "gold50",
  "expires_in_days": 7
}
```

`count`: 1–500. `expires_in_days`: 0 означает без срока действия, 1–365 задаёт срок. Ответ содержит исходные коды, чтобы их можно было сохранить в CSV. В базе остаются только хеши кодов: восстановить исходный код после потери ответа нельзя. Сохрани экспорт сразу после генерации.

### История партий (администратор)

`GET /api/v1/admin/code-batches?limit=50&offset=0`

### Отозвать партию (администратор)

`POST /api/v1/admin/code-batches/{id}/revoke`

После отзыва коды партии нельзя активировать; уже выданные награды не отзываются.

## 5.1 Frontend Mini App

```bash
cd frontend
npm install
npm run dev
```

Для локального preview без Telegram и backend создай `frontend/.env.local` с `VITE_DEMO_MODE=true`. Не разворачивай демо-режим в production. Полная инструкция — в `frontend/README.md`.

Frontend dev server работает на `http://localhost:5173` и проксирует `/api`, `/healthz` и `/readyz` на Go API `http://localhost:8080`. В production раздавай `frontend/dist` через HTTPS и проксируй `/api/` к Go backend на том же домене.

## 5.2 QR-карточки и автоматическая активация

В `frontend/.env.local` задай `VITE_TELEGRAM_BOT_USERNAME=your_bot_username` без `@`. В `@BotFather` настрой Main Mini App и укажи публичный HTTPS URL. Ссылка `https://t.me/<bot_username>?startapp=<CODE>` передаёт одноразовый код в Mini App; фронтенд автоматически отправляет его на `/api/v1/codes/redeem`.

После создания партии администратор может нажать **QR-карточки**, распечатать лист или сохранить его как PDF. CSV также содержит Telegram-ссылку для каждой карточки. Не распространяй CSV с неиспользованными кодами: код в QR может быть активирован любым человеком, получившим ссылку первым. В демо-режиме печать отключена.

## 6. Структура

```text
cmd/server/main.go
internal/config/
internal/features/auth/
internal/features/codes/
internal/features/admin_panel/
internal/router/
internal/services/
internal/telegram/
migrations/001_init.sql
```

Это монолит: функции разделены по фичам, но приложение запускается одним процессом.

## 7. Важные ограничения перед реальным запуском

- В MVP намеренно нет казино, дуэлей и пассивного дохода. Frontend пока реализует профиль, коллекцию, активацию кодов и управление партиями.
- Админка защищена allowlist-ом Telegram ID и проверенной подписью Mini App, а не скрытой кнопкой.
- Для школьного проекта не связывай игровые бонусы и призы с поддержкой конкретного кандидата или выбором ученика.
- Перед публичным запуском добавь rate limiting, аудит действий администраторов, резервное копирование БД, метрики и тесты интеграции с настоящим PostgreSQL.
- Никогда не логируй `Authorization` или исходный `initData`.
