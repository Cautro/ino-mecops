# Иномекопы — backend и Telegram Mini App

Монолит на Go (`net/http`) + PostgreSQL и frontend на React + TypeScript + Vite. Бот, API и Mini App используют одну базу данных.

## Текущие игровые функции

- Telegram Mini App авторизация с проверкой исходного `initData` на backend.
- Коллекционные контейнеры: контейнер покупается за внутриигровое золото, показывает шансы до открытия и гарантированно выдаёт одного активного иномекона. Открытие не требует дополнительной ставки и не отнимает уже имеющиеся предметы.
- Получение иномеконов через коллекционные контейнеры и одноразовые промо-/QR-коды.
- Админ-панель: каталог видов, дробные характеристики и коэффициенты бонусов, картинки, цена продажи, настройки контейнера, создание/просмотр/отзыв партий кодов.
- Случайные партии QR-кодов: число кодов задаётся администратором; для каждого кода на генерации фиксируется независимая награда в заданном диапазоне золота и/или иномекон выбранной редкости. QR можно открыть из истории партии и распечатать.
- Персональный слот основного иномекона с настраиваемым бонусом: редкость контейнера, бонусное золото или пассивный доход.
- Лидерборд пассивного дохода, накопительных расходов на контейнеры и будущей боевой лиги. Боевая лига пока обозначена «В скором будущем»; боёвка не реализована.
- Метрики API и игровые бизнес-метрики для Prometheus, dashboards и alerts для Grafana.
- Сбор ошибок: причины транзакционных ошибок пишутся в backend-журнал, HTTP-статусы и бизнес-счётчики доступны в метриках.

Старая система ставок/прокруток отключена в пользовательском API. Это не следует использовать для маскировки азартной механики: при публикации всё равно соблюдай актуальные требования Telegram и применимые правила для случайных наград.

## Структура

```text
cmd/server/                    запуск API и Telegram-бота
internal/features/auth/       Telegram auth и профиль
internal/features/codes/      промокоды и коллекция
internal/features/admin_panel/ управление партиями кодов
internal/features/catalog/    каталог существ и изображения
internal/features/gameplay/   пассивный доход, основной иномекон и рейтинги
internal/features/shop/       коллекционные контейнеры и продажа экземпляров
internal/metrics/              HTTP и бизнес-метрики
internal/router/               HTTP routes
migrations/                    SQL migrations
frontend/                       React + TypeScript + Vite
monitoring/                     Prometheus + Grafana provisioning
```

## Требования

- Go 1.27.2+ (версия указана в `go.mod`)
- PostgreSQL
- Node.js и npm для frontend
- Telegram bot token от `@BotFather`
- Docker Engine + Docker Compose для мониторинга

## Миграции БД

Для новой базы применяй миграции `001`–`012` строго по порядку и по одному разу. Для существующего проекта, у которого уже применены `001`–`011`, выполни **только** миграцию `012_lootboxes_decimal_stats_random_qr_rewards.sql` один раз:

```bash
sudo -u postgres psql -X -v ON_ERROR_STOP=1 \
  -d inomecops \
  -f /opt/ino-mecops/backend/migrations/012_lootboxes_decimal_stats_random_qr_rewards.sql
```

`012` преобразует старые редкости контейнеров в единый тип `mystery`, переводит характеристики в числовые типы с дробной частью, вводит накопительную статистику расходов и случайные индивидуальные награды для кодов. Исторические таблицы ставок оставлены для сохранности старых записей, но маршруты старого режима отключены. Не повторяй миграции `001`–`011` на работающей базе.

## Запуск backend

Переменные задаются в окружении процесса (Go автоматически не загружает `.env`):

```env
BOT_TOKEN=...
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/inomecops?sslmode=disable
WEBAPP_URL=https://game.example.ru
ADMIN_TELEGRAM_IDS=123456789
PORT=8080
UPLOAD_DIR=/var/lib/inomecops/uploads
```

На production сервере каталог загрузок должен принадлежать пользователю сервиса, а systemd должен разрешать запись в этот путь. Nginx должен передавать `/api/`, `/healthz`, `/readyz` и `/uploads/` на Go backend. Не коммить `.env`, токены, пароли или `node_modules`.

```bash
cd /opt/ino-mecops/backend
go build -o /opt/ino-mecops/bin/inomecops ./cmd/server
sudo systemctl restart inomecops
```

## Запуск frontend

```bash
cd /opt/ino-mecops/frontend
npm install
npm run build
```

Для локального просмотра без Telegram можно использовать `VITE_DEMO_MODE=true`; не включай деморежим в production. Если QR должен открывать бота автоматически, настрой `VITE_TELEGRAM_BOT_USERNAME` без `@` перед production-сборкой.

## API игрового процесса

Все endpoints ниже требуют Telegram Mini App авторизацию, кроме публичных health/metrics endpoints.

| Метод | Endpoint | Назначение |
|---|---|---|
| `GET` | `/api/v1/game/overview` | Баланс, профиль и расчёт пассивного дохода |
| `GET` | `/api/v1/game/main-slot` | Основной иномекон и доступные экземпляры |
| `PUT` | `/api/v1/game/main-slot` | Установить основного иномекона |
| `DELETE` | `/api/v1/game/main-slot` | Освободить основной слот |
| `GET` | `/api/v1/game/leaderboards` | Лидерборды и placeholder будущих боёв |
| `GET` | `/api/v1/shop` | Единый коллекционный контейнер и инвентарь |
| `POST` | `/api/v1/shop/lootboxes/buy` | Купить контейнер за внутриигровое золото |
| `POST` | `/api/v1/shop/lootboxes/{id}/open` | Открыть контейнер и получить иномекона |
| `POST` | `/api/v1/shop/creatures/{id}/sell` | Продать конкретный экземпляр по заданной администратором цене |
| `POST` | `/api/v1/codes/redeem` | Активировать одноразовый промо-/QR-код |
| `GET` | `/healthz` | Liveness healthcheck |
| `GET` | `/readyz` | Readiness healthcheck |
| `GET` | `/metrics` | Prometheus HTTP + business metrics |

Список административных endpoints смотри в маршрутизаторе и обработчиках `internal/features/admin_panel`, `catalog` и `shop`. Админские маршруты дополнительно проверяют `ADMIN_TELEGRAM_IDS`.

## Мониторинг и ошибки

В `monitoring/` лежат Compose-конфигурация, scrape jobs, Grafana datasource/dashboard и alert rules. На этом VPS Prometheus опубликован на `127.0.0.1:9091:9090`, потому что серверный порт 9090 занят другим сервисом. Внутренний URL datasource Grafana остаётся `http://prometheus:9090`. Не открывай интерфейсы мониторинга в интернет без отдельной аутентификации; используй SSH-туннель.

```bash
cd /opt/ino-mecops/monitoring
cp .env.example .env   # только при первом запуске, не затирай существующий пароль
# установи свой GRAFANA_ADMIN_PASSWORD в .env
docker compose config
docker compose up -d
docker compose ps
```

## Проверки перед публикацией

```bash
cd backend && go test ./...
cd ../frontend && npm run build
```

После деплоя проверь покупку/открытие контейнера, дробные значения иномекона, QR-код с индивидуальной случайной наградой, основной слот, лидерборды, `/metrics` и `monitoring/prometheus/targets`.
