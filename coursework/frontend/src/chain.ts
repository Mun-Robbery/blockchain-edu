import {
  BrowserProvider, Contract, FetchRequest, JsonRpcProvider, getAddress,
  type Eip1193Provider, type Log, type Result, type Signer, type TransactionResponse,
} from "ethers";
import type { Application, ChainEvent, Deployment, HistoryEntry, Project, Receipt } from "./types";
import { sameAddress } from "./types";

export const CHAIN_ID = 31337;
export const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:8545";
const PAGE_SIZE = 30;
const loopback = (host: string) => ["localhost", "127.0.0.1"].includes(host);
function isLocalRpc() {
  try {
    const url = new URL(RPC_URL);
    return loopback(url.hostname) && ["http:", "https:"].includes(url.protocol) &&
      !url.username && !url.password;
  } catch {
    return false;
  }
}
export const demoAllowed = loopback(window.location.hostname) && isLocalRpc();

export type InjectedProvider = Eip1193Provider & {
  on?: (event: string, listener: () => void) => void;
  removeListener?: (event: string, listener: () => void) => void;
};

export function injected() {
  return (window as Window & { ethereum?: InjectedProvider }).ethereum;
}

const request = new FetchRequest(RPC_URL);
request.timeout = 5000;
export const rpc = new JsonRpcProvider(request, CHAIN_ID, { staticNetwork: true, cacheTimeout: -1 });

export async function verifyRpc() {
  let chainId: number;
  try {
    chainId = Number(await rpc.send("eth_chainId", []));
  } catch {
    throw new Error("Локальный RPC недоступен. Запустите Hardhat командой npm run node.");
  }
  if (chainId !== CHAIN_ID) throw new Error("У локального RPC другой chain ID. Ожидается 31337.");
}

export async function readDeployment(): Promise<Deployment> {
  const response = await fetch(import.meta.env.BASE_URL + "deployment.json", { cache: "no-store" });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Конфигурация контракта отсутствует. Выполните npm run deploy.");
  }
  const deployment = await response.json() as Deployment;
  if (deployment.chainId !== CHAIN_ID || !Array.isArray(deployment.abi)) {
    throw new Error("Конфигурация контракта некорректна. Повторите npm run deploy.");
  }
  return deployment;
}

export async function verifyDeployment(deployment: Deployment, provider = rpc) {
  const [code, block] = await Promise.all([
    provider.getCode(deployment.address),
    provider.getBlock(deployment.blockNumber),
  ]);
  if (code === "0x" || block?.hash !== deployment.blockHash) {
    throw new Error("Контракт из конфигурации отсутствует в текущей сети. Повторите npm run deploy и обновите данные.");
  }
}

function toProject(row: Result): Project {
  return {
    id: Number(row.id), owner: row.owner, title: row.title, description: row.description,
    requiredSkills: row.requiredSkills, capacity: Number(row.capacity),
    acceptedCount: Number(row.acceptedCount), active: row.active, createdAt: Number(row.createdAt),
  };
}

function toApplication(row: Result): Application {
  return {
    applicant: row.applicant, projectId: Number(row.projectId),
    status: Number(row.status), createdAt: Number(row.createdAt),
  };
}

async function paginate<T>(read: (offset: number) => Promise<Result[]>, convert: (row: Result) => T) {
  const values: T[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const rows = await read(offset);
    values.push(...rows.map(convert));
    if (rows.length < PAGE_SIZE) return values;
  }
}

function eventFrom(contract: Contract, log: Log): ChainEvent | null {
  if (!sameAddress(String(contract.target), log.address)) return null;
  const event = contract.interface.parseLog(log);
  return event ? { name: event.name, args: Array.from(event.args, String) } : null;
}

export async function readCatalog(address?: string) {
  await verifyRpc();
  const deployment = await readDeployment();
  await verifyDeployment(deployment);
  const contract = new Contract(deployment.address, deployment.abi, rpc);
  const blockTag = await rpc.getBlockNumber();
  const [projects, applications] = await Promise.all([
    paginate((offset) => contract.getFunction("getProjects").staticCall(offset, PAGE_SIZE, { blockTag }), toProject),
    address
      ? paginate((offset) => contract.getFunction("getUserApplications").staticCall(address, offset, PAGE_SIZE, { blockTag }), toApplication)
      : Promise.resolve([]),
  ]);
  return { deployment, contract, projects, applications, blockTag };
}

