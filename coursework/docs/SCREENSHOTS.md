# Снимки для сдачи

## ProjectMatch

Ниже снимки из Edge, сделанные Playwright на работающих Hardhat, FastAPI и Vite. UI читал развернутый контракт, а рекомендации пришли из `POST /recommendations`.

1. Каталог с проектами, фильтрами, статусами, местами и кошельком. [Открыть снимок каталога](screenshots/01_catalog.png)
2. Рекомендации для профиля Python/ML с оценками и объяснениями. [Открыть снимок рекомендаций](screenshots/02_recommendations.png)
3. Заполненная форма создания проекта перед отправкой. [Открыть снимок формы](screenshots/03_create_project.png)
4. Принятие заявки с событием `ApplicationStatusChanged`, хешем, номером блока, статусом 1 и счётчиком 1 / 1. [Открыть снимок подтверждения](screenshots/04_confirmed_transaction.png)

Для новых снимков повторите шаги [live demo](DEFENSE.md#live-demo) вручную. Для автоматического получения запустите три сервера и заполните контракт по [README](../../README.md). Используйте браузер Chromium от Playwright или уже установленный Edge.

**Windows PowerShell, установленный Edge**

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
$env:CAPTURE_SCREENSHOTS = '1'
npm.cmd --prefix coursework/frontend run test:e2e
Remove-Item Env:CAPTURE_SCREENSHOTS
Remove-Item Env:PLAYWRIGHT_CHANNEL
```

**macOS/Linux, Chromium от Playwright**

```bash
npx --prefix coursework/frontend playwright install chromium
CAPTURE_SCREENSHOTS=1 npm --prefix coursework/frontend run test:e2e
```

Тест публикует новый проект и создаёт принятую заявку. Снимки перезаписываются в `coursework/docs/screenshots/`. Хеши и номера блоков относятся к текущему локальному запуску.

## StudyToken

Для отчёта лабораторной нужны отдельные снимки из Remix VM. Список — окно компиляции или деплоя, раскрытая транзакция перевода, результаты двух запросов `balanceOf`. Порядок действий и ожидаемые единицы номинала приведены в [инструкции StudyToken](../../lab1/README.md#демонстрация-в-remix).

На скриншоты не должны попадать приватные ключи и персональные данные.
