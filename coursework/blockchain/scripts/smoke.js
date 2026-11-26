const assert = require("node:assert/strict");
const { confirmed, deployedContract, readProjects, run } = require("./local");

run(async (provider) => {
  const api = process.env.PROJECTMATCH_API_URL || "http://127.0.0.1:8000";
  assert.deepEqual(await (await fetch(api + "/health")).json(), { status: "ok" });
  const contract = await deployedContract(provider);
  const author = await provider.getSigner(0);
  const participant = await provider.getSigner(1);
  const catalog = await readProjects(contract);
  assert.ok(catalog.length >= 12, "Сначала выполните npm run seed.");

  const draft = await confirmed(await contract.connect(author).createProject(
    "Лаборатория Python", "Студенты изучают модели машинного обучения.", "Python, ML", 1,
  ));
  const created = contract.interface.parseLog(draft.logs[0]);
  const id = Number(created.args.projectId);

  async function request(profile) {
    const projects = await readProjects(contract);
    const applied = [];
    for (let offset = 0; ; offset += 30) {
      const page = await contract.getUserApplications(participant.address, offset, 30);
      applied.push(...page.map((application) => Number(application.projectId)));
      if (page.length < 30) break;
    }
    const response = await fetch(api + "/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_address: participant.address,
        applied_project_ids: applied,
        profile,
        projects: projects.map((project) => ({
          id: Number(project.id), owner: project.owner, title: project.title,
          description: project.description, required_skills: project.requiredSkills.split(","),
          capacity: Number(project.capacity), accepted_count: Number(project.acceptedCount),
          active: project.active,
        })),
      }),
    });
    assert.equal(response.status, 200);
    return (await response.json()).recommendations;
  }

  const python = await request({ skills: ["Python", "ML"] });
  const design = await request({ skills: ["Figma", "UX"] });
  assert.ok(python.some((row) => row.id === id));
  assert.ok(design[0].matched_skills.includes("figma"));
  assert.notEqual(python[0].id, design[0].id);
  assert.notEqual(python[0].score, design[0].score);

  const submit = await confirmed(await contract.connect(participant).applyToProject(id));
  assert.equal((await contract.getApplication(id, participant.address)).status, 0n);
  assert.ok((await request({ skills: ["Python", "ML"] })).every((row) => row.id !== id));
  const accept = await confirmed(
    await contract.connect(author).acceptApplication(id, participant.address),
  );
  assert.equal((await contract.getProject(id)).acceptedCount, 1n);
  assert.equal((await contract.getProjectApplications(id, 0, 30))[0].status, 1n);
  console.log(JSON.stringify({
    health: "ok", projectId: id, python: python[0], design: design[0],
    transactions: [draft, submit, accept].map((receipt) => ({
      hash: receipt.hash, block: receipt.blockNumber, status: receipt.status,
    })),
    accepted: true,
  }, null, 2));
});