export async function readWorkspace(address?: string) {
  const { deployment, contract, projects, applications, blockTag } = await readCatalog(address);
  const [entries, incoming] = await Promise.all([
    rpc.getLogs({ address: deployment.address, fromBlock: deployment.blockNumber, toBlock: blockTag }),
    Promise.all(projects.filter((project) => address && sameAddress(project.owner, address)).map(
      (project) => paginate(
        (offset) => contract.getFunction("getProjectApplications").staticCall(project.id, offset, PAGE_SIZE, { blockTag }),
        toApplication,
      ),
    )),
  ]);
  const history = entries.flatMap((log): HistoryEntry[] => {
    const event = eventFrom(contract, log);
    return event ? [{ ...event, hash: log.transactionHash, block: log.blockNumber, index: log.index }] : [];
  }).sort((a, b) => b.block - a.block || b.index - a.index);
  return { address, deployment, projects, applications, incoming: incoming.flat(), history };
}

export type Workspace = Awaited<ReturnType<typeof readWorkspace>>;

export async function demoSigner(role: number) {
  if (!demoAllowed) {
    throw new Error("Демо доступно только на localhost или 127.0.0.1.");
  }
  await verifyRpc();
  return rpc.getSigner(role);
}

export async function sendTransaction(
  deployment: Deployment,
  signer: Signer,
  method: string,
  args: (string | number)[],
  submitted: (hash: string) => void,
): Promise<Receipt> {
  const provider = signer.provider;
  if (!provider || (await provider.getNetwork()).chainId !== BigInt(CHAIN_ID)) {
    throw new Error("Выберите сеть Hardhat с chain ID 31337.");
  }
  await verifyDeployment(deployment);
  if (provider instanceof BrowserProvider) {
    const block = await provider.getBlock(deployment.blockNumber);
    if (block?.hash !== deployment.blockHash) throw new Error("Кошелёк подключён к другой сети Hardhat.");
  }

  const contract = new Contract(deployment.address, deployment.abi, signer);
  try {
    const tx: TransactionResponse = await contract.getFunction(method)(...args);
    submitted(tx.hash);
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) throw new Error("Транзакция не подтверждена.");
    return {
      hash: receipt.hash, block: receipt.blockNumber, status: receipt.status,
      events: receipt.logs.flatMap((log) => {
        const event = eventFrom(contract, log);
        return event ? [event] : [];
      }),
    };
  } catch (error) {
    if (typeof error === "object" && error && "data" in error && typeof error.data === "string") {
      const name = contract.interface.parseError(error.data)?.name;
      if (name && name in contractErrors) throw new Error(contractErrors[name]);
    }
    throw error;
  }
}

const contractErrors: Record<string, string> = {
  ProjectNotFound: "Проект не найден.",
  ProjectInactive: "Проект уже закрыт.",
  OnlyProjectOwner: "Это действие доступно только автору проекта.",
  OwnProject: "Автор не может подать заявку на свой проект.",
  ProjectFull: "Все места в команде заняты.",
  DuplicateApplication: "Заявка на этот проект уже есть.",
  ApplicationNotFound: "Заявка не найдена.",
  FinalApplication: "По заявке уже принято решение.",
  InvalidText: "Укажите непустые тексты в пределах лимитов.",
  InvalidCapacity: "Укажите целое число мест от 1 до 30.",
};

export function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && !("code" in error)) return error.message;
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === 4001 || error.code === "ACTION_REJECTED") return "Подпись отклонена в кошельке.";
    if (error.code === "TRANSACTION_REPLACED") return "Транзакция заменена или отменена в кошельке. Обновите историю.";
  }
  return fallback;
}

export async function walletInfo(ethereum: InjectedProvider) {
  const [accounts, chain] = await Promise.all([
    ethereum.request({ method: "eth_accounts" }) as Promise<string[]>,
    ethereum.request({ method: "eth_chainId" }) as Promise<string>,
  ]);
  return { address: accounts[0] ? getAddress(accounts[0]) : undefined, chainId: Number(chain) };
}
