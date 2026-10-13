# Иномекопы — backend и Telegram Mini App

Монолит на Go (`net/http`) + PostgreSQL (`pgx`) и frontend на React + TypeScript + Vite. Код разделён на функциональные блоки; бот, API и Mini App используют одну базу.

## Функции

- Telegram Mini App авторизация: сервер проверяет исходный `initData` по токену бота.
- Игроки, золото, одноразовые коды и выдача иномеконов.
- Партии кодов с QR-ссылками, CSV-экспортом и отзывом партии.
- Каталог видов иномеконов: изображение PNG/JPEG/GIF, редкость, пассивное золото/час, здоровье, урон, шанс критического удара и назначенная способность.
- Каталог способностей: сила, точность, перезарядка в секундах, эффект, сила и длительность эффекта в ходах.
- Слот-машина: ставки золотом, выплаты за пары и тройки символов, джекпот с новым иномеконом. Результат, выплата и списание ставки рассчитываются на backend в одной транзакции.
- Пассивный доход начисляется при чтении игрового профиля. Доли меньше одного золота сохраняются, чтобы начисления не терялись из-за частых запросов. Учитывается время получения каждого существа.

## Структура

```text
cmd/server/                    запуск API и Telegram-бота
internal/features/auth/       Telegram auth и профиль
internal/features/codes/      промокоды и коллекция
internal/features/admin_panel/ управление партиями кодов
internal/features/catalog/    каталог существ/способностей и изображения
internal/features/gameplay/   пассивный доход и слот-машина
internal/router/               HTTP routes
migrations/                    SQL migrations
frontend/                       React + TypeScript + Vite
```

## Требования

- Go 1.27.2+ (версия указана в `go.mod`)
- PostgreSQL
- Node.js и npm для сборки frontend
- Telegram bot token от `@BotFather`

## Миграции БД

Применяй миграции по порядку, по одному разу. Если `001`–`004` уже применены, **не запускай их повторно** — выполни только новую `005_slot_machine.sql`. Если `001`–`003` уже применены, сначала выполни `004_retain_batch_code_values.sql`, а затем `005_slot_machine.sql`.

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d ИМЯ_БАЗЫ -f migrations/001_init.sql
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d ИМЯ_БАЗЫ -f migrations/002_creature_catalog.sql
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d ИМЯ_БАЗЫ -f migrations/003_gameplay.sql
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d ИМЯ_БАЗЫ -f migrations/004_retain_batch_code_values.sql
sudo -u postgres psql -X -v ON_ERROR_STOP=1 -d ИМЯ_БАЗЫ -f migrations/005_slot_machine.sql
```

`003_gameplay.sql` добавляет поля пассивного дохода и таблицу `game_battles`, а длительность эффектов способностей переименовывает из секунд в ходы. `004_retain_batch_code_values.sql` позволяет повторно открыть коды партии в админке после обновления Mini App. Коды, выпущенные до `004`, восстановить нельзя: ранее в БД сохранялись только их хеши. `005_slot_machine.sql` снимает требование промокода для выдачи иномекона из джекпота, добавляет типы транзакций слота и журнал прокруток, а также удаляет старую таблицу PvP-боёв.

## Запуск backend

Передай переменные окружения (Go автоматически не загружает `.env`):

```env
BOT_TOKEN=...
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/DB_NAME?sslmode=disable
WEBAPP_URL=https://game.example.ru
ADMIN_TELEGRAM_IDS=123456789
PORT=8080
UPLOAD_DIR=/absolute/path/to/inomecops/uploads
```

Создай `UPLOAD_DIR` и дай пользователю процесса Go право записи. Затем из каталога с `go.mod`:

```bash
go mod tidy
go test ./...
go run ./cmd/server
```

Для production запускай через systemd и настрой HTTPS reverse proxy. Nginx должен передавать `/api/`, `/healthz`, `/readyz` и `/uploads/` на Go backend. Храни `.env`/секреты вне Git.

## Запуск frontend

```bash
cd frontend
npm install
npm run build
npm run dev
```

Vite проксирует `/api`, `/healthz`, `/readyz` и `/uploads` на `http://localhost:8080`.

