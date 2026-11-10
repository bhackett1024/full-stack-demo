import { InspectionCache } from "./inspection-cache";
import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
const LazyMarkdown = React.lazy(() =>
  import("./Markdown").then((module) => ({ default: module.Markdown })),
);
const Markdown = React.memo(function Markdown({
  children,
}: {
  children: string;
}) {
  return (
    <React.Suspense fallback={<div className="markdown">{children}</div>}>
      <LazyMarkdown>{children}</LazyMarkdown>
    </React.Suspense>
  );
});
import {
  Trash2,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  ChevronRight,
  ChevronDown,
  Play,
  Pause,
  Monitor,
  Server,
  Layers,
  Terminal,
  Check,
  Clock,
  LoaderCircle,
  X,
  GitBranch,
  CornerDownLeft,
  ExternalLink,
  RefreshCw,
  Square,
  Link,
  AlertTriangle,
  Code2,
  Braces,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  Pair,
  Question,
  Marker,
  Inspection,
  ConversationEvent,
  Shot,
} from "../../packages/domain/types";
import {
  formatTime,
  screenshotAt,
  browserRecordings,
  shotsFor,
  displayTime,
} from "../../packages/domain/types";
import { prepared, scanPercent } from "../../packages/domain/preparation";
import "./style.css";
async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data;
}
const post = <T,>(path: string, data: unknown = {}) =>
  api<T>(path, { method: "POST", body: JSON.stringify(data) });
