import type { InterfaceAbi } from "ethers";

export type Project = {
  id: number;
  owner: string;
  title: string;
  description: string;
  requiredSkills: string;
  capacity: number;
  acceptedCount: number;
  active: boolean;
  createdAt: number;
};

export type Application = {
  applicant: string;
  projectId: number;
  status: number;
  createdAt: number;
};

export type ChainEvent = { name: string; args: string[] };

export type HistoryEntry = ChainEvent & {
  hash: string;
  block: number;
  index: number;
};

export type Receipt = {
  hash: string;
  block: number;
  status: number;
  events: ChainEvent[];
};

export type Deployment = {
  address: string;
  chainId: number;
  blockNumber: number;
  blockHash: string;
  abi: InterfaceAbi;
};

export type Profile = { skills: string; interests: string; bio: string };
export type Draft = { title: string; description: string; skills: string; capacity: string };
export type Recommendation = {
  id: number;
  score: number;
  matched_skills: string[];
  explanation: string;
};

export const applicationStatus = ["Ожидает решения", "Принята", "Отклонена"];
export const emptyProfile: Profile = { skills: "", interests: "", bio: "" };
export const emptyDraft: Draft = { title: "", description: "", skills: "", capacity: "3" };
export const splitSkills = (value: string) => value.split(",").map((tag) => tag.trim()).filter(Boolean);
export const shortAddress = (address: string) => address.slice(0, 8) + "…" + address.slice(-4);
export const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
export const projectStatus = (project: Project) =>
  !project.active ? "Закрыт" : project.acceptedCount >= project.capacity ? "Команда набрана" : "Идёт набор";