Для локального просмотра интерфейса без Telegram создай `frontend/.env.local`:

```env
VITE_DEMO_MODE=true
VITE_TELEGRAM_BOT_USERNAME=your_bot_username
```

Демо-режим использует фиктивные данные в браузере; не включай его в production. Для настоящего Mini App требуется публичный HTTPS URL, настроенный у бота, и оригинальный `Telegram.WebApp.initData`.

## Пассивный доход

`GET /api/v1/game/overview` под блокировкой строки игрока вычисляет доход с момента предыдущего начисления, добавляет целые монеты к `players.gold`, сохраняет дробный остаток и записывает операцию в `wallet_transactions` с типом `passive_income`. Приход рассчитывается за время владения каждым конкретным экземпляром иномекона, поэтому новый иномекон не выдаёт доход задним числом. Игрок должен открыть Mini App или обновлять профиль: отдельный фоновой worker для автономного начисления пока не нужен.

## Правила слот-машины

- Ставка: от 10 до 10000 золота за прокрутку.
- Любые два одинаковых символа возвращают 1,2× ставки.
- Три вишни выплачивают 4×, лимоны — 5×, алмазы — 7×, звёзды — 10×.
- Три символа 🧬 выплачивают 15× ставки и выдают случайного активного иномекона из каталога, если он доступен.
- Случайные символы генерируются на backend через криптографический генератор. Клиент не присылает результат или размер выплаты.
- Списание ставки, выплата, выдача существа и запись результата происходят в одной PostgreSQL-транзакции.

## API игрового процесса

Все endpoints требуют авторизацию Telegram Mini App.

| Метод | Endpoint | Назначение |
|---|---|---|
| `GET` | `/api/v1/game/overview` | Профиль, баланс и начисление пассивного дохода |
| `POST` | `/api/v1/game/slot` | Одна прокрутка (`{"bet":50}`), ответ содержит символы, выплату, баланс и необязательный `creature_slug` |

## API каталога

Административные запросы требуют проверенную Telegram Mini App авторизацию и ID из `ADMIN_TELEGRAM_IDS`.

| Метод | Endpoint | Назначение |
|---|---|---|
| `GET` | `/api/v1/admin/abilities` | Список способностей |
| `POST` | `/api/v1/admin/abilities` | Создать способность |
| `PUT` | `/api/v1/admin/abilities/{id}` | Обновить способность |
| `DELETE` | `/api/v1/admin/abilities/{id}` | Удалить свою способность, если она не назначена существам |
| `GET` | `/api/v1/admin/creatures` | Каталог видов, включая архивные |
| `POST` | `/api/v1/admin/creatures` | Создать вид |
| `PUT` | `/api/v1/admin/creatures/{id}` | Обновить характеристики вида |
| `DELETE` | `/api/v1/admin/creatures/{id}` | Архивировать вид без потери истории |
| `POST` | `/api/v1/admin/uploads/images` | Загрузить изображение, multipart field `image` |
| `GET` | `/api/v1/admin/code-batches/{id}/codes` | Открыть и повторно экспортировать коды партии |
| `DELETE` | `/api/v1/admin/code-batches/{id}` | Удалить партию без активированных кодов |
| `GET` | `/api/v1/catalog/creatures` | Активные виды для игры |

Виды редкости: `common`, `rare`, `epic`, `legendary`, `mythic`. Стихии: `meteor`, `wind`, `earth`, `water`, `arcane`, `custom`. Эффекты: `none`, `burn`, `slow`, `stun`, `weaken`, `shield`.

## Проверки перед публикацией

```bash
go test ./...
cd frontend && npm run build
```

Перед публикацией проверь ставку на реальном профиле, выигрышную выплату, джекпот с выдачей иномекона и списание золота при проигрыше. Дополнительно проверь пассивное начисление после повторного открытия профиля.
