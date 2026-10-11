# Ино-мекопы — frontend

React + TypeScript + Vite UI for the Go backend in `../`.

## Requirements

- Node.js 20.19+ or 22.12+
- Go backend running on `http://localhost:8080` for live API mode

## Install and run

```bash
cd frontend
npm install
npm run dev
```

Vite serves the frontend at `http://localhost:5173` and proxies `/api`, `/healthz`, and `/readyz` to `http://localhost:8080`.

Open this through Telegram Mini App for real auth: frontend sends the original `Telegram.WebApp.initData` as `Authorization: tma <initData>`. It never uses `initDataUnsafe` to authenticate.

## Preview without Telegram/backend

Create `.env.local`:

```env
VITE_DEMO_MODE=true
```

Restart `npm run dev`. This uses local in-memory mock responses so you can inspect the design and try forms. Codes, balances and batches in demo mode are fake; the mock is only for local UI preview. Do **not** deploy with `VITE_DEMO_MODE=true`.


## QR-карточки и автоматическая активация

1. Открой `frontend/.env.local` (создай файл, если его нет) и добавь username бота без `@`:

   ```env
   VITE_TELEGRAM_BOT_USERNAME=your_bot_username
   VITE_DEMO_MODE=false
   ```

2. В `@BotFather` настрой бота как **Main Mini App** и укажи его публичный HTTPS URL. Ссылка формата `https://t.me/<bot_username>?startapp=<CODE>` передаёт `CODE` в Mini App как `start_param`.
3. Перезапусти Vite / пересобери фронтенд после изменения env.
4. В Telegram открой административную панель, создай реальную партию и нажми **QR-карточки**. Откроется лист для печати; в диалоге печати можно выбрать сохранение в PDF. CSV также содержит колонку `telegram_startapp_url`.
5. При сканировании QR откроется Mini App и код автоматически отправится на `POST /api/v1/codes/redeem`. Пользователю не нужно вводить его вручную.

QR содержит сам одноразовый код в стартовой ссылке: любой, кто получит копию QR, может попытаться активировать код первым. Не публикуй файлы/CSV с нераспределёнными кодами. QR-карточки отключены в демо-режиме, поскольку демо-коды не существуют в базе.

## Production build

```bash
npm run build
```

Vite writes the static files to `dist/`. Serve them with Nginx (or another static web server) at the Mini App HTTPS URL. Proxy `/api/` to the Go backend on the same origin. The frontend uses relative API paths, so no CORS configuration is needed when served this way.

## API endpoints used

- `GET /api/v1/me`
- `GET /api/v1/me/creatures`
- `POST /api/v1/codes/redeem`
- `GET /api/v1/admin/code-batches?limit=50&offset=0`
- `POST /api/v1/admin/code-batches`
- `POST /api/v1/admin/code-batches/{id}/revoke`

The admin screen is shown only if the backend grants access to the code-batches endpoint. The backend must remain responsible for access control; frontend navigation is not a security boundary.
