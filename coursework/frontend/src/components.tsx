import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CHAIN_ID, errorMessage } from "./chain";
import { requestRecommendations, type RankedProject } from "./recommendations";
import {
  applicationStatus, emptyDraft, projectStatus, shortAddress, splitSkills,
  type ChainEvent, type Draft, type HistoryEntry, type Profile, type Project, type Receipt,
} from "./types";
import type { WalletState } from "./useWallet";

export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <p className={error ? "notice notice-error" : "notice"} role={error ? "alert" : "status"}>{children}</p>;
}

export function WalletPanel({ state, busy }: { state: WalletState; busy: boolean }) {
  const { wallet, role, error, connecting, demoAllowed, connect, disconnect } = state;
  const blocked = connecting || busy;
  const isDemo = wallet?.mode === "demo";
  return (
    <section className="wallet" aria-label="Кошелёк">
      <div className="wallet-main">
        <div className="wallet-info">
          <strong>{isDemo ? "Учебный кошелёк" : wallet ? "MetaMask" : "Кошелёк"}</strong>
          {wallet?.address ? (
            <span title={wallet.address}>
              <code>{shortAddress(wallet.address)}</code> · {wallet.balance === undefined ? "баланс недоступен" : `${Number(wallet.balance).toFixed(4)} ETH`} · сеть {wallet.chainId}
            </span>
          ) : <span>Подключение для подачи заявок и управления проектами</span>}
        </div>
        <div className="actions">
          {isDemo ? (
            <fieldset className="segmented" aria-label="Роль в демо">
              <button disabled={blocked} aria-pressed={role === 0} onClick={() => void connect("demo", 0)}>Автор</button>
              <button disabled={blocked} aria-pressed={role === 1} onClick={() => void connect("demo", 1)}>Участник</button>
            </fieldset>
          ) : (
            <button className="button secondary" disabled={blocked || !demoAllowed} onClick={() => void connect("demo")}>
              Войти в демо
            </button>
          )}
          {wallet?.mode === "metamask" && wallet.address ? null : (
            <button className="button secondary" disabled={blocked} onClick={() => void connect("metamask")}>MetaMask</button>
          )}
          {wallet && (
            <button className="button quiet" disabled={blocked} onClick={disconnect}>Отключить</button>
          )}
        </div>
      </div>
      {connecting && <p className="wallet-note" role="status">Подключение…</p>}
      {wallet?.address && <details className="wallet-note"><summary>Полный адрес</summary><code>{wallet.address}</code></details>}
      {wallet && wallet.chainId !== CHAIN_ID && (
        <Notice error>Выберите сеть Hardhat в MetaMask. Требуется chain ID 31337, сейчас {wallet.chainId}.</Notice>
      )}
      {wallet?.mode === "metamask" && !wallet.address && <Notice>Выберите доступный аккаунт в MetaMask.</Notice>}
      {error && <Notice error>{error}</Notice>}
    </section>
  );
}

export function ProjectCard({ project, children }: { project: Project; children?: ReactNode }) {
  const progress = Math.round(project.acceptedCount / project.capacity * 100);
  const phase = projectStatus(project);
  return (
    <article className="card project" data-project-id={project.id}>
      <div className="project-top">
        <span className={phase === "Идёт набор" ? "badge open" : "badge neutral"}>{phase}</span>
        <span className="muted project-id">#{project.id}</span>
      </div>
      <h3>{project.title}</h3>
      <p className="description">{project.description}</p>
      <ul className="tags" aria-label="Требуемые навыки">
        {splitSkills(project.requiredSkills).map((skill, i) => <li key={i}>{skill}</li>)}
      </ul>
      <div className="project-bottom">
        <div className="capacity-line">
          <span>Участники</span>
          <strong>{project.acceptedCount} / {project.capacity}</strong>
        </div>
        <div className="progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <span className="project-owner" title={project.owner}>Автор <code>{shortAddress(project.owner)}</code></span>
        {children}
      </div>
    </article>
  );
}

