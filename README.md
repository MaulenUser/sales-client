# Frontend — AI Sales Auditor

React/Vite интерфейс для отчета и запуска аудита продаж.

## Быстрый старт

Требования:
- Node.js 18+
- npm

Установка:

```bash
cd frontend
npm install
```

Запуск dev-сервера:

```bash
npm run dev
```

По умолчанию Vite поднимается на `http://127.0.0.1:5173`.

## Команды

```bash
npm run dev      # локальная разработка
npm run build    # production build в frontend/dist
npm run preview  # просмотр собранного dist
```

## Источники данных

Логика загрузки: `src/api/index.js`

Сейчас фронт работает в mock режиме:
- summary/interactions/report/usage: из mock-файлов в `public/`

Mock-файлы:
- `public/mock-app-state.json`
- `public/mock-aggregate-summary.json`
- `public/mock-interaction-index.json`
- `public/mock-sales-report.md`
- `public/mock-usage-summary.json`
- `public/mock-usage-events.json`


## Маршруты

Роутинг: `HashRouter` (`src/App.jsx`), основные пути:
- `/business` — настройка бизнеса
- `/launch` — запуск аудита
- `/report` — итоговый отчет
- `/history` — история анализов

Также доступны внутренние экраны аналитики:
- `/overview`, `/managers`, `/calls`, `/whatsapp`, `/explorer`, `/usage`

