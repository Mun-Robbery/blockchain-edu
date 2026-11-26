const { readFile } = require("node:fs/promises");
const path = require("node:path");
const { Contract, JsonRpcProvider } = require("ethers");

const CHAIN_ID = 31337;
const PAGE_SIZE = 30;
const DEPLOYMENT = path.resolve(__dirname, "../../frontend/public/deployment.json");

async function localProvider() {
  const url = new URL(process.env.PROJECTMATCH_RPC_URL || "http://127.0.0.1:8545");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.username || url.password
  ) {
    throw new Error("Учебные скрипты доступны только для локального RPC.");
  }
  const provider = new JsonRpcProvider(url.href, undefined, { cacheTimeout: -1 });
  try {
    if (BigInt(await provider.send("eth_chainId", [])) !== BigInt(CHAIN_ID)) {
      throw new Error("Ожидается chain ID 31337.");
    }
    return provider;
  } catch (error) {
    provider.destroy();
    throw new Error("Проверьте локальную ноду Hardhat (npm run node). " + error.message);
  }
}

async function withProvider(action) {
  const provider = await localProvider();
  try {
    await action(provider);
  } finally {
    provider.destroy();
  }
}

function artifact(name) {
  return require("hardhat").artifacts.readArtifact(name);
}

async function deployedContract(provider) {
  const deployment = JSON.parse(await readFile(DEPLOYMENT, "utf8"));
  const block = await provider.getBlock(deployment.blockNumber);
  const code = await provider.getCode(deployment.address);
  if (deployment.chainId !== CHAIN_ID || block?.hash !== deployment.blockHash || code === "0x") {
    throw new Error("Развёртывание устарело. Выполните npm run deploy.");
  }
  return new Contract(deployment.address, deployment.abi, provider);
}

async function confirmed(transaction) {
  const receipt = await transaction.wait();
  if (receipt?.status !== 1) throw new Error("Транзакция не подтверждена.");
  return receipt;
}

function decodedEvents(receipt, contract) {
  const address = String(contract.target).toLowerCase();
  return receipt.logs
    .filter((log) => log.address.toLowerCase() === address)
    .map((log) => contract.interface.parseLog(log))
    .filter(Boolean);
}

async function printReceipt(label, transaction, contract) {
  const receipt = await confirmed(transaction);
  const events = decodedEvents(receipt, contract);
  console.log(JSON.stringify({
    operation: label,
    receipt: {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      status: receipt.status,
      from: receipt.from,
      to: receipt.to,
      gasUsed: receipt.gasUsed.toString(),
      events: events.map((event) => ({
        name: event.name, args: Array.from(event.args, (value) => String(value)),
      })),
    },
  }, null, 2));
  return events;
}

async function readProjects(contract) {
  const projects = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await contract.getProjects(offset, PAGE_SIZE);
    projects.push(...page);
    if (page.length < PAGE_SIZE) return projects;
  }
}

function run(action) {
  withProvider(action).catch((error) => {
    console.error(error.shortMessage || error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  CHAIN_ID, DEPLOYMENT, artifact, confirmed, deployedContract,
  printReceipt, readProjects, run,
};
