const rows = require("../../data/projects.json");
const { confirmed, deployedContract, readProjects, run } = require("./local");

run(async (provider) => {
  const contract = await deployedContract(provider);
  const existing = await readProjects(contract);
  for (const row of rows) {
    const signer = await provider.getSigner(row.account);
    const match = existing.find((project) =>
      project.owner === signer.address && project.title === row.title &&
      project.description === row.description && project.requiredSkills === row.skills &&
      Number(project.capacity) === row.capacity
    );
    if (match) {
      console.log(`#${match.id} уже существует — ${row.title}`);
      continue;
    }
    const tx = await contract.connect(signer).createProject(
      row.title, row.description, row.skills, row.capacity,
    );
    await confirmed(tx);
    console.log(`${tx.hash} — ${row.title}`);
  }
  console.log(`Всего проектов в контракте: ${await contract.projectCount()}`);
});