function route() {
  const parts = location.hash.slice(1).split("?");
  return {
    pairId: decodeURIComponent(parts[0] || ""),
    query: new URLSearchParams(parts[1] ?? ""),
  };
}
function navigate(pairId = "", q?: string, point?: string) {
  location.hash =
    encodeURIComponent(pairId) +
    (q
      ? `?q=${encodeURIComponent(q)}${point ? `&point=${encodeURIComponent(point)}` : ""}`
      : "");
}
function Status({ status }: { status: string }) {
  return (
    <span className={`status ${status}`}>
      <i />
      {status === "complete"
        ? "Answered"
        : status === "ready"
          ? "Ready"
          : status === "queued"
            ? "Queued"
            : status[0]?.toUpperCase() + status.slice(1)}
    </span>
  );
}
function App() {
  const [current, setCurrent] = useState(route),
    [pairs, setPairs] = useState<Pair[]>([]),
    [modal, setModal] = useState<"import" | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const refresh = async () => {
    try {
      setPairs(await api<Pair[]>("/pairs"));
      setError("");
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const handler = () => setCurrent(route());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (!current.pairId) void refresh();
  }, [current.pairId]);
  return (
    <>
      <header className="app-header">
        <a href="#" className="brand">
          <img
            src="/replay-logo.svg"
            className="brand-logo"
            alt="Replay"
            width="26"
            height="31"
          />
          Full Stack Demo
          <span className="brand-divider" />{" "}
          <span className="brand-caption">Full-stack replay</span>
        </a>
      </header>
      {error && (
        <div className="global-error" role="alert">
          <AlertTriangle size={17} />
          {error}
          <button onClick={() => void refresh()}>Retry</button>
        </div>
      )}
      {current.pairId ? (
        <Workspace
          key={current.pairId}
          pairId={current.pairId}
          query={current.query}
        />
      ) : (
        <Library
          pairs={pairs}
          loading={loading}
          onImport={() => setModal("import")}
        />
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(null)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Add recording group"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button close"
              aria-label="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>

            <ImportForm
              onDone={async (id) => {
                setModal(null);
                await refresh();
                navigate(id);
              }}
            />
          </section>
        </div>
      )}
    </>
  );
}
function Library({
  pairs,
  loading,
  onImport,
}: {
  pairs: Pair[];
  loading: boolean;
  onImport: () => void;
}) {
  const [search, setSearch] = useState(""),
    [sort, setSort] = useState("recent");
  let visible = pairs.filter((p) =>
    `${p.name} ${p.app}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (sort === "name")
    visible = [...visible].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <main className="library">
      <div className="page-heading">
        <div>
          <h1>Recordings</h1>
          <p>Browse recordings and investigate what happened.</p>
        </div>
        <button className="button primary" onClick={onImport}>
          <Plus size={17} />
          Add recording group
        </button>
      </div>
      <div className="section-toolbar">
        <strong>
          {pairs.length} recording group{pairs.length === 1 ? "" : "s"}
        </strong>
        <div className="toolbar-controls">
          <label className="search-box">
            <Search size={15} />
            <input
              aria-label="Search recordings"
              placeholder="Search recordings…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Sort recordings"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="recent">Newest first</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>
      <section className="recording-table">
        <div className="table-head">
          <span>RECORDING</span>
          <span>RECORDINGS</span>
          <span>DURATION</span>
          <span>QUESTIONS</span>
          <span>STATUS</span>
          <span />
        </div>
        {loading ? (
          <div className="empty">
            <LoaderCircle className="spin" />
            Loading your workspace…
          </div>
        ) : (
          visible.map((pair, i) => (
            <button
              key={pair.id}
              className="recording-row"
              onClick={() => navigate(pair.id)}
            >
              <div className="recording-title">
                <span className={`project-icon project-${i % 3}`}>
                  <Layers size={21} />
                </span>
                <div>
                  <strong>{pair.name}</strong>
                  <small>{pair.app}</small>
                </div>
              </div>
              <span className="runtime-pair">
                <Monitor size={14} />
                {browserRecordings(pair).length} browser
                {browserRecordings(pair).length === 1 ? "" : "s"}
                <span className="connect-line" />
                <Server size={14} />
                Backend
              </span>
              <span className="mono">{formatTime(pair.data.duration)}</span>
              <span className="question-count">
                {pair.question_count ?? 0} <span>questions</span>
              </span>
              <Status status={pair.status} />
              <ArrowUpRight size={18} />
            </button>
          ))
        )}
        {!loading && !visible.length && (
          <div className="empty">
            <Layers size={36} strokeWidth={1} />
            <h3>
              {pairs.length
                ? "No matching recordings"
                : "Start with a recording group"}
            </h3>
            <p>
              {pairs.length
                ? "Try another search."
                : "Add browser and backend recordings to get started."}
            </p>
            {!pairs.length && (
              <button className="button primary" onClick={onImport}>
                Add recording group
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
function ImportForm({ onDone }: { onDone: (id: string) => void }) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [browserCount, setBrowserCount] = useState(1);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const f = new FormData(e.currentTarget);
        try {
          const result: any = await post("/pairs", {
            name: f.get("name"),
            app: f.get("app"),
            browsers: Array.from({ length: browserCount }, (_, i) => ({
              id: String(f.get(`browser-${i}`))
                .trim()
                .replace(/^.*\/recording\//, "")
                .split(/[?#]/)[0],
              label: f.get(`label-${i}`),
              ...(f.get(`offset-${i}`)
                ? { offset: Number(f.get(`offset-${i}`)) }
                : {}),
            })),
            backendId: String(f.get("backend"))
              .trim()
              .replace(/^.*\/recording\//, "")
              .split(/[?#]/)[0],
            ...(f.get("offset") ? { offset: Number(f.get("offset")) } : {}),
            correlations: f.get("correlations")
              ? JSON.parse(String(f.get("correlations")))
              : [],
          });
          onDone(result.id);
        } catch (e) {
          setError((e as Error).message);
          setBusy(false);
        }
      }}
    >
      <span className="eyebrow">CONNECT THE STACK</span>
      <h2>Add a recording group</h2>
      <p className="muted">
        Connect one or more browser recordings to their shared backend.
      </p>
      {[
        ["name", "Recording name", "e.g. Checkout total changes"],
        ["app", "Application", "e.g. Acme Store"],

        ["backend", "Backend recording ID", "Replay recording UUID"],
      ].map(([name, label, placeholder]) => (
        <label className="form-label" key={name}>
          {label}
          <input
            name={name}
            placeholder={placeholder}
            required
            maxLength={100}
          />
        </label>
      ))}
      {Array.from({ length: browserCount }, (_, i) => (
        <fieldset className="browser-import" key={i}>
          <legend>Browser {i + 1}</legend>
          <label className="form-label">
            Person or browser name
            <input
              name={`label-${i}`}
              required
              maxLength={100}
              placeholder="e.g. Maya Chen"
            />
          </label>
          <label className="form-label">
            Recording URL or ID
            <input
              name={`browser-${i}`}
              required
              placeholder="Replay recording URL or UUID"
            />
          </label>
          <label className="form-label">
            Start offset on shared timeline (ms)
            <input
              name={`offset-${i}`}
              type="number"
              min="0"
              step="any"
              placeholder="Unknown — show relative time"
            />
          </label>
        </fieldset>
      ))}
      <div className="browser-import-actions">
        <button
          type="button"
          className="button secondary"
          disabled={browserCount >= 12}
          onClick={() => setBrowserCount((n) => n + 1)}
        >
          Add another browser
        </button>
        {browserCount > 1 && (
          <button
            type="button"
            className="button secondary"
            onClick={() => setBrowserCount((n) => n - 1)}
          >
            Remove last browser
          </button>
        )}
      </div>
      <details className="advanced">
        <summary>Clock alignment & request correlations</summary>
        <label className="form-label">
          Backend start offset on shared timeline (ms)
          <input
            name="offset"
            type="number"
            step="any"
            placeholder="Leave blank if unknown"
          />
        </label>
        <label className="form-label">
          Correlation manifest (optional JSON)
          <textarea
            name="correlations"
            placeholder='[{"id":"request-1", "frontendPoint":…, "backendPoint":…, "method":"manual", "label":"POST /checkout", "lower":0, "upper":100}]'
          />
        </label>
      </details>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <button
        aria-label="Add recording group"
        aria-busy={busy}
        disabled={busy}
        className="button primary full"
      >
        {busy ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Plus size={16} />
        )}
        Add group
      </button>
    </form>
  );
}
function RecordingLoading({
  pair,
  error,
  onRetry,
}: {
  pair?: Pair;
  error: string;
  onRetry: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const progress = pair?.data.preparation;
  const failure =
    error ||
    (pair?.status === "error"
      ? pair.data.preparationError || "Recording loading failed."
      : "");
  const recordings =
    progress?.recordings ??
    (pair
      ? [
          ...browserRecordings(pair).map((b) => ({
            recordingId: b.id,
            label: b.label,
            state: "queued",
          })),
          {
            recordingId: pair.backend_id,
            label: pair.data.backendLabel ?? "Backend",
            state: "queued",
          },
        ]
      : []);
  return (
    <main className="recording-loading" aria-busy={!failure}>
      <a className="back-link" href="#">
        <ArrowLeft size={14} />
        All recordings
      </a>
      <div className="loading-heading">
        {failure ? (
          <AlertTriangle size={30} />
        ) : (
          <LoaderCircle className="spin" size={30} />
        )}
        <h1>
          {failure ? "Couldn’t load recordings" : "Loading your recordings"}
        </h1>
        <p>{pair?.name ?? "Opening workspace…"}</p>
      </div>
      <div className="loading-stage" role="status" aria-live="polite">
        {failure ||
          (pair && prepared(pair)
            ? "Loading saved questions…"
            : progress?.stage || "Connecting to Replay…")}
      </div>
      <div className="loading-recordings">
        {recordings.map((recording) => {
          const r =
            recording as import("../../packages/domain/preparation").RecordingProgress;
          const percent = scanPercent(r);
          return (
            <section className="loading-recording" key={r.recordingId}>
              <div>
                <strong>{r.label}</strong>
                <span>
                  {r.state === "ready" ? (
                    <>
                      <Check size={14} />
                      Replay ready
                    </>
                  ) : (
                    (r.phase ?? r.state)
                  )}
                </span>
              </div>
              {r.state !== "ready" &&
                (percent !== undefined ? (
                  <>
                    <progress
                      max={100}
                      value={percent}
                      aria-label={`${r.label} scan progress`}
                    />
                    <small>Region scan {Math.round(percent)}%</small>
                  </>
                ) : (
                  <progress aria-label={`${r.label} loading`} />
                ))}
              {r.regions?.total != null && (
                <small>
                  {r.regions.scanned} / {r.regions.total} regions scanned
                </small>
              )}
              {r.instrumentEngine?.state &&
                !["unknown", "done"].includes(r.instrumentEngine.state) &&
                r.state !== "ready" && (
                  <small>Analysis: {r.instrumentEngine.state}</small>
                )}
            </section>
          );
        })}
      </div>
      {failure ? (
        <button
          className="button primary"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await onRetry();
            } finally {
              setRetrying(false);
            }
          }}
        >
          {retrying ? "Retrying…" : "Retry loading"}
        </button>
      ) : (
        <p className="loading-help">
          The workspace opens when every recording is ready and its timeline
          data is loaded. Progress comes from Replay; some phases do not provide
          a percentage.
        </p>
      )}
    </main>
  );
}
function Workspace({
  pairId,
  query,
}: {
  pairId: string;
  query: URLSearchParams;
}) {
  const [pair, setPair] = useState<Pair>(),
    [workspaceLoaded, setWorkspaceLoaded] = useState(false),
    [questions, setQuestions] = useState<Question[]>([]),
    [selected, setSelected] = useState<any>(),
    [events, setEvents] = useState<ConversationEvent[]>([]),
    [time, setTime] = useState(0),
    [activeBrowser, setActiveBrowser] = useState<string>(),
    [hoveredFrame, setHoveredFrame] = useState<{
      browserId: string;
      shot: Shot;
    }>(),
    [marker, setMarker] = useState<Marker>(),
    [inspection, setInspection] = useState<
      Inspection & { inspectionToken?: string }
    >(),
    [inspectBusy, setInspectBusy] = useState(false),
    [inspectError, setInspectError] = useState(""),
    [inspectionSelection, setInspectionSelection] = useState(0),
    [error, setError] = useState(""),
    [questionText, setQuestionText] = useState(""),
    [asking, setAsking] = useState(false),
    [confirmDelete, setConfirmDelete] = useState(false),
    [deleting, setDeleting] = useState(false),
    [investigationsExpanded, setInvestigationsExpanded] = useState(true),
    [playing, setPlaying] = useState(false),
    [zoom, setZoom] = useState(1),
    [researchOpen, setResearchOpen] = useState(false),
    [rightPanelWidth, setRightPanelWidth] = useState(50),
    [timelineTrackWidth, setTimelineTrackWidth] = useState(500),
    [resizing, setResizing] = useState(false),
    [revision, setRevision] = useState<number>(),
    [reloadKey, setReloadKey] = useState(0),
    [preload, setPreload] = useState({ total: 0, ready: 0, failed: 0 }),
    [preloadRetry, setPreloadRetry] = useState(0);
  const [inspectionCache] = useState(
    () =>
      new InspectionCache((point, frameIndex) =>
        post(`/pairs/${pairId}/inspect`, { point, frameIndex }),
      ),
  );
  const questionId = query.get("q"),
    workspaceRef = useRef<HTMLElement>(null),
    timelineTracksRef = useRef<HTMLDivElement>(null),
    inspectorRef = useRef<HTMLElement>(null),
    inspectGeneration = useRef(0),
    initializedCursor = useRef(false),
    submission = useRef<string | undefined>(undefined),
    eventsRef = useRef<ConversationEvent[]>([]);
  useEffect(() => {
    const tracks = timelineTracksRef.current;
    if (!tracks) return;
    const measure = () =>
      setTimelineTrackWidth(
        Math.max(
          1,
          tracks.querySelector<HTMLElement>(".aligned-filmstrip")
            ?.clientWidth ?? 500,
        ),
      );
    const observer = new ResizeObserver(measure);
    observer.observe(tracks);
    measure();
    return () => observer.disconnect();
  }, [workspaceLoaded]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") setReloadKey((n) => n + 1);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    let stopped = false,
      started = false;
    let timer: ReturnType<typeof setTimeout>;
    let readyPair: Pair | undefined;
    const controller = new AbortController();
    const load = async () => {
      try {
        const [p, qs] = await Promise.all([
          readyPair ??
            api<Pair>(`/pairs/${pairId}`, { signal: controller.signal }),
          api<Question[]>(`/pairs/${pairId}/questions`, {
            signal: controller.signal,
          }),
        ]);
        if (stopped) return;
        setPair(p);
        if (!prepared(p)) {
          setWorkspaceLoaded(false);
          if (!started && p.status !== "preparing" && p.status !== "error") {
            started = true;
            await post(`/pairs/${pairId}/prepare`);
          }
          if (p.status !== "error") timer = setTimeout(load, 2000);
          return;
        }
        readyPair = p;
        if (!initializedCursor.current && p.data.shots.length) {
          initializedCursor.current = true;
          setTime(
            Math.max(
              ...browserRecordings(p).map(
                (b) => shotsFor(p, b.id)[0]?.time ?? 0,
              ),
            ),
          );
        }
        setQuestions(qs);
        setWorkspaceLoaded(true);
        if (qs.some((q) => ["queued", "running"].includes(q.status)))
          timer = setTimeout(load, 3000);
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [pairId, reloadKey]);
  useEffect(() => {
    setRevision(undefined);
    setConfirmDelete(false);
    setHoveredFrame(undefined);
    setMarker(undefined);
    setInspection(undefined);
    inspectGeneration.current++;
  }, [questionId]);
  useEffect(() => {
    setSelected(undefined);
    setEvents([]);
    eventsRef.current = [];
    let stopped = false,
      runId = "";
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const load = async () => {
      if (!questionId) return;
      try {
        const params = new URLSearchParams({
          events: "1",
          runId,
          afterSequence: String(eventsRef.current.at(-1)?.sequence ?? 0),
        });
        if (revision !== undefined) params.set("revision", String(revision));
        const q = await api(`/questions/${questionId}?${params}`, {
          signal: controller.signal,
        });
        if (stopped) return;
        if (q.pair_id !== pairId)
          throw new Error("This question belongs to another recording group.");
        if (runId !== q.run_id) {
          runId = q.run_id;
          eventsRef.current = [];
        }
        const incoming = q.events;
        delete q.events;
        const hasMore = q.hasMore;
        delete q.hasMore;
        setSelected(q);
        if (revision === undefined)
          setQuestions((qs) =>
            qs.map((item) =>
              item.id === q.id
                ? {
                    ...item,
                    status: q.status,
                    run_id: q.run_id,
                    answer: q.answer,
                    error: q.error,
                  }
                : item,
            ),
          );
        if (incoming?.length) {
          eventsRef.current = [
            ...new Map(
              [...eventsRef.current, ...incoming].map((e) => [e.sequence, e]),
            ).values(),
          ];
          setEvents(eventsRef.current);
        }
        if (hasMore || ["queued", "running"].includes(q.status))
          timer = setTimeout(load, hasMore ? 0 : 1500);
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    };
    void load();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [questionId, pairId, revision, reloadKey]);
  const timeline =
    selected?.timelines?.find((t: any) => t.revision === revision) ??
    selected?.timelines?.find((t: any) => t.run_id === selected.run_id);
  const markers: Marker[] =
    questionId && selected?.id === questionId ? (timeline?.markers ?? []) : [];
  const markerKeys = markers
    .map((m) => `${m.point.recordingId}:${m.point.executionPoint}`)
    .join("|");
  useEffect(() => {
    let stopped = false;
    const points = [
      ...new Map(
        markers.map((m) => [
          `${m.point.recordingId}:${m.point.executionPoint}`,
          m.point,
        ]),
      ).values(),
    ];
    let ready = 0,
      failed = 0;
    const report = () => {
      if (!stopped) setPreload({ total: points.length, ready, failed });
    };
    report();
    // A deep-linked point takes precedence; the remaining recording queues run in parallel.
    const requested = markers.find((m) => m.id === query.get("point"));
    if (requested)
      void inspectionCache.load(requested.point, 0, true).catch(() => {});
    for (const point of points)
      void inspectionCache.load(point).then(
        () => {
          ready++;
          report();
        },
        () => {
          failed++;
          report();
        },
      );
    return () => {
      stopped = true;
    };
  }, [markerKeys, inspectionCache, preloadRetry]);
  const inspect = async (m: Marker, frameId?: string) => {
    const generation = ++inspectGeneration.current;
    setResearchOpen(true);
    setMarker(m);
    setInspectError("");
    if (!frameId) setInspectionSelection((n) => n + 1);
    if (m.runtime === "frontend") setActiveBrowser(m.point.recordingId);
    setPlaying(false);
    if (!m.unmapped || m.runtime === "frontend")
      setTime(Math.max(0, Math.min(pair?.data.duration ?? m.time, m.time)));
    const frameIndex = frameId
      ? Math.max(0, inspection?.frames.findIndex((f) => f.id === frameId) ?? 0)
      : 0;
    const cached = inspectionCache.peek(m.point, frameIndex);
    setInspectBusy(!cached);
    if (cached) {
      setInspection(cached);
      return;
    }
    if (!frameId) setInspection(undefined);
    try {
      const result = await inspectionCache.load(m.point, frameIndex, true);
      if (generation === inspectGeneration.current) setInspection(result);
    } catch (e) {
      if (generation === inspectGeneration.current)
        setInspectError((e as Error).message);
    } finally {
      if (generation === inspectGeneration.current) setInspectBusy(false);
    }
  };
  useLayoutEffect(() => {
    if (!marker || !workspaceLoaded || !inspectorRef.current) return;
    inspectorRef.current.focus({ preventScroll: true });
    const item = inspectorRef.current.closest<HTMLElement>(".evidence-item");
    const pane = item?.closest<HTMLElement>(".investigations");
    if (item && pane)
      pane.scrollTop +=
        item.getBoundingClientRect().top -
        pane.getBoundingClientRect().top -
        12;
  }, [inspectionSelection, workspaceLoaded]);
  useEffect(() => {
    const id = query.get("point");
    const m = markers.find((m) => m.id === id);
    if (m && m.id !== marker?.id) void inspect(m);
  }, [query.toString(), timeline?.id, pair?.id]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setTime((t) => {
          if (t + 100 >= (pair?.data.duration ?? 0)) {
            setPlaying(false);
            return pair?.data.duration ?? 0;
          }
          return t + 100;
        }),
      100,
    );
    return () => clearInterval(timer);
  }, [playing, pair?.data.duration]);
  const closeInspection = () => {
    inspectGeneration.current++;
    setMarker(undefined);
    setInspection(undefined);
    navigate(pairId, questionId ?? undefined);
    document
      .querySelector<HTMLButtonElement>(".evidence-toggle[aria-expanded=true]")
      ?.focus({ preventScroll: true });
  };
  const jump = (m: Marker) => {
    setHoveredFrame(undefined);
    setResearchOpen(true);
    void inspect(m);
    if (questionId) navigate(pairId, questionId, m.id);
  };
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim() || !pair) return;
    setAsking(true);
    setError("");
    submission.current ??= crypto.randomUUID();
    try {
      const q = await post<Question>(`/pairs/${pairId}/questions`, {
        text: questionText,
        context: {
          time,
          point: marker?.point,
          mappingRevision: pair.data.mappingRevision,
          recordingId: activeBrowser ?? browserRecordings(pair)[0].id,
          screenshotTime: screenshotAt(
            shotsFor(pair, activeBrowser ?? browserRecordings(pair)[0].id),
            time,
          )?.localTime,
        },
        idempotencyKey: submission.current,
      });
      setQuestionText("");
      submission.current = undefined;
      setQuestions((qs) => [q, ...qs.filter((x) => x.id !== q.id)]);
      navigate(pairId, q.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAsking(false);
    }
  };
  const deleteInvestigation = async () => {
    if (!selected || deleting) return;
    const id = selected.id;
    setDeleting(true);
    setError("");
    try {
      await api(`/questions/${id}`, { method: "DELETE" });
      setQuestions((items) => items.filter((item) => item.id !== id));
      setConfirmDelete(false);
      if (route().query.get("q") === id) {
        setSelected(undefined);
        setMarker(undefined);
        setInspection(undefined);
        inspectGeneration.current++;
        navigate(pairId);
      }
      setReloadKey((n) => n + 1);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setDeleting(false);
    }
  };
  const mutate = async (path: string) => {
    try {
      await post(path);
      setReloadKey((n) => n + 1);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!pair || !prepared(pair) || !workspaceLoaded)
    return (
      <RecordingLoading
        pair={pair}
        error={error}
        onRetry={async () => {
          setError("");
          try {
            await post(`/pairs/${pairId}/prepare`);
            setReloadKey((n) => n + 1);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
    );
  const browsers = browserRecordings(pair);
  const selectedBrowser =
    browsers.find((b) => b.id === (hoveredFrame?.browserId ?? activeBrowser)) ??
    browsers[0];
  const shot = screenshotAt(shotsFor(pair, selectedBrowser.id), time);
  const recordingRows = [
    ...browsers.map((browser) => ({
      ...browser,
      runtime: "frontend" as const,
    })),
    { id: pair.backend_id, label: "Backend", runtime: "backend" as const },
  ].map((recording) => {
    const points = markers
      .map((m, index) => ({ m, index }))
      .filter(({ m }) => m.point.recordingId === recording.id)
      .map(({ m, index }) => ({
        m,
        index,
        anchor: Math.max(
          0,
          Math.min(100, (m.time / (pair.data.duration || 1)) * 100),
        ),
      }))
      .sort((a, b) => a.anchor - b.anchor);
    return { ...recording, points, height: 44 };
  });
  const evidenceList = (
    <section className="evidence-list" aria-label="Investigation points">
      <div className="points-heading">
        <strong>{markers.length} execution points</strong>
        {preload.ready + preload.failed < preload.total && (
          <span className="point-preload" role="status">
            <LoaderCircle size={12} className="spin" /> Loading {preload.ready}/
            {preload.total}
          </span>
        )}
        {preload.failed > 0 &&
          preload.ready + preload.failed === preload.total && (
            <button
              className="text-button"
              onClick={() => setPreloadRetry((n) => n + 1)}
            >
              Retry {preload.failed} points
            </button>
          )}
      </div>
      {markers.map((m, i) => (
        <div
          className={`evidence-item ${marker?.id === m.id ? "expanded" : ""}`}
          key={m.id}
        >
          <button
            className="evidence-toggle"
            onClick={() => (marker?.id === m.id ? closeInspection() : jump(m))}
            aria-expanded={marker?.id === m.id}
            aria-controls={
              marker?.id === m.id ? "execution-inspector" : undefined
            }
            aria-label={`Inspect ${m.label}`}
          >
            <span className={`point-number ${m.runtime}`}>{i + 1}</span>
            <div>
              <strong>{m.label}</strong>
              <small>{m.description}</small>
            </div>
            <span className="mono">
              {formatTime(m.unmapped ? (m.localTime ?? m.time) : m.time)}
            </span>
            <ChevronRight className="expand-chevron" size={14} />
          </button>
          {marker?.id === m.id && (
            <Inspector
              pair={pair}
              marker={m}
              data={inspection}
              busy={inspectBusy}
              panelRef={inspectorRef}
              error={inspectError}
              onRetry={() => void inspect(m)}
              onFrame={(id) => void inspect(m, id)}
              onClose={closeInspection}
            />
          )}
        </div>
      ))}
    </section>
  );
  return (
    <main
      ref={workspaceRef}
      style={
        {
          "--rail": `clamp(280px, ${rightPanelWidth}%, calc(100% - 320px))`,
          "--timeline-height": `${recordingRows.reduce((height, row) => height + row.height, 0) + 48}px`,
        } as React.CSSProperties
      }
      className={`workspace studio ${resizing ? "resizing" : ""} ${marker || query.get("point") ? "inspecting" : ""} ${researchOpen ? "research-open" : ""}`}
    >
      <div className="workspace-heading">
        <div>
          <a
            className="workspace-brand"
            href="#"
            aria-label="Full Stack Demo — All recordings"
            title="All recordings"
          >
            <img src="/replay-logo.svg" alt="" width="20" height="24" />
            <span>Full Stack Demo</span>
          </a>
          <span className="workspace-separator" aria-hidden="true">
            /
          </span>
          <h1>{pair.name}</h1>
          <p>
            {pair.app}
            <span> / </span>
            <Monitor size={13} /> {browsers.length} browser
            {browsers.length === 1 ? "" : "s"}{" "}
            <span className="connection-dash" /> <Server size={13} /> Backend
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="research-toggle icon-button"
            aria-label="Toggle investigations"
            aria-pressed={researchOpen}
            onClick={() => {
              closeInspection();
              setResearchOpen(!researchOpen);
            }}
          >
            <Terminal size={16} />
          </button>
          <span className="workspace-live">
            <i /> Recording ready
          </span>
          <details className="recording-details">
            <summary>
              <Layers size={14} /> Recordings <ChevronDown size={12} />
            </summary>{" "}
            <aside className="recording-context">
              <h3>Recordings</h3>
              <p>Browse the browser and backend recordings.</p>
              {browsers.map((browser) => (
                <a
                  className="runtime-card"
                  key={browser.id}
                  href={`https://app.replay.io/recording/${browser.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Monitor size={19} />
                  <div>
                    <strong>{browser.label}</strong>
                    <small title={browser.id}>{browser.id}</small>
                  </div>
                  <ExternalLink size={13} />
                </a>
              ))}
              <div className="vertical-link">
                <span /> <Link size={12} />
                {pair.data.correlations.length} request link
                {pair.data.correlations.length !== 1 ? "s" : ""}
                <span />
              </div>
              <div className="runtime-card backend">
                <Server size={19} />
                <div>
                  <strong>{pair.data.backendLabel ?? "Backend"}</strong>
                  <small title={pair.backend_id}>{pair.backend_id}</small>
                </div>
                <span className="purple-dot" />
              </div>
              <div className="alignment">
                <span>TIME ALIGNMENT</span>
                <strong>
                  {pair.data.alignment?.status === "aligned"
                    ? browsers.some((b) => b.clock?.model === "events")
                      ? "Event-aligned"
                      : "Synchronized"
                    : pair.data.alignment?.status === "partial"
                      ? "Partially aligned"
                      : "Not synchronized"}
                </strong>
                <small>
                  {pair.data.correlations.length} matched requests
                  {browsers.some((b) => b.clock?.model === "events") &&
                    " · timing between matches is approximate"}
                </small>
                {pair.data.alignment && (
                  <details className="alignment-evidence">
                    <summary>Alignment evidence</summary>
                    {pair.data.alignment.clocks.map((clock) => (
                      <p key={clock.recordingId}>
                        <strong>
                          {
                            browsers.find((b) => b.id === clock.recordingId)
                              ?.label
                          }
                        </strong>
                        : {clock.anchors} unique matches.{" "}
                        {clock.reason ??
                          `Constant clock offset; ±${Math.ceil(clock.uncertainty ?? 0)} ms uncertainty.`}
                      </p>
                    ))}
                    {pair.data.alignment.evidenceArtifactId && (
                      <a
                        href={`/api/artifacts/${pair.data.alignment.evidenceArtifactId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View recorded evidence ↗
                      </a>
                    )}
                  </details>
                )}
              </div>
            </aside>
          </details>
        </div>
      </div>
      {error && (
        <div className="notice error" role="alert">
          <AlertTriangle size={16} />
          {error}
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {pair.data.preparationError && (
        <div className="notice error">{pair.data.preparationError}</div>
      )}
      <section className="recording-stage">
        <div className="stage-main">
          <div
            className="preview-tabs"
            role="tablist"
            aria-label="Browser recordings"
          >
            {browsers.map((b) => (
              <button
                key={b.id}
                role="tab"
                aria-selected={selectedBrowser.id === b.id}
                onClick={() => {
                  setHoveredFrame(undefined);
                  setActiveBrowser(b.id);
                }}
              >
                <Monitor size={13} />
                {b.label}
              </button>
            ))}
          </div>
          <div
            className={`browser-previews ${browsers.length > 1 ? "multiple" : ""}`}
          >
            {browsers.map((browser) => {
              const frame =
                hoveredFrame?.browserId === browser.id
                  ? hoveredFrame.shot
                  : screenshotAt(shotsFor(pair, browser.id), time);
              return (
                <div
                  key={browser.id}
                  className={`browser-preview ${selectedBrowser.id === browser.id ? "active" : ""}`}
                >
                  <button
                    className="stage-label browser-selector"
                    onClick={() => setActiveBrowser(browser.id)}
                    aria-pressed={selectedBrowser.id === browser.id}
                  >
                    <span>
                      <Monitor size={14} />
                      {browser.label}
                    </span>
                    <span className="mono">
                      {frame
                        ? formatTime(frame.localTime ?? frame.time)
                        : "No frame yet"}
                    </span>
                  </button>
                  <div
                    className="screen-surround"
                    onClick={() => setActiveBrowser(browser.id)}
                  >
                    {frame ? (
                      <Screenshot pair={pair} shot={frame} />
                    ) : (
                      <div className="empty">
                        <Monitor size={28} />
                        <p>
                          {browser.error ??
                            (time < (shotsFor(pair, browser.id)[0]?.time ?? 0)
                              ? "The first frame is later in this recording."
                              : "No screenshot was captured at this time.")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="playback">
            <button
              className="icon-button"
              aria-label={playing ? "Pause playback" : "Play recording"}
              disabled={!pair.data.duration}
              onClick={() => setPlaying(!playing)}
            >
              {playing ? <Pause size={17} /> : <Play size={17} />}
            </button>
            <strong className="mono">{formatTime(time)}</strong>
            <span className="muted mono">
              / {formatTime(pair.data.duration)}
            </span>
            <span className="playback-spacer" />
            <span className="muted">
              {marker?.runtime === "backend"
                ? marker.unmapped
                  ? "Unmapped backend point · image unchanged"
                  : "Frontend image at or before backend time"
                : "Screenshot playback"}
            </span>
            <button
              className="icon-button"
              aria-label="Previous execution point"
              disabled={!markers.some((m) => m.time < time)}
              onClick={() => {
                const m = [...markers].reverse().find((m) => m.time < time);
                if (m) jump(m);
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <button
              className="icon-button"
              aria-label="Next execution point"
              disabled={!markers.some((m) => m.time > time)}
              onClick={() => {
                const m = markers.find((m) => m.time > time);
                if (m) jump(m);
              }}
            >
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </section>
      <section className="timeline">
        <div
          className="timeline-scroll"
          onScroll={() => setHoveredFrame(undefined)}
        >
          <div ref={timelineTracksRef} style={{ minWidth: `${zoom * 100}%` }}>
            {recordingRows.map((browser) => {
              const frames =
                browser.runtime === "frontend"
                  ? shotsFor(pair, browser.id)
                  : [];
              return (
                <div
                  className="browser-film-row"
                  key={browser.id}
                  style={{ height: browser.height }}
                >
                  <div className="browser-film-label">
                    {browser.runtime === "backend" ? (
                      <Server size={12} />
                    ) : (
                      <Monitor size={12} />
                    )}
                    {browser.label}
                  </div>
                  <div className="filmstrip aligned-filmstrip">
                    <TimelineTrack
                      frames={frames}
                      label={browser.label}
                      duration={pair.data.duration}
                      time={time}
                      runtime={browser.runtime}
                      onPreview={(shot) =>
                        setHoveredFrame({ browserId: browser.id, shot })
                      }
                      onPreviewEnd={() => setHoveredFrame(undefined)}
                      onSelect={(nextTime) => {
                        if (browser.runtime === "frontend")
                          setActiveBrowser(browser.id);
                        setTime(nextTime);
                        closeInspection();
                      }}
                    />
                    <div
                      className="recording-timeline-points"
                      aria-label={`${browser.label} execution points`}
                    >
                      {browser.points.map(({ m, index, anchor }) => (
                        <TimelinePoint
                          key={m.id}
                          marker={m}
                          index={index}
                          anchor={anchor}
                          selected={marker?.id === m.id}
                          onSelect={jump}
                          nearby={browser.points.filter(
                            (point) =>
                              (Math.abs(point.anchor - anchor) *
                                timelineTrackWidth) /
                                100 <
                              24,
                          )}
                        />
                      ))}
                    </div>
                    <div
                      className="playhead"
                      style={{
                        left: `${(time / (pair.data.duration || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
            <div className="time-ruler">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i}>{formatTime((pair.data.duration * i) / 6)}</span>
              ))}
            </div>
            <input
              className="scrubber"
              aria-label="Recording time"
              type="range"
              min={0}
              max={pair.data.duration || 1}
              step={10}
              value={time}
              onChange={(e) => {
                setTime(Number(e.target.value));
                closeInspection();
              }}
            />
          </div>
        </div>
        {questionId && !markers.length && (
          <p className="timeline-empty">
            {["queued", "running"].includes(selected?.status)
              ? "The investigation will add evidence-backed execution points here."
              : "No timeline points yet. Run an investigation to connect the evidence."}
          </p>
        )}
      </section>
      <div
        className="workspace-divider"
        role="separator"
        aria-label="Resize investigation panel"
        aria-orientation="vertical"
        aria-controls="investigation-panel"
        aria-valuemin={25}
        aria-valuemax={75}
        aria-valuenow={Math.round(rightPanelWidth)}
        aria-valuetext={`${Math.round(rightPanelWidth)}% investigation width`}
        tabIndex={0}
        title="Drag to resize · Double-click to reset"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          setResizing(true);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const bounds = workspaceRef.current?.getBoundingClientRect();
          if (bounds)
            setRightPanelWidth(
              Math.max(
                25,
                Math.min(
                  75,
                  ((bounds.right - event.clientX) / bounds.width) * 100,
                ),
              ),
            );
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
          setResizing(false);
        }}
        onLostPointerCapture={() => setResizing(false)}
        onDoubleClick={() => setRightPanelWidth(50)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            setRightPanelWidth((width) =>
              Math.max(
                25,
                Math.min(75, width + (event.key === "ArrowLeft" ? 2 : -2)),
              ),
            );
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setRightPanelWidth(event.key === "Home" ? 25 : 75);
          }
        }}
      />
      <section className="investigations" id="investigation-panel">
        <aside className="question-list">
          <button
            className="investigations-heading"
            aria-expanded={investigationsExpanded}
            aria-controls="investigation-picker"
            onClick={() => setInvestigationsExpanded((expanded) => !expanded)}
          >
            {investigationsExpanded ? (
              <ChevronDown size={15} />
            ) : (
              <ChevronRight size={15} />
            )}
            <span>Investigations</span>
            <span className="investigation-count">{questions.length}</span>
          </button>
          <div
            id="investigation-picker"
            className="investigation-picker"
            hidden={!investigationsExpanded}
          >
            <nav className="investigation-choices" aria-label="Investigations">
              <button
                className="investigation-choice new-investigation-choice"
                aria-current={!questionId ? "true" : undefined}
                onClick={() => navigate(pairId)}
              >
                <Plus size={14} />
                <span>New investigation</span>
              </button>
              {questions.map((q) => (
                <button
                  key={q.id}
                  className="investigation-choice"
                  aria-current={questionId === q.id ? "true" : undefined}
                  title={q.text}
                  onClick={() => navigate(pairId, q.id)}
                >
                  <span className="investigation-choice-title">{q.text}</span>
                  <Status status={q.status} />
                </button>
              ))}
            </nav>
          </div>
        </aside>
        <article className="conversation">
          {!questionId ? (
            <form
              className="investigation-draft"
              onSubmit={ask}
              aria-label="New investigation"
            >
              <label htmlFor="question">Question</label>
              <textarea
                id="question"
                rows={5}
                placeholder="What would you like to investigate?"
                value={questionText}
                maxLength={4000}
                onChange={(e) => {
                  setQuestionText(e.target.value);
                  submission.current = undefined;
                }}
              />
              <button
                className="button primary"
                type="submit"
                disabled={asking || !questionText.trim()}
              >
                {asking ? (
                  <LoaderCircle size={15} className="spin" />
                ) : (
                  <ArrowRight size={15} />
                )}
                {asking ? "Starting…" : "Investigate"}
              </button>
            </form>
          ) : selected?.id !== questionId ? (
            <div className="investigation-loading" role="status">
              <LoaderCircle size={15} className="spin" /> Loading investigation…
            </div>
          ) : (
            <>
              <div className="conversation-heading">
                <span className="eyebrow">INVESTIGATION</span>
                <h2>{selected.text}</h2>
                <div>
                  <Status status={selected.status} />
                  <button
                    type="button"
                    className="delete-investigation"
                    aria-label="Delete investigation"
                    disabled={deleting}
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </div>
                {confirmDelete && (
                  <div
                    className="delete-investigation-confirm"
                    role="group"
                    aria-label="Confirm investigation deletion"
                  >
                    <span>Delete this investigation and its history?</span>
                    <button
                      type="button"
                      className="button secondary"
                      disabled={deleting}
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button danger"
                      disabled={deleting}
                      onClick={() => void deleteInvestigation()}
                    >
                      {deleting ? "Deleting…" : "Delete investigation"}
                    </button>
                  </div>
                )}
              </div>
              {selected.answer && (
                <div className="answer">
                  <div>
                    <Check size={16} />
                    <strong>What happened</strong>
                  </div>
                  <Markdown>{selected.answer}</Markdown>
                </div>
              )}
              {selected.error && (
                <div className="notice error">{selected.error}</div>
              )}
              {evidenceList}
              <div className="transcript-heading">
                <Terminal size={14} />
                <strong>Agent conversation</strong>
                <span>{events.length} events</span>
              </div>
              <div className="transcript">
                {events
                  .filter((e) => e.kind !== "answer")
                  .map((e) => (
                    <Event key={e.sequence} event={e} />
                  ))}
                {["queued", "running"].includes(selected.status) && (
                  <div className="agent-working">
                    <LoaderCircle size={14} className="spin" />
                    Investigating across the recording…
                  </div>
                )}
              </div>
              <div className="conversation-actions">
                {["queued", "running"].includes(selected.status) ? (
                  <button
                    className="button secondary"
                    disabled={deleting}
                    onClick={() =>
                      void mutate(`/runs/${selected.run_id}/cancel`)
                    }
                  >
                    <Square size={13} />
                    Stop investigation
                  </button>
                ) : (
                  <button
                    className="button secondary"
                    disabled={deleting}
                    onClick={() => {
                      setRevision(undefined);
                      void mutate(`/questions/${selected.id}/retry`);
                    }}
                  >
                    <RefreshCw size={13} />
                    {selected.status === "failed"
                      ? "Retry investigation"
                      : "Run again · new timeline revision"}
                  </button>
                )}
              </div>
            </>
          )}
        </article>
      </section>
    </main>
  );
}
function TimelinePoint({
  marker,
  index,
  anchor,
  selected,
  nearby,
  onSelect,
}: {
  marker: Marker;
  index: number;
  anchor: number;
  selected: boolean;
  nearby: { m: Marker; index: number }[];
  onSelect: (marker: Marker) => void;
}) {
  const [position, setPosition] = useState<{
    left: number;
    bottom: number;
    width: number;
  }>();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const tooltipId = React.useId();
  const cancelHide = () => clearTimeout(hideTimer.current);
  const hide = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPosition(undefined), 120);
  };
  const show = (element: HTMLButtonElement) => {
    cancelHide();
    const rect = element.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    setPosition({
      left: Math.max(
        12,
        Math.min(
          window.innerWidth - width - 12,
          rect.left + rect.width / 2 - width / 2,
        ),
      ),
      bottom: window.innerHeight - rect.top + 10,
      width,
    });
  };
  useEffect(() => {
    const dismiss = (event: Event) => {
      if (!tooltipRef.current?.contains(event.target as Node))
        setPosition(undefined);
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      cancelHide();
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);
  return (
    <>
      <button
        className={`timeline-point ${marker.runtime} ${selected ? "selected" : ""}`}
        style={{ left: `${anchor}%`, top: 12 }}
        aria-label={`Inspect point ${index + 1}: ${marker.label}`}
        aria-pressed={selected}
        aria-describedby={position ? tooltipId : undefined}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") show(event.currentTarget);
        }}
        onPointerLeave={hide}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={(event) => {
          if (!tooltipRef.current?.contains(event.relatedTarget as Node))
            hide();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            cancelHide();
            setPosition(undefined);
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          // Select before focus/tooltip changes can move the pointer-up target.
          event.preventDefault();
          cancelHide();
          setPosition(undefined);
          onSelect(marker);
        }}
        onClick={(event) => {
          // Keyboard and assistive activation do not have a pointer-down event.
          if (event.detail !== 0) return;
          cancelHide();
          setPosition(undefined);
          onSelect(marker);
        }}
      />
      {position &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            className="execution-point-tooltip"
            role="dialog"
            aria-label="Execution point details"
            style={position}
            onPointerEnter={cancelHide}
            onPointerLeave={hide}
            onFocus={cancelHide}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                hide();
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") setPosition(undefined);
            }}
          >
            {nearby.map(({ m, index: pointIndex }) => (
              <button
                key={m.id}
                className={`point-tooltip-entry ${m.runtime}`}
                onClick={() => {
                  setPosition(undefined);
                  onSelect(m);
                }}
              >
                <span className="point-tooltip-meta">
                  <span className="point-tooltip-number">
                    Point {pointIndex + 1}
                  </span>
                  <span className="point-tooltip-time">
                    {formatTime(m.time)}
                  </span>
                </span>
                <span className="point-tooltip-copy">
                  <strong>{m.label}</strong>
                  {m.description && m.description !== m.label && (
                    <span>{m.description}</span>
                  )}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function TimelineTrack({
  frames,
  label,
  duration,
  time,
  runtime,
  onPreview,
  onPreviewEnd,
  onSelect,
}: {
  frames: Shot[];
  label: string;
  duration: number;
  time: number;
  runtime: "frontend" | "backend";
  onPreview: (shot: Shot) => void;
  onPreviewEnd: () => void;
  onSelect: (time: number) => void;
}) {
  const [hoverTime, setHoverTime] = useState<number>();
  const timeAt = (event: React.MouseEvent<HTMLButtonElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(
      0,
      Math.min(
        duration,
        ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * duration,
      ),
    );
  };
  const preview = (nextTime: number) => {
    setHoverTime(nextTime);
    const shot = screenshotAt(frames, nextTime);
    if (shot) onPreview(shot);
    else onPreviewEnd();
  };
  const endPreview = () => {
    setHoverTime(undefined);
    onPreviewEnd();
  };
  return (
    <button
      className={`timeline-track ${runtime}`}
      aria-label={`${label} timeline`}
      onPointerMove={(event) => {
        if (event.pointerType !== "touch") preview(timeAt(event));
      }}
      onPointerLeave={endPreview}
      onFocus={() => preview(time)}
      onBlur={endPreview}
      onClick={(event) => {
        const nextTime = event.detail === 0 ? time : timeAt(event);
        endPreview();
        onSelect(nextTime);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") endPreview();
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          const nextTime = Math.max(
            0,
            Math.min(
              duration,
              time + ((event.key === "ArrowLeft" ? -1 : 1) * duration) / 100,
            ),
          );
          onSelect(nextTime);
          preview(nextTime);
        }
      }}
    >
      <i className="timeline-track-line" aria-hidden="true" />
      {frames.map((frame, index) => (
        <i
          key={`${frame.time}-${index}`}
          className="timeline-capture-tick"
          style={{ left: `${(frame.time / (duration || 1)) * 100}%` }}
          aria-hidden="true"
        />
      ))}
      {hoverTime !== undefined && (
        <i
          className="timeline-hover-cursor"
          style={{ left: `${(hoverTime / (duration || 1)) * 100}%` }}
          aria-hidden="true"
        />
      )}
    </button>
  );
}

function Screenshot({
  pair,
  shot,
  thumbnail = false,
  onLoad,
}: {
  pair: Pair;
  shot: Shot;
  thumbnail?: boolean;
  onLoad?: () => void;
}) {
  const url = `/api/pairs/${pair.id}/screenshot?recordingId=${shot.recordingId ?? pair.frontend_id}&time=${shot.time}`;
  return (
    <img
      onLoad={onLoad}
      loading={thumbnail ? "lazy" : "eager"}
      className="live-screenshot"
      src={`${url}&width=${thumbnail ? 128 : 960}`}
      srcSet={
        thumbnail
          ? `${url}&width=128 128w, ${url}&width=192 192w`
          : `${url}&width=480 480w, ${url}&width=960 960w`
      }
      sizes={thumbnail ? "64px" : "(max-width: 700px) 100vw, 40vw"}
      decoding="async"
      alt={`${browserRecordings(pair).find((b) => b.id === (shot.recordingId ?? pair.frontend_id))?.label ?? "Browser"} at ${formatTime(shot.localTime ?? shot.time)}`}
    />
  );
}
function Event({ event }: { event: ConversationEvent }) {
  if (event.kind === "usage")
    return (
      <details className="usage-note">
        <summary>Model usage · turn {event.content.turn}</summary>
        <p>
          {(event.content.input + event.content.cacheWrite).toLocaleString()}{" "}
          new input tokens · {event.content.cacheRead.toLocaleString()} cached
          input · {event.content.output.toLocaleString()} output
        </p>
      </details>
    );
  if (event.kind === "tool")
    return (
      <details className="tool-event">
        <summary>
          <span className={`tool-icon ${event.content.error ? "failed" : ""}`}>
            <Code2 size={13} />
          </span>
          <strong>{event.content.name}</strong>
          <span>{event.content.error ? "Failed" : "Tool result"}</span>
          <ChevronDown size={13} />
        </summary>
        <div>
          <small>INPUT</small>
          <pre>{JSON.stringify(event.content.arguments, null, 2)}</pre>
          <small>{event.content.error ? "ERROR" : "RESULT"}</small>
          <pre>
            {typeof event.content.result === "string"
              ? event.content.result
              : JSON.stringify(
                  event.content.result ?? event.content.error,
                  null,
                  2,
                )}
          </pre>
          {event.content.result?.artifactId && (
            <a
              target="_blank"
              rel="noreferrer"
              href={`/api/artifacts/${event.content.result.artifactId}`}
            >
              Open complete tool result
            </a>
          )}
        </div>
      </details>
    );
  return (
    <div
      className={`agent-message ${event.kind === "error" ? "error-text" : ""}`}
    >
      <span className="agent-symbol">
        <GitBranch size={14} />
      </span>
      <Markdown>{event.content.text ?? ""}</Markdown>
    </div>
  );
}
function Inspector({
  pair,
  marker,
  data,
  busy,
  panelRef,
  error,
  onRetry,
  onFrame,
  onClose,
}: {
  pair: Pair;
  marker: Marker;
  data?: Inspection & { inspectionToken?: string };
  busy: boolean;
  panelRef: React.RefObject<HTMLElement | null>;
  error: string;
  onRetry: () => void;
  onFrame: (id: string) => void;
  onClose: () => void;
}) {
  const sourceRef = useRef<HTMLPreElement>(null);
  const pausedLineRef = useRef<HTMLDivElement>(null);
  const pausedColumnRef = useRef<HTMLSpanElement>(null);
  const [sourceSize, setSourceSize] = useState(13);
  const frame = data?.frames.find((f) => f.id === data.selectedFrame);
  const revealPause = () => {
    const viewport = sourceRef.current,
      line = pausedLineRef.current;
    if (!viewport || !line) return;
    const view = viewport.getBoundingClientRect(),
      target = line.getBoundingClientRect();
    viewport.scrollTop +=
      target.top - view.top - (viewport.clientHeight - target.height) / 2;
    const column = pausedColumnRef.current;
    if (column) {
      const pos = column.getBoundingClientRect();
      const contentX = viewport.scrollLeft + pos.left - view.left;
      viewport.scrollLeft =
        contentX > viewport.clientWidth - 48
          ? Math.max(0, contentX - viewport.clientWidth * 0.6)
          : 0;
    } else viewport.scrollLeft = 0;
  };
  useLayoutEffect(() => {
    if (busy || !data) return;
    revealPause();
    const observer = new ResizeObserver(revealPause);
    if (sourceRef.current) observer.observe(sourceRef.current);
    return () => observer.disconnect();
  }, [data, busy, sourceSize]);
  return (
    <section
      className="inspector"
      id="execution-inspector"
      ref={panelRef}
      tabIndex={-1}
      aria-label={`Execution inspector: ${marker.label}`}
      aria-busy={busy}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <span className={`inspector-runtime ${marker.runtime}`}>
          {marker.runtime === "frontend" ? (
            <Monitor size={14} />
          ) : (
            <Server size={14} />
          )}{" "}
          {marker.runtime === "frontend"
            ? (browserRecordings(pair).find(
                (b) => b.id === marker.point.recordingId,
              )?.label ?? "Browser")
            : "Backend"}
        </span>
        <strong title={marker.label}>{marker.label}</strong>
        <span className="mono">{formatTime(marker.time)}</span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close inspector"
        >
          <X size={17} />
        </button>
      </header>
      {error && (
        <div className="notice error" role="alert">
          {error}{" "}
          <button className="text-button" onClick={onRetry}>
            Retry inspection
          </button>
        </div>
      )}
      {busy && !data ? (
        <div className="empty">
          <LoaderCircle className="spin" />
          Loading source, stack, and scopes…
        </div>
      ) : data ? (
        <>
          <div
            className={`inspector-grid ${marker.expressions?.length ? "with-expressions" : ""}`}
          >
            <section className="source-pane">
              <div className="pane-title source-title">
                <Code2 size={14} />
                <span className="source-filename" title={frame?.source}>
                  {frame?.source.split("/").at(-1)}
                </span>
                <button
                  type="button"
                  className="source-location"
                  onClick={revealPause}
                  disabled={busy}
                  aria-label="Jump to paused line"
                >
                  {busy
                    ? "Loading…"
                    : `Paused at ${data.line}:${(frame?.column ?? 0) + 1}`}
                </button>
                <button
                  type="button"
                  aria-label="Decrease source font size"
                  onClick={() => setSourceSize((n) => Math.max(10, n - 1))}
                  disabled={sourceSize <= 10}
                >
                  A−
                </button>
                <button
                  type="button"
                  aria-label="Increase source font size"
                  onClick={() => setSourceSize((n) => Math.min(22, n + 1))}
                  disabled={sourceSize >= 22}
                >
                  A+
                </button>
              </div>
              <pre
                className="source-code"
                ref={sourceRef}
                style={{ fontSize: sourceSize }}
                tabIndex={0}
                aria-label="Source code"
              >
                {data.source.split("\n").map((line, i) => {
                  const paused = i + 1 === data.line;
                  const column = Math.max(
                    0,
                    Math.min(line.length, frame?.column ?? 0),
                  );
                  return (
                    <div
                      className={paused ? "executing" : ""}
                      key={i}
                      ref={paused ? pausedLineRef : undefined}
                      aria-current={paused ? "location" : undefined}
                    >
                      <span className="line-number">
                        <span className="pause-arrow" aria-hidden="true">
                          {paused ? "▶" : ""}
                        </span>
                        {i + 1}
                      </span>
                      <code>
                        {paused ? (
                          <>
                            {highlight(line.slice(0, column))}
                            <span
                              ref={pausedColumnRef}
                              className="paused-column"
                            >
                              {highlight(line.slice(column, column + 1) || " ")}
                            </span>
                            {highlight(line.slice(column + 1))}
                          </>
                        ) : (
                          highlight(line)
                        )}
                      </code>
                    </div>
                  );
                })}
              </pre>
            </section>
            {!!marker.expressions?.length && (
              <section
                className="point-expressions"
                aria-label="Point expressions"
              >
                <div className="pane-title">
                  <Code2 size={13} /> EXPRESSIONS{" "}
                  <span className="expression-scope">
                    At this point · top frame
                  </span>
                </div>
                {marker.expressions.map((expression, index) => (
                  <div
                    className="point-expression"
                    key={`${expression.expression}-${index}`}
                  >
                    {expression.label && <strong>{expression.label}</strong>}
                    <code>{expression.expression}</code>
                    {expression.status === "pending" ? (
                      <span className="expression-pending">
                        <LoaderCircle size={12} className="spin" /> Evaluating…
                      </span>
                    ) : expression.status === "error" ? (
                      <pre className="expression-error">{expression.error}</pre>
                    ) : (
                      <Markdown>
                        {expression.result ?? "No value returned"}
                      </Markdown>
                    )}
                  </div>
                ))}
              </section>
            )}
            <details
              className="debug-details"
              key={`${marker.point.recordingId}:${marker.point.executionPoint}`}
            >
              <summary aria-label="Call stack and variables">
                <span>
                  <ChevronRight size={14} />
                  Call stack
                </span>
                <span>Variables</span>
              </summary>
              <div className="debug-details-content">
                <section className="stack-pane">
                  {data.frames.map((f) => (
                    <button
                      key={f.id}
                      className={f.id === data.selectedFrame ? "active" : ""}
                      onClick={() => onFrame(f.id)}
                    >
                      <strong>{f.name}</strong>
                      <small>
                        {f.source.split("/").at(-1)}:{f.line}
                      </small>
                    </button>
                  ))}
                </section>
                <section className="variables-pane">
                  {data.scopes.map((scope, i) => (
                    <details open key={`${scope.name}-${i}`}>
                      <summary>{scope.name}</summary>
                      {scope.values.map((v, j) => (
                        <Value
                          key={`${data.inspectionToken}-${data.selectedFrame}-${j}-${v.name}`}
                          name={v.name}
                          value={v.value}
                          objectId={v.objectId}
                          locator={v.locator}
                          pair={pair}
                          data={data}
                        />
                      ))}
                    </details>
                  ))}
                </section>
              </div>
            </details>
          </div>
          {data.warning && (
            <div className="inspector-warning">{data.warning}</div>
          )}
        </>
      ) : (
        <div className="empty">
          Inspection unavailable. Select another point or retry.
        </div>
      )}
    </section>
  );
}
function highlight(line: string) {
  return line
    .split(
      /("[^"]*"|'[^']*'|\/\/.*$|\b(?:const|let|return|export|async|await|function|if)\b|\b\d+\b)/g,
    )
    .map((part, i) => (
      <span
        key={i}
        className={
          part.startsWith("//")
            ? "syntax-comment"
            : /^['"]/.test(part)
              ? "syntax-string"
              : /^(const|let|return|export|async|await|function|if)$/.test(part)
                ? "syntax-keyword"
                : /^\d+$/.test(part)
                  ? "syntax-number"
                  : ""
        }
      >
        {part || " "}
      </span>
    ));
}
function Value({
  name,
  value,
  objectId,
  pair,
  data,
  depth = 0,
  locator,
}: {
  name: string;
  value: any;
  objectId?: string;
  pair: Pair;
  data: Inspection & { inspectionToken?: string };
  depth?: number;
  locator?: {
    frameIndex: number;
    scopeIndex: number;
    name: string;
    path: string[];
  };
}) {
  const [loaded, setLoaded] = useState<any>(
      () => data.objectPreviews?.[objectId ?? value?.objectId],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const obj = objectId ?? value?.objectId;
  const expandable = obj || (value !== null && typeof value === "object");
  if (!expandable)
    return (
      <div className="value">
        <span>{name}</span>
        <b className={typeof value === "number" ? "number" : ""}>
          {typeof value === "string" ? JSON.stringify(value) : String(value)}
        </b>
      </div>
    );
  return (
    <details
      className="object-value"
      onToggle={async (e) => {
        if (!e.currentTarget.open || !obj || loaded || busy) return;
        setBusy(true);
        setError("");
        try {
          setLoaded(
            await post(`/pairs/${pair.id}/objects`, {
              recordingId: data.point.recordingId,
              inspectionToken: data.inspectionToken,
              objectId: obj,
              point: data.point.executionPoint,
              locator,
            }),
          );
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <summary>
        <span>{name}</span>
        <b>
          {obj
            ? "Object"
            : Array.isArray(value)
              ? `Array(${value.length})`
              : "{…}"}
        </b>
      </summary>
      {busy ? (
        <small>Loading…</small>
      ) : error ? (
        <small className="error-text">{error}</small>
      ) : depth > 8 ? (
        <small>Expand in Replay DevTools for deeper values.</small>
      ) : obj ? (
        loaded?.preview?.properties?.map((p: any) => (
          <Value
            key={p.name}
            name={p.name}
            value={
              p.get
                ? "(getter; not invoked)"
                : p.value !== undefined
                  ? p.value
                  : p.object
                    ? { objectId: p.object }
                    : (p.unserializableNumber ?? p.bigint ?? "(unavailable)")
            }
            objectId={p.object}
            locator={
              locator
                ? { ...locator, path: [...locator.path, p.name] }
                : undefined
            }
            pair={pair}
            data={data}
            depth={depth + 1}
          />
        ))
      ) : (
        Object.entries(value).map(([key, val]) => (
          <Value
            key={key}
            name={key}
            value={val}
            pair={pair}
            data={data}
            depth={depth + 1}
          />
        ))
      )}
      {loaded?.preview?.overflow && (
        <small>
          Preview is incomplete; additional properties are unavailable in this
          response.
        </small>
      )}
    </details>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
