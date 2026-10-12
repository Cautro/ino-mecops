# Иномекопы — frontend

React + TypeScript + Vite. Интерфейс использует минималистичные карточки, нейтральную палитру и один зелёный акцент. Иномеконы отображаются только из загруженных пользователем PNG/JPEG/GIF-файлов или HTTPS-ссылок; персонажи не рисуются SVG/CSS кодом.

## Запуск

```bash
npm install
npm run dev
npm run build
```

Vite serves at `http://localhost:5173` and proxies `/api`, `/healthz`, `/readyz`, `/uploads` to the Go backend at `http://localhost:8080`.

Create `.env.local` for local preview:

```env
VITE_DEMO_MODE=true
VITE_TELEGRAM_BOT_USERNAME=your_bot_username
```

Demo mode keeps fake data in browser memory only. Never deploy with `VITE_DEMO_MODE=true`. Production needs Telegram Mini App and same-origin HTTPS proxy to the Go API. Images uploaded to the API are served from `/uploads/`, so Nginx must proxy this route too.

## Admin

The admin area has three tabs: **Иномеконы**, **Способности**, **Коды**. Creature forms save stats, rarity, assigned ability, description and uploaded image. Ability forms save element, power, hit chance, cooldown and optional effect characteristics. Four seeded abilities cannot be deleted; custom abilities cannot be removed while assigned to a creature.

Passive gold is accrued when the player profile is loaded, based on elapsed time and each creature’s acquisition time. The Arena supports player challenges, accepting/declining, turn-based basic attacks and abilities. The server calculates hit chance, critical damage, cooldowns, status effects, HP and winner; the client cannot choose damage or the winner. The game requires migration `003_gameplay.sql` after migrations `001` and `002`.
