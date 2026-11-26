const assert = require("node:assert/strict");
const { ethers } = require("hardhat");

describe("ProjectMatch", function () {
  let registry, owner, member, outsider;

  beforeEach(async function () {
    [owner, member, outsider] = await ethers.getSigners();
    registry = await ethers.deployContract("ProjectMatch");
    await registry.waitForDeployment();
  });

  const publish = (registry, capacity = 2) =>
    registry.createProject("Кампус", "Карта маршрутов.", "TypeScript, GIS", capacity);

  async function expectEvent(tx, name, args) {
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1);
    const event = receipt.logs.map((log) => registry.interface.parseLog(log)).find((log) => log.name === name);
    assert.deepEqual(Array.from(event.args), args);
  }

  it("создаёт проект, назначает автора и возвращает публичные поля", async function () {
    await expectEvent(await publish(registry), "ProjectCreated", [1n, owner.address]);
    const project = await registry.getProject(1);
    assert.equal(project.id, 1n);
    assert.equal(project.owner, owner.address);
    assert.equal(project.title, "Кампус");
    assert.equal(project.description, "Карта маршрутов.");
    assert.equal(project.requiredSkills, "TypeScript, GIS");
    assert.equal(project.capacity, 2n);
    assert.equal(project.acceptedCount, 0n);
    assert.equal(project.active, true);
    assert.ok(project.createdAt > 0n);
  });

  it("фиксирует заявку и принятие, согласованные между представлениями", async function () {
    await publish(registry);
    await expectEvent(await registry.connect(member).applyToProject(1), "ApplicationSubmitted", [1n, member.address]);
    const pending = await registry.getApplication(1, member.address);
    assert.equal(pending.projectId, 1n);
    assert.equal(pending.applicant, member.address);
    assert.equal(pending.status, 0n);
    assert.ok(pending.createdAt > 0n);
    await expectEvent(await registry.acceptApplication(1, member.address), "ApplicationStatusChanged",
      [1n, member.address, owner.address, 1n]);
    assert.equal((await registry.getUserApplications(member.address, 0, 30))[0].status, 1n);
    assert.equal((await registry.getProjectApplications(1, 0, 30))[0].status, 1n);
    assert.equal((await registry.getProject(1)).acceptedCount, 1n);
  });

  it("отклоняет заявку без занятия места", async function () {
    await publish(registry);
    await registry.connect(member).applyToProject(1);
    await expectEvent(await registry.rejectApplication(1, member.address), "ApplicationStatusChanged",
      [1n, member.address, owner.address, 2n]);
    assert.equal((await registry.getApplication(1, member.address)).status, 2n);
    assert.equal((await registry.getProject(1)).acceptedCount, 0n);
  });

  it("запрещает принимать и отклонять чужие заявки и закрывать чужой проект", async function () {
    await publish(registry);
    await registry.connect(member).applyToProject(1);
    const foreignRegistry = registry.connect(outsider);
    await assert.rejects(foreignRegistry.acceptApplication(1, member.address), /OnlyProjectOwner/);
    await assert.rejects(foreignRegistry.rejectApplication(1, member.address), /OnlyProjectOwner/);
    await assert.rejects(foreignRegistry.closeProject(1), /OnlyProjectOwner/);
    assert.equal((await registry.getApplication(1, member.address)).status, 0n);
  });

  it("запрещает повторную заявку и заявку автора", async function () {
    await publish(registry);
    await assert.rejects(registry.applyToProject(1), /OwnProject/);
    await registry.connect(member).applyToProject(1);
    await assert.rejects(registry.connect(member).applyToProject(1), /DuplicateApplication/);
    await registry.rejectApplication(1, member.address);
    await assert.rejects(registry.connect(member).applyToProject(1), /DuplicateApplication/);
  });

  it("не превышает capacity при решении по двум заявкам и блокирует новые заявки", async function () {
    const [, , , extra] = await ethers.getSigners();
    await publish(registry, 1);
    await registry.connect(member).applyToProject(1);
    await registry.connect(outsider).applyToProject(1);
    await registry.acceptApplication(1, member.address);
    await assert.rejects(registry.acceptApplication(1, outsider.address), /ProjectFull/);
    await assert.rejects(registry.connect(extra).applyToProject(1), /ProjectFull/);
    await registry.rejectApplication(1, outsider.address);
    assert.equal((await registry.getProject(1)).acceptedCount, 1n);
  });

  it("закрывает проект окончательно, сохраняя Pending без возможности решения", async function () {
    await publish(registry);
    await registry.connect(member).applyToProject(1);
    await expectEvent(await registry.closeProject(1), "ProjectClosed", [1n, owner.address]);
    assert.equal((await registry.getProject(1)).active, false);
    await assert.rejects(registry.connect(outsider).applyToProject(1), /ProjectInactive/);
    await assert.rejects(registry.acceptApplication(1, member.address), /ProjectInactive/);
    await assert.rejects(registry.rejectApplication(1, member.address), /ProjectInactive/);
    await assert.rejects(registry.closeProject(1), /ProjectInactive/);
    assert.equal((await registry.getApplication(1, member.address)).status, 0n);
  });

  it("отклоняет запросы к несуществующему проекту или заявке", async function () {
    await assert.rejects(registry.getProject(0), /ProjectNotFound/);
    await assert.rejects(registry.applyToProject(999), /ProjectNotFound/);
    await assert.rejects(registry.closeProject(999), /ProjectNotFound/);
    await assert.rejects(registry.getProjectApplications(999, 0, 30), /ProjectNotFound/);
    await publish(registry);
    await assert.rejects(registry.getApplication(1, member.address), /ApplicationNotFound/);
    await assert.rejects(registry.acceptApplication(1, member.address), /ApplicationNotFound/);
  });

  it("блокирует любые переходы после Accepted и Rejected", async function () {
    await publish(registry);
    await registry.connect(member).applyToProject(1);
    await registry.connect(outsider).applyToProject(1);
    await registry.acceptApplication(1, member.address);
    await registry.rejectApplication(1, outsider.address);
    for (const applicant of [member.address, outsider.address]) {
      await assert.rejects(registry.acceptApplication(1, applicant), /FinalApplication/);
      await assert.rejects(registry.rejectApplication(1, applicant), /FinalApplication/);
    }
    assert.equal((await registry.getProject(1)).acceptedCount, 1n);
  });

  it("проверяет лимиты UTF-8 и capacity", async function () {
    await assert.rejects(registry.createProject("", "Описание", "Навыки", 2), /InvalidText/);
    await assert.rejects(registry.createProject(" \t", "Описание", "Навыки", 2), /InvalidText/);
    await assert.rejects(registry.createProject("Я".repeat(61), "Описание", "Навыки", 2), /InvalidText/);
    await assert.rejects(registry.createProject("Проект", "Я".repeat(601), "Навыки", 2), /InvalidText/);
    await assert.rejects(registry.createProject("Проект", "Описание", "Я".repeat(161), 2), /InvalidText/);
    await assert.rejects(publish(registry, 0), /InvalidCapacity/);
    await assert.rejects(publish(registry, 31), /InvalidCapacity/);
    await registry.createProject("Я".repeat(60), "Я".repeat(600), "Я".repeat(160), 30);
    assert.equal((await registry.getProject(1)).capacity, 30n);
  });

  it("выдаёт страницы проектов и заявок без пропусков и переполнения offset", async function () {
    await publish(registry);
    await publish(registry);
    await publish(registry);
    await registry.connect(member).applyToProject(1);
    await registry.connect(outsider).applyToProject(1);
    await registry.connect(member).applyToProject(2);
    assert.deepEqual((await registry.getProjects(1, 2)).map((item) => item.id), [2n, 3n]);
    assert.equal((await registry.getProjects(ethers.MaxUint256, 30)).length, 0);
    assert.equal((await registry.getProjectApplications(1, 1, 1))[0].applicant, outsider.address);
    assert.equal((await registry.getUserApplications(member.address, 1, 10))[0].projectId, 2n);
    assert.equal((await registry.getUserApplications(member.address, 2, 10)).length, 0);
    await assert.rejects(registry.getProjects(0, 31), /InvalidPageSize/);
    await assert.rejects(registry.getUserApplications(member.address, 0, 0), /InvalidPageSize/);
  });
});
