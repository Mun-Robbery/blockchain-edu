import { useEffect, useRef, useState, type ReactNode } from "react";
import { CHAIN_ID, errorMessage, readWorkspace, sendTransaction, type Workspace } from "./chain";
import {
  Catalog, CreateProject, History, Notice, ProfileForm, ProjectCard, ReceiptCard, Recommended, WalletPanel,
} from "./components";
import { applicationStatus, emptyProfile, sameAddress, shortAddress, type Profile, type Project, type Receipt } from "./types";
import { useWallet } from "./useWallet";

const pages = {
  catalog: { title: "Каталог проектов", description: "Найдите студенческий проект и подайте заявку в команду.", symbol: "▦" },
  recommend: { title: "Рекомендации", description: "Подбор проектов по навыкам и интересам.", symbol: "✧" },
  create: { title: "Создать проект", description: "Откройте набор участников в свою команду.", symbol: "+" },
  profile: { title: "Профиль", description: "Навыки, интересы и описание для персонального подбора.", symbol: "◎" },
  applications: { title: "Мои заявки", description: "Проверьте решения по своим заявкам.", symbol: "≡" },
  projects: { title: "Мои проекты", description: "Просматривайте заявки и управляйте набором.", symbol: "□" },
  history: { title: "Транзакции", description: "Журнал событий текущего развёртывания ProjectMatch.", symbol: "◷" },
} as const;

type Page = keyof typeof pages;
const nav = Object.keys(pages) as Page[];

function loadProfile(address: string): Profile {
  try {
    const stored = JSON.parse(localStorage.getItem("projectmatch.profile." + address) || "null");
    if (stored && Object.keys(emptyProfile).every((key) => typeof stored[key] === "string")) {
      return { skills: stored.skills, interests: stored.interests, bio: stored.bio };
    }
  } catch {
    // Профиль можно заполнить заново, если локальное хранилище недоступно.
  }
  return emptyProfile;
}

