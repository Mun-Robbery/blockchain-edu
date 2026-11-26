import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

async function capture(page: Page, name: string) {
  if (process.env.CAPTURE_SCREENSHOTS !== "1") return;
  const path = fileURLToPath(new URL(`../../docs/screenshots/${name}.png`, import.meta.url));
  await page.screenshot({ path, animations: "disabled" });
}

function navigation(page: Page, name: string) {
  return page.getByRole("navigation", { name: "Навигация" }).getByRole("button", { name, exact: true });
}

test("автор и участник выполняют полный сценарий в локальной сети", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Каталог проектов" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Карта доступного кампуса" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Подать заявку" }).first()).toBeDisabled();
  await page.getByRole("button", { name: "Войти в демо" }).click();
  await expect(page.getByRole("button", { name: "Автор", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Обновить данные" })).toBeEnabled();
  await capture(page, "01_catalog");

  await navigation(page, "Создать проект").click();
  const title = "Аналитика посещаемости кампуса";
  await page.getByLabel("Название проекта").fill(title);
  await page.getByLabel("Описание проекта").fill("Команда исследует открытые данные о кампусе и сравнивает модели прогнозирования.");
  await page.getByLabel("Навыки через запятую").fill("Python, pandas, статистика");
  await page.getByLabel("Мест для участников").fill("1");
  const publish = page.getByRole("button", { name: "Опубликовать в реестре" });
  await expect(publish).toBeEnabled();
  await capture(page, "03_create_project");
  await publish.click();
  const receipt = page.getByTestId("receipt");
  await expect(receipt).toContainText("ProjectCreated");
  await expect(receipt).toContainText("status 1");
  const created = await receipt.getByText(/проект #\d+/).innerText();
  const id = /проект #(\d+)/.exec(created)![1];

  await page.getByRole("button", { name: "Участник", exact: true }).click();
  await expect(page.getByRole("button", { name: "Участник", exact: true })).toHaveAttribute("aria-pressed", "true");
  await navigation(page, "Профиль").click();
  await page.getByLabel("Мои навыки").fill("Python, ML, pandas");
  await page.getByLabel("Мои интересы").fill("Временные ряды, регрессия");
  await page.getByLabel("Краткое описание").fill("Сравниваю модели и работаю с табличными данными.");
  await page.getByRole("button", { name: "Сохранить профиль" }).click();
  await expect(page.getByText("Профиль сохранён в этом браузере.")).toBeVisible();
  await navigation(page, "Рекомендации").click();
  const api = page.waitForResponse((response) => response.url().endsWith("/recommendations") && response.request().method() === "POST");
  await page.getByRole("button", { name: "Получить рекомендации" }).click();
  expect((await api).status()).toBe(200);
  const result = page.getByLabel("Результаты рекомендаций");
  await expect(result.getByRole("heading", { name: "Прогноз загрузки библиотеки" })).toBeVisible();
  await expect(result.getByText(/Близость \d/).first()).toBeVisible();
  await expect(result.getByText(/Совпавшие навыки/).first()).toBeVisible();
  await capture(page, "02_recommendations");

  await navigation(page, "Каталог").click();
  await page.getByRole("searchbox", { name: "Поиск по каталогу" }).fill(title);
  const project = page.locator(`[data-project-id="${id}"]`);
  await expect(project.getByRole("heading", { name: title })).toBeVisible();
  await project.getByRole("button", { name: "Подать заявку" }).click();
  await expect(receipt).toContainText("ApplicationSubmitted");
  await navigation(page, "Мои заявки").click();
  await expect(page.getByRole("article").filter({ hasText: title }).getByText("Ожидает решения")).toBeVisible();

  await page.getByRole("button", { name: "Автор", exact: true }).click();
  await navigation(page, "Мои проекты").click();
  const own = page.locator(".owned-project").filter({ has: page.locator(`[data-project-id="${id}"]`) });
  await own.getByRole("button", { name: "Принять", exact: true }).click();
  await expect(receipt).toContainText("ApplicationStatusChanged");
  await expect(receipt).toContainText("status 1");
  await expect(receipt.locator(".hash")).toHaveText(/^0x[0-9a-f]{64}$/);
  await expect(own.getByText("1 / 1")).toBeVisible();
  await expect(own.getByText("Команда набрана")).toBeVisible();
  await capture(page, "04_confirmed_transaction");

  await navigation(page, "Транзакции").click();
  await expect(page.locator(".event-row").first()).toContainText("ApplicationStatusChanged");
  await page.getByRole("button", { name: "Участник", exact: true }).click();
  await navigation(page, "Мои заявки").click();
  await expect(page.getByRole("article").filter({ hasText: title }).getByText("Принята", { exact: true }).first()).toBeVisible();
});

test("мобильный каталог помещается в экран, поиск и статус фильтруют проекты", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const search = page.getByRole("searchbox", { name: "Поиск по каталогу" });
  await search.fill("датчик полива");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Датчик полива для теплицы" })).toBeVisible();
  await page.getByLabel("Статус", { exact: true }).selectOption("Закрыт");
  await expect(page.getByText("По вашему запросу ничего не найдено.")).toBeVisible();
  const fitsViewport = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fitsViewport).toBe(true);
});
