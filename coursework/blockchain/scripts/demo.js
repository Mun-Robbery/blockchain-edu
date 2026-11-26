const assert = require("node:assert/strict");
const { deployedContract, printReceipt, run } = require("./local");

run(async (provider) => {
  const contract = await deployedContract(provider);
  const author = await provider.getSigner(0);
  const participant = await provider.getSigner(1);
  const created = await printReceipt(
    "Создание проекта",
    await contract.connect(author).createProject(
      "Стенд открытых данных",
      "Учебная панель с графиками посещаемости и фильтрами по периоду.",
      "Python, React, визуализация",
      2,
    ),
    contract,
  );
  const { projectId } = created.find((event) => event.name === "ProjectCreated").args;

  await printReceipt(
    "Подача заявки",
    await contract.connect(participant).applyToProject(projectId),
    contract,
  );
  assert.equal((await contract.getApplication(projectId, participant.address)).status, 0n);

  await printReceipt(
    "Принятие заявки",
    await contract.connect(author).acceptApplication(projectId, participant.address),
    contract,
  );
  const project = await contract.getProject(projectId);
  const application = await contract.getApplication(projectId, participant.address);
  assert.equal(project.acceptedCount, 1n);
  assert.equal(application.status, 1n);
  console.log(JSON.stringify({
    projectId: Number(projectId), owner: project.owner,
    acceptedCount: Number(project.acceptedCount), capacity: Number(project.capacity),
    applicant: application.applicant, status: "Accepted",
  }, null, 2));
});
