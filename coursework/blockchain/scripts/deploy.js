const path = require("node:path");
const { mkdir, rename, writeFile } = require("node:fs/promises");
const { ContractFactory } = require("ethers");
const { CHAIN_ID, DEPLOYMENT, artifact, confirmed, run } = require("./local");

run(async (provider) => {
  const { abi, bytecode } = await artifact("ProjectMatch");
  const factory = new ContractFactory(abi, bytecode, await provider.getSigner(0));
  const contract = await factory.deploy();
  const receipt = await confirmed(contract.deploymentTransaction());

  const deployment = {
    chainId: CHAIN_ID,
    address: await contract.getAddress(),
    blockNumber: receipt.blockNumber,
    blockHash: receipt.blockHash,
    txHash: receipt.hash,
    abi,
  };
  await mkdir(path.dirname(DEPLOYMENT), { recursive: true });
  const temporary = DEPLOYMENT + "." + process.pid + ".tmp";
  await writeFile(temporary, JSON.stringify(deployment, null, 2) + "\n", "utf8");
  await rename(temporary, DEPLOYMENT);
  const { abi: _abi, ...publicInfo } = deployment;
  console.log(JSON.stringify(publicInfo, null, 2));
  console.log("Фронтенд читает адрес и ABI из " + DEPLOYMENT);
});