export function Catalog({ projects, renderAction }: {
  projects: Project[];
  renderAction: (project: Project) => ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const terms = query.toLocaleLowerCase("ru").trim().split(/\s+/);
  const filtered = [...projects].reverse().filter((project) => {
    const text = [project.title, project.description, project.requiredSkills, project.owner]
      .join(" ").toLocaleLowerCase("ru");
    return (status === "all" || status === projectStatus(project)) && terms.every((term) => text.includes(term));
  });
  return (
    <>
      <div className="filter-bar">
        <label className="search-label">
          <span>Поиск по каталогу</span>
          <input type="search" placeholder="Проект, навык или адрес" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label>
          <span id="catalog-status-label">Статус</span>
          <select aria-labelledby="catalog-status-label" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">Все проекты</option>
            <option>Идёт набор</option>
            <option>Команда набрана</option>
            <option>Закрыт</option>
          </select>
        </label>
      </div>
      {filtered.length > 0 ? (
        <div className="project-grid">
          {filtered.map((project) => (
            <ProjectCard key={project.id} project={project}>{renderAction(project)}</ProjectCard>
          ))}
        </div>
      ) : <Notice>{projects.length === 0 ? "В реестре пока нет проектов. Создайте проект или выполните npm run seed." : "По вашему запросу ничего не найдено."}</Notice>}
    </>
  );
}

export function CreateProject({ disabled, create }: {
  disabled: boolean;
  create: (values: [string, string, string, number]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [error, setError] = useState("");
  const fields = [
    ["title", "Название проекта", 120],
    ["description", "Описание проекта", 1200],
    ["skills", "Навыки через запятую", 320],
  ] as const;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const encoder = new TextEncoder();
    const values = fields.map(([key, label, max]) => ({
      label, max, value: key === "skills" ? splitSkills(draft[key]).join(", ") : draft[key].trim(),
    }));
    const invalid = values.find(({ max, value }) => !value || encoder.encode(value).length > max);
    if (invalid) {
      setError(`${invalid.label} — обязательное поле, максимум ${invalid.max} байт UTF-8.`);
      return;
    }
    setError("");
    if (await create([values[0]!.value, values[1]!.value, values[2]!.value, Number(draft.capacity)])) {
      setDraft(emptyDraft);
    }
  }

  return (
    <form className="card form" onSubmit={submit}>
      <Notice>Название, описание и навыки видны всем в локальной цепочке. Указывайте только открытые учебные данные.</Notice>
      {fields.map(([key, label, max]) => {
        const props = {
          value: draft[key],
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setDraft({ ...draft, [key]: event.target.value }),
          required: true,
          maxLength: max,
        };
        return (
          <label key={key}>
            <span>{label}</span>
            {key === "description" ? <textarea rows={5} {...props} /> : <input {...props} />}
            <small>{new TextEncoder().encode(draft[key]).length} / {max} байт UTF-8</small>
          </label>
        );
      })}
      <label className="number-field">
        <span>Мест для участников</span>
        <input type="number" min={1} max={30} step={1} required value={draft.capacity}
          onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} />
      </label>
      {error && <Notice error>{error}</Notice>}
      <button className="button primary" disabled={disabled} type="submit">Опубликовать в реестре</button>
    </form>
  );
}

export function ProfileForm({ profile, save }: { profile: Profile; save: (profile: Profile) => boolean }) {
  const [draft, setDraft] = useState(profile);
  const [notice, setNotice] = useState<{ message: string; error?: boolean }>();

  function submit(event: FormEvent) {
    event.preventDefault();
    const tags = [...splitSkills(draft.skills), ...splitSkills(draft.interests)];
    if (tags.some((tag) => tag.length > 320) ||
        splitSkills(draft.skills).length > 160 || splitSkills(draft.interests).length > 160) {
      setNotice({ message: "Допустимо до 160 навыков и 160 интересов, до 320 символов каждый.", error: true });
      return;
    }
    const stored = save(draft);
    setNotice(stored ? { message: "Профиль сохранён в этом браузере." }
      : { message: "Профиль доступен в этой сессии. Браузер не разрешил локальное сохранение.", error: true });
  }

  return (
    <form className="card form" onSubmit={submit}>
      <p className="muted">Введите навыки и интересы через запятую. При запросе рекомендаций профиль отправляется в локальный API.</p>
      <label>
        <span>Мои навыки</span>
        <input value={draft.skills} maxLength={2000} placeholder="Python, ML, pandas"
          onChange={(event) => { setDraft({ ...draft, skills: event.target.value }); setNotice(undefined); }} />
      </label>
      <label>
        <span>Мои интересы</span>
        <input value={draft.interests} maxLength={2000} placeholder="Временные ряды, прогнозирование"
          onChange={(event) => { setDraft({ ...draft, interests: event.target.value }); setNotice(undefined); }} />
      </label>
      <label>
        <span>Краткое описание</span>
        <textarea rows={4} maxLength={800} value={draft.bio} placeholder="Какими задачами вы хотите заниматься?"
          onChange={(event) => { setDraft({ ...draft, bio: event.target.value }); setNotice(undefined); }} />
      </label>
      <button className="button primary" type="submit">Сохранить профиль</button>
      {notice && <Notice error={notice.error}>{notice.message}</Notice>}
    </form>
  );
}

export function Recommended({ address, profile, renderAction }: {
  address?: string;
  profile: Profile;
  renderAction: (project: Project) => ReactNode;
}) {
  const [items, setItems] = useState<RankedProject[]>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const current = useRef<AbortController>(null);
  useEffect(() => () => current.current?.abort(), []);

  async function load() {
    if (!address) return;
    current.current?.abort();
    const controller = new AbortController();
    current.current = controller;
    setLoading(true);
    setError("");
    setItems(undefined);
    try {
      const result = await requestRecommendations(address, profile, controller.signal);
      if (!controller.signal.aborted) setItems(result);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error, "Рекомендации недоступны."));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const hasProfile = Object.values(profile).some((value) => value.trim());
  return (
    <>
      <div className="card recommendation-intro">
        <div>
          <h2>Подбор по вашему профилю</h2>
          <p className="muted">До пяти открытых проектов. Оценка показывает близость профиля и описания проекта.</p>
        </div>
        <button className="button primary" disabled={!address || !hasProfile || loading} onClick={() => void load()}>
          {loading ? "Подбираем…" : "Получить рекомендации"}
        </button>
      </div>
      {!address && <Notice>Подключите кошелёк, чтобы учесть ваши проекты и заявки.</Notice>}
      {address && !hasProfile && <Notice>Сохраните навыки или интересы во вкладке «Профиль».</Notice>}
      {loading && <Notice>Читаем проекты из сети и рассчитываем близость…</Notice>}
      {error && <Notice error>{error}</Notice>}
      {items?.length === 0 && <Notice>Подходящих проектов пока нет. Попробуйте уточнить профиль.</Notice>}
      {items && items.length > 0 && (
        <div className="project-grid" aria-label="Результаты рекомендаций">
          {items.map(({ project, recommendation }) => (
            <ProjectCard key={project.id} project={project}>
              <div className="score"><strong>Близость {(recommendation.score * 100).toFixed(1)}%</strong>
                <p>{recommendation.explanation}</p></div>
              {renderAction(project)}
            </ProjectCard>
          ))}
        </div>
      )}
    </>
  );
}

const eventLabels: Record<string, string> = {
  ProjectCreated: "Проект создан", ApplicationSubmitted: "Заявка подана",
  ApplicationStatusChanged: "Статус заявки изменён", ProjectClosed: "Проект закрыт",
};

function eventText(event: ChainEvent) {
  const [id, actor, , status] = event.args;
  const decision = status === undefined ? "" : " · " + applicationStatus[Number(status)];
  return `${eventLabels[event.name] || event.name} · проект #${id}${actor ? " · " + shortAddress(actor) : ""}${decision}`;
}

export function ReceiptCard({ receipt }: { receipt: Receipt }) {
  return (
    <section className="receipt" aria-label="Последняя транзакция" data-testid="receipt">
      <div className="receipt-title"><strong>Транзакция подтверждена</strong><span>Блок {receipt.block} · status {receipt.status}</span></div>
      <code className="hash">{receipt.hash}</code>
      <ul>{receipt.events.map((event, i) => (
        <li key={i}><code>{event.name}</code> · {eventText(event)}</li>
      ))}</ul>
    </section>
  );
}

export function History({ entries }: { entries: HistoryEntry[] }) {
  const [limit, setLimit] = useState(20);
  if (entries.length === 0) return <Notice>В текущем развёртывании пока нет событий.</Notice>;
  return (
    <div className="stack">
      <ol className="event-list">
        {entries.slice(0, limit).map((entry) => (
          <li className="card event-row" key={entry.hash + ":" + entry.index}>
            <div><strong>{eventText(entry)}</strong><span>Блок {entry.block}</span></div>
            <code>{entry.name}</code>
            <code className="hash">{entry.hash}</code>
          </li>
        ))}
      </ol>
      {entries.length > limit && <button className="button secondary" onClick={() => setLimit(limit + 20)}>Показать ещё</button>}
    </div>
  );
}
