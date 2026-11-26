# Блокчейн-технологии

- [Лабораторная № 1](lab1/README.md) — учебный токен StudyToken. Исходник можно вставить в Remix и развернуть в Remix VM.
- [Лабораторная № 2](lab2/README.md) — папка для отдельного отчёта о Solana.
- [ProjectMatch](coursework/docs/REPORT.md) — каталог студенческих проектов с заявками в локальной EVM и подбором по навыкам и интересам.

## Структура

```text
lab1/contracts/             StudyToken.sol
lab2/                       Место для Solana_analiz.docx
coursework/blockchain/      Контракт, тесты Hardhat, развёртывание, seed и демо
coursework/backend/         FastAPI, ранжирование TF-IDF, pytest и оценка
coursework/frontend/        React, TypeScript, ethers v6 и тесты Playwright
coursework/data/            12 проектов и 10 размеченных синтетических профилей
coursework/docs/            Записка, архитектура, защита, метрики, снимки
```

## Подготовка

Установите Node.js 22 LTS версии 22.12 или новее и Python 3.11 или 3.12. Поддерживается Node.js 24. Проверка выполнена на Windows с Node.js 24.16.0, npm 11.13.0 и Python 3.11.9. Для первой установки нужны npm и PyPI. Дальнейший запуск модели и цепочки полностью локальный.

Выполните установку из корня репозитория. В PowerShell используется `npm.cmd`, чтобы команды работали при отключённом запуске `npm.ps1`.

**Windows PowerShell**

```powershell
npm.cmd --prefix coursework/blockchain ci
npm.cmd --prefix coursework/frontend ci
py -3.11 -m venv coursework/backend/.venv
.\coursework\backend\.venv\Scripts\python.exe -m pip install -r coursework/backend/requirements.lock.txt
```

**macOS и Linux**

```bash
npm --prefix coursework/blockchain ci
npm --prefix coursework/frontend ci
python3.11 -m venv coursework/backend/.venv
coursework/backend/.venv/bin/python -m pip install -r coursework/backend/requirements.lock.txt
```

При использовании Python 3.12 замените `py -3.11` на `py -3.12` или `python3.11` на `python3.12`.

## Локальный запуск

Откройте четыре терминала из корня репозитория. В macOS и Linux используйте `npm` вместо `npm.cmd`. Дождитесь готовности Hardhat перед развёртыванием.

**Терминал 1 — Hardhat, порт 8545**

```powershell
npm.cmd --prefix coursework/blockchain run node
```

**Терминал 2 — развёртывание и заполнение**

```powershell
npm.cmd --prefix coursework/blockchain run deploy
npm.cmd --prefix coursework/blockchain run seed
```

`deploy` записывает фактические адрес, chain ID, блок и ABI в `coursework/frontend/public/deployment.json`. `seed` создаёт 12 проектов на чистой сети. При последовательном повторном запуске существующие записи пропускаются.

**Терминал 3 — FastAPI, порт 8000**

Windows PowerShell

```powershell
Set-Location coursework/backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

macOS и Linux

```bash
cd coursework/backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

**Терминал 4 — Vite, порт 5173**

```powershell
npm.cmd --prefix coursework/frontend run dev
```

Откройте [ProjectMatch](http://127.0.0.1:5173). Нажмите **«Войти в демо»**. Роли **«Автор»** и **«Участник»** используют локальные аккаунты № 0 и № 1. [Проверка API](http://127.0.0.1:8000/health) возвращает `{"status":"ok"}`. [Схема API](http://127.0.0.1:8000/docs) доступна после запуска.

### MetaMask

В расширении вручную добавьте сеть с именем «Hardhat Local», RPC `http://127.0.0.1:8545`, chain ID `31337` и валютой ETH. Выберите сеть, подключите MetaMask в ProjectMatch и разрешите доступ к учебному аккаунту. Для отправки транзакций у адреса должен быть тестовый ETH. Можно пополнить новый тестовый адрес из Hardhat следующим способом.

```powershell
npm.cmd --prefix coursework/blockchain run hardhat -- console --network localhost
```

В консоли выполните команды, подставив публичный адрес тестового аккаунта MetaMask.

```javascript
const [sender] = await ethers.getSigners()
await (await sender.sendTransaction({ to: "ВСТАВЬТЕ_ПУБЛИЧНЫЙ_ТЕСТОВЫЙ_АДРЕС", value: ethers.parseEther("1") })).wait()
```

Выйдите из консоли командой `.exit`. Для защиты достаточно двух ролей в демо, расширение не требуется.

### Настройки и сброс

Типовые адреса уже заданы в коде. При необходимости скопируйте `.env.example` в `.env` в соответствующем каталоге. Фронтенд использует `VITE_RPC_URL` и `VITE_API_URL`, backend использует `FRONTEND_ORIGINS`, скрипты используют `PROJECTMATCH_RPC_URL` и `PROJECTMATCH_API_URL`. Сохраняйте loopback-привязку серверов.

Для сброса остановите **только Hardhat** через Ctrl+C, запустите терминал 1 заново и повторите обе команды из терминала 2. Обновите страницу. История предыдущей цепочки исчезнет, а локальные профили браузера сохранятся. Если MetaMask после сброса использует устаревший nonce, переподключите локальную сеть и очистите данные активности тестового аккаунта для этой сети.

## Проверки и демонстрация

Windows PowerShell из корня репозитория

```powershell
npm.cmd --prefix coursework/blockchain run compile
npm.cmd --prefix coursework/blockchain test
Push-Location coursework/backend
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe evaluate.py
Pop-Location
npm.cmd --prefix coursework/frontend run build
```

macOS и Linux из корня репозитория

```bash
npm --prefix coursework/blockchain run compile
npm --prefix coursework/blockchain test
(cd coursework/backend && .venv/bin/python -m pytest -q && .venv/bin/python evaluate.py)
npm --prefix coursework/frontend run build
```

Первые три команды ниже меняют состояние запущенной локальной цепочки. Для `smoke` нужны заполненный контракт и API. Для Playwright нужны все три сервера и развёрнутый каталог.

```powershell
npm.cmd --prefix coursework/blockchain run demo
npm.cmd --prefix coursework/blockchain run smoke
npm.cmd --prefix coursework/blockchain run demo:study
npx.cmd --prefix coursework/frontend playwright install chromium
npm.cmd --prefix coursework/frontend run test:e2e
```

На macOS и Linux используйте `npm` и `npx`. Для уже установленного Edge вместо установки Chromium установите `PLAYWRIGHT_CHANNEL=msedge` в окружении тестового запуска. Сценарий показа преподавателю и получение снимков описаны в [сценарии защиты](coursework/docs/DEFENSE.md) и [памятке по снимкам](coursework/docs/SCREENSHOTS.md).

Адрес `origin` в текущем Git — [Mun-Robbery/blockchain-edu](https://github.com/Mun-Robbery/blockchain-edu).