export function App() {
  const [page, setPage] = useState<Page>("catalog");
  const [revision, setRevision] = useState(0);
  const [workspace, setWorkspace] = useState<Workspace>();
  const [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [txError, setTxError] = useState("");
  const [pending, setPending] = useState<string>();
  const [receipt, setReceipt] = useState<Receipt>();
  const [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const writing = useRef(false);
  const deploymentHash = useRef<string>(undefined);
  const walletState = useWallet(revision);
  const { wallet } = walletState;
  const address = wallet?.address;
  const profileKey = address?.toLowerCase() ?? "guest";
  const profile = profiles[profileKey] ?? loadProfile(profileKey);
  const current = workspace?.address === address ? workspace : undefined;
  const authorized = Boolean(address && wallet?.chainId === CHAIN_ID);
  const canWrite = authorized && !!current && !loading && !busy && !readError;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setReadError("");
    readWorkspace(address).then((data) => {
      if (active) {
        if (deploymentHash.current && deploymentHash.current !== data.deployment.blockHash) setReceipt(undefined);
        deploymentHash.current = data.deployment.blockHash;
        setWorkspace(data);
      }
    }).catch((error: unknown) => {
      if (active) {
        setWorkspace(undefined);
        setReadError(errorMessage(error, "Не удалось прочитать сеть. Проверьте RPC и развёртывание."));
      }
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [address, revision]);

  function navigate(destination: Page) {
    setPage(destination);
    setTxError("");
    window.scrollTo(0, 0);
  }

  function saveProfile(value: Profile) {
    setProfiles((previous) => ({ ...previous, [profileKey]: value }));
    try {
      localStorage.setItem("projectmatch.profile." + profileKey, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  async function operate(method: string, args: (string | number)[]) {
    if (!current || !canWrite || writing.current) return false;
    writing.current = true;
    setBusy(true);
    setPending(undefined);
    setTxError("");
    setReceipt(undefined);
    try {
      const signer = await walletState.signer();
      const result = await sendTransaction(current.deployment, signer, method, args, setPending);
      setReceipt(result);
      setRevision((value) => value + 1);
      return true;
    } catch (error) {
      setTxError(errorMessage(error, "Операция не подтверждена. Обновите данные и проверьте историю транзакций."));
      return false;
    } finally {
      writing.current = false;
      setBusy(false);
      setPending(undefined);
    }
  }

  const projects = workspace?.projects ?? [];
  const applications = current?.applications ?? [];

  function projectAction(project: Project) {
    const submitted = applications.find((application) => application.projectId === project.id);
    if (submitted) return <span className="applied">Моя заявка · {applicationStatus[submitted.status]}</span>;
    if (address && sameAddress(project.owner, address)) {
      return <button className="button quiet" onClick={() => navigate("projects")}>Мой проект</button>;
    }
    if (!project.active || project.acceptedCount >= project.capacity) return null;
    return (
      <button className="button secondary apply" disabled={!canWrite}
        title={authorized ? undefined : "Подключите кошелёк для подачи заявки"}
        onClick={() => void operate("applyToProject", [project.id])}>
        Подать заявку
      </button>
    );
  }

  function projectManagement() {
    if (!address) return <Notice>Подключите кошелёк, чтобы увидеть свои проекты.</Notice>;
    const owned = projects.filter((project) => sameAddress(project.owner, address)).reverse();
    if (owned.length === 0) return <Notice>У этого адреса пока нет проектов.</Notice>;
    return (
      <div className="stack">
        {owned.map((project) => {
          const incoming = current?.incoming.filter((item) => item.projectId === project.id) ?? [];
          return (
            <section className="owned-project" key={project.id}>
              <ProjectCard project={project}>
                {project.active && <button className="button quiet" disabled={!canWrite}
                  onClick={() => void operate("closeProject", [project.id])}>Закрыть набор</button>}
              </ProjectCard>
              <div className="card incoming">
                <h3>Заявки участников</h3>
                {incoming.length === 0 && <p className="muted">Заявок пока нет.</p>}
                {incoming.map((item) => (
                  <div className="application-row" key={item.applicant}>
                    <div>
                      <code title={item.applicant}>{shortAddress(item.applicant)}</code>
                      <span>{!project.active && item.status === 0 ? "Без решения · проект закрыт" : applicationStatus[item.status]}</span>
                    </div>
                    {project.active && item.status === 0 && (
                      <div className="actions">
                        <button className="button primary" disabled={!canWrite || project.acceptedCount >= project.capacity}
                          onClick={() => void operate("acceptApplication", [project.id, item.applicant])}>Принять</button>
                        <button className="button secondary" disabled={!canWrite}
                          onClick={() => void operate("rejectApplication", [project.id, item.applicant])}>Отклонить</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  function pageContent(): ReactNode {
    switch (page) {
      case "catalog":
        return <Catalog projects={projects} renderAction={projectAction} />;
      case "recommend":
        return <Recommended key={profileKey + ":" + revision + ":" + JSON.stringify(profile)} address={address}
          profile={profile} renderAction={projectAction} />;
      case "create":
        return (
          <div className="stack">
            {!authorized && <Notice>Подключите кошелёк в локальной сети для публикации проекта.</Notice>}
            <CreateProject disabled={!canWrite} create={(args) => operate("createProject", args)} />
          </div>
        );
      case "profile":
        return <ProfileForm key={profileKey} profile={profile} save={saveProfile} />;
      case "applications":
        if (!address) return <Notice>Подключите кошелёк, чтобы увидеть свои заявки.</Notice>;
        if (applications.length === 0) return <Notice>У этого адреса пока нет заявок.</Notice>;
        return (
          <div className="stack">
            {[...applications].reverse().map((item) => {
              const project = projects.find((candidate) => candidate.id === item.projectId);
              return (
                <article className="card application-row" key={item.projectId}>
                  <div>
                    <h3>{project?.title ?? `Проект #${item.projectId}`}</h3>
                    <span>#{item.projectId} · {new Date(item.createdAt * 1000).toLocaleString("ru-RU")}</span>
                  </div>
                  <span className={item.status === 1 ? "badge open" : "badge neutral"}>
                    {!project?.active && item.status === 0 ? "Без решения · проект закрыт" : applicationStatus[item.status]}
                  </span>
                </article>
              );
            })}
          </div>
        );
      case "projects":
        return projectManagement();
      case "history":
        return <History key={workspace?.deployment.blockHash} entries={workspace?.history ?? []} />;
    }
  }

  const catalog = page === "catalog";
  const live = workspace && !readError;
  const active = projects.filter((project) => project.active && project.acceptedCount < project.capacity).length;
  const needsWorkspace = ["catalog", "projects", "applications", "history"].includes(page);
  const waitingForPage = needsWorkspace && (!workspace || (["projects", "applications"].includes(page) && !current));

  return (
    <div className="layout">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("catalog")}>
          <span className="monogram" aria-hidden="true">PM</span>
          <span>ProjectMatch<small>Студенческие команды</small></span>
        </button>
        <nav aria-label="Навигация">
          {nav.map((id) => (
            <button key={id} className={page === id ? "nav-button selected" : "nav-button"}
              aria-current={page === id ? "page" : undefined} onClick={() => navigate(id)}>
              <span aria-hidden="true">{pages[id].symbol}</span>{pages[id].title === "Каталог проектов" ? "Каталог" : pages[id].title}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer"><span className={live ? "network-dot online" : "network-dot"} />
          <div>Локальная сеть<small>Hardhat · 31337</small></div>
        </div>
      </aside>
      <main>
        <div className="page">
          <WalletPanel state={walletState} busy={busy} />
          <header className={catalog ? "hero" : "page-heading"}>
            <div>
              <h1>{pages[page].title}</h1>
              <p>{pages[page].description}</p>
              {catalog && <button className="button hero-button" onClick={() => navigate("create")}>Создать проект</button>}
            </div>
            {catalog && live && (
              <div className="hero-stats">
                <div><strong>{projects.length}</strong><span>В реестре</span></div>
                <div><strong>{active}</strong><span>Идёт набор</span></div>
              </div>
            )}
          </header>
          <div className="toolbar">
            {live && <span title={workspace.deployment.address}>Контракт <code>{shortAddress(workspace.deployment.address)}</code></span>}
            <button className="button quiet" disabled={loading || busy} onClick={() => setRevision((value) => value + 1)}>
              {loading ? "Обновляем…" : "Обновить данные"}
            </button>
          </div>
          {readError && <Notice error>{readError}</Notice>}
          {loading && waitingForPage && <Notice>Загружаем данные из локальной сети…</Notice>}
          {busy && <Notice>{pending ? <>Ожидаем подтверждения <code className="hash">{pending}</code></> : "Готовим транзакцию и ожидаем подписи…"}</Notice>}
          {txError && <Notice error>{txError}</Notice>}
          {receipt && <ReceiptCard receipt={receipt} />}
          {(!waitingForPage || !needsWorkspace) && pageContent()}
        </div>
      </main>
    </div>
  );
}
