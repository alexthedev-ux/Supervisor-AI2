import { useState } from 'react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import { useForm } from 'react-hook-form';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity, ArrowUpRight, BarChart3, Bot, BrainCircuit, Check, ChevronRight, CircleDot, Clock3,
  Cloud, Coins, Cpu, FileClock, Gauge, GitBranch, Layers3, LifeBuoy, ListChecks, Loader2, Menu,
  Pause, Play, Plus, RotateCcw, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  Square, Terminal, TriangleAlert, WalletCards, X, Zap
} from 'lucide-react';
import {
  getGetTaskCheckpointsQueryKey, getGetTaskEventsQueryKey, getGetTaskQueryKey, getListModelsQueryKey,
  getListProvidersQueryKey, getListTasksQueryKey, getListWorkersQueryKey, useCancelTask, useCreateCheckpoint, useCreateTask,
  useGetBudgets, useGetDashboard, useGetTask, useGetTaskCheckpoints, useGetTaskEvents, useGetUsage,
  useListModels, useListProviders, useListTasks, useListWorkers, usePauseTask, useResumeTask,
  useRunSimulation, useStartTask,
} from '@workspace/api-client-react';
import type { Budget, Checkpoint, Dashboard, Model, Provider, Task, TaskEvent, Usage, Worker } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router as WouterRouter } from 'wouter';
import './index.css';

const queryClient = new QueryClient();
const nav = [
  { href: '/', label: 'Command center', icon: Gauge },
  { href: '/tasks', label: 'Task queue', icon: ListChecks },
  { href: '/workers', label: 'Workers & models', icon: Cpu },
  { href: '/usage', label: 'Usage & budget', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings2 },
];

function cn(...values: Array<string | false | null | undefined>) { return values.filter(Boolean).join(' '); }
function money(value = 0) { return `$${value.toFixed(2)}`; }
function number(value = 0) { return new Intl.NumberFormat('en-US').format(value); }
function time(value?: string) { return value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'; }
function dateTime(value?: string) { return value ? new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
function label(value?: string | null) { return value ? value.replaceAll('_', ' ') : 'unassigned'; }

function Status({ value }: { value?: string | null }) {
  const tone = value?.toLowerCase().includes('fail') || value?.toLowerCase().includes('error') || value === 'blocked'
    ? 'danger' : value === 'completed' || value === 'success' || value === 'passed'
      ? 'success' : value === 'running' || value === 'active' || value === 'in_progress'
        ? 'live' : value === 'paused' ? 'warn' : 'neutral';
  return <span data-testid={`status-${value ?? 'unknown'}`} className={`status status-${tone}`}><span className="status-dot" />{label(value)}</span>;
}

function Surface({ children, className, title, action }: { children: React.ReactNode; className?: string; title?: string; action?: React.ReactNode }) {
  return <section className={cn('surface', className)}>{title && <div className="surface-heading"><h2>{title}</h2>{action}</div>}{children}</section>;
}

function Metric({ label: metricLabel, value, note, icon: Icon, tone = 'teal' }: { label: string; value: string | number; note?: string; icon: typeof Activity; tone?: string }) {
  return <div className="metric-card" data-testid={`metric-${metricLabel.toLowerCase().replaceAll(' ', '-')}`}>
    <div className={`metric-icon metric-${tone}`}><Icon size={17} /></div>
    <div className="metric-copy"><div className="eyebrow">{metricLabel}</div><strong>{value}</strong>{note && <span>{note}</span>}</div>
  </div>;
}

function Empty({ label: emptyLabel = 'No data in this view.' }: { label?: string }) {
  return <div className="empty"><CircleDot size={20} /><span>{emptyLabel}</span></div>;
}

function Loading() {
  return <div className="loading-grid"><div className="skeleton wide" /><div className="skeleton" /><div className="skeleton" /><div className="skeleton large" /><div className="skeleton large" /></div>;
}

function Header({ title, kicker, onMenu }: { title: string; kicker: string; onMenu: () => void }) {
  return <header className="topbar"><button data-testid="button-open-navigation" className="mobile-menu" onClick={onMenu}><Menu size={20} /></button><div><div className="eyebrow">{kicker}</div><h1>{title}</h1></div><div className="topbar-tools"><div className="signal"><span className="signal-pulse" /> runtime nominal</div><button data-testid="button-support" className="icon-button" title="Open support" onClick={() => window.open('https://docs.replit.com', '_blank')}><LifeBuoy size={18} /></button><div className="operator"><span>OP</span><div><b>operator</b><small>control room</small></div></div></div></header>;
}

function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="app-shell">
    <aside className={cn('sidebar', mobileOpen && 'sidebar-open')}>
      <div className="brand"><div className="brand-mark"><span /><span /><span /></div><div><strong>supervisor</strong><small>AI control room</small></div><button data-testid="button-close-navigation" className="sidebar-close" onClick={() => setMobileOpen(false)}><X size={17} /></button></div>
      <div className="workspace-chip"><span className="workspace-dot" /><div><small>WORKSPACE</small><b>production / main</b></div><ChevronRight size={15} /></div>
      <nav className="primary-nav">{nav.map(({ href, label: navLabel, icon: Icon }) => <Link data-testid={`link-${navLabel.toLowerCase().replaceAll(' ', '-')}`} key={href} href={href} className={cn('nav-link', location === href && 'active')} onClick={() => setMobileOpen(false)}><Icon size={17} /><span>{navLabel}</span>{href === '/tasks' && <span className="nav-count">8</span>}</Link>)}</nav>
      <div className="sidebar-section"><div className="eyebrow">SYSTEM</div><div className="runtime-card"><div className="runtime-head"><span className="live-dot" /> orchestration live</div><div className="runtime-line"><span>Queue latency</span><b>142 ms</b></div><div className="runtime-line"><span>Policy engine</span><Status value="active" /></div></div></div>
      <div className="sidebar-bottom"><div className="build-label"><span>Supervisor build</span><b>0.9.14</b></div><div className="sidebar-help">Need a hand? <span>Open runbook <ChevronRight size={12} /></span></div></div>
    </aside>
    <main className="main"><Header title={getTitle(location)} kicker={getKicker(location)} onMenu={() => setMobileOpen(true)} /><div className="page-content">{children}</div></main>
  </div>;
}

function getTitle(location: string) { if (location.startsWith('/tasks/')) return 'Task detail'; if (location === '/tasks') return 'Task queue'; if (location === '/workers') return 'Workers & models'; if (location === '/usage') return 'Usage & budget'; if (location === '/settings') return 'Settings'; return 'Command center'; }
function getKicker(location: string) { if (location.startsWith('/tasks/')) return 'EXECUTION TRACE'; if (location === '/tasks') return 'ORCHESTRATION'; if (location === '/workers') return 'RUNTIME CATALOG'; if (location === '/usage') return 'FINOPS'; if (location === '/settings') return 'CONTROL PLANE'; return 'OPERATIONS / LIVE'; }

function DashboardPage() {
  const { data, isLoading, isError, refetch } = useGetDashboard();
  const dashboard = data as Dashboard | undefined;
  const { data: budgets } = useGetBudgets();
  const { data: usage } = useGetUsage();
  if (isLoading) return <Loading />;
  if (isError) return <ErrorState onRetry={() => refetch()} />;
  const d = dashboard ?? { activeTasks: 0, completedTasks: 0, failedTasks: 0, escalationTasks: 0, workersRunning: 0, tokensUsed: 0, cloudCost: 0, creditsRemaining: 0, recentEvents: [] };
  const budget = budgets as Budget | undefined;
  return <div className="animate-appear">
    <div className="page-intro"><div><p className="lede">Live telemetry across your AI engineering fleet.</p><p className="muted">Last synchronized just now · all systems operational</p></div><Link data-testid="link-view-task-queue" href="/tasks" className="button button-primary"><ListChecks size={16} /> View task queue</Link></div>
    <div className="metric-grid">
      <Metric label="Active tasks" value={d.activeTasks} note={`${d.workersRunning} workers running`} icon={Activity} />
      <Metric label="Completed today" value={d.completedTasks} note="across all scenarios" icon={Check} tone="green" />
      <Metric label="Cloud spend" value={money(d.cloudCost)} note="this billing cycle" icon={Cloud} tone="gold" />
      <Metric label="Credits remaining" value={money(d.creditsRemaining)} note={budget ? `${Math.round((budget.creditsRemaining / Math.max(budget.monthlyLimit, 1)) * 100)}% of monthly pool` : 'monthly pool'} icon={WalletCards} tone="slate" />
    </div>
    <div className="dashboard-grid">
      <Surface title="Active orchestration" className="active-panel" action={<Link data-testid="link-all-active-tasks" href="/tasks" className="text-link">View all <ChevronRight size={14} /></Link>}>
        <div className="activity-rail"><div className="rail-line live-line" /></div>
        <div className="active-list">{(d.recentEvents ?? []).slice(0, 4).map((event) => <EventRow key={event.id} event={event} />)}{!d.recentEvents?.length && <Empty label="No live events are being reported." />}</div>
      </Surface>
      <Surface title="Usage pulse" className="pulse-panel" action={<Link data-testid="link-usage-details" href="/usage" className="text-link">Details <ChevronRight size={14} /></Link>}>
        <div className="pulse-number">{number(d.tokensUsed)}<span> tokens</span></div>
        <div className="pulse-graph"><div className="graph-labels"><span>00:00</span><span>now</span></div><div className="spark-bars">{[30,42,36,58,48,72,62,85,66,92,76,100,82,94,88,100,91].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}</div></div>
        <div className="pulse-footer"><span><i className="legend local" /> local runs <b>{usage?.localRuns ?? '—'}</b></span><span><i className="legend cloud" /> cloud runs <b>{usage?.cloudRuns ?? '—'}</b></span></div>
      </Surface>
      <Surface title="Budget posture" className="budget-panel" action={<Link data-testid="link-budget-settings" href="/settings" className="text-link">Configure <ChevronRight size={14} /></Link>}>
        <div className="budget-row"><div><span className="eyebrow">TASK ALLOCATION</span><strong>{budget ? `${number(budget.taskUsed)} / ${number(budget.taskLimit)}` : '—'}</strong></div><span className="budget-percent">{budget ? `${Math.round((budget.taskUsed / Math.max(budget.taskLimit, 1)) * 100)}%` : '—'}</span></div>
        <div className="progress-track"><span style={{ width: `${Math.min(100, ((budget?.taskUsed ?? 0) / Math.max(budget?.taskLimit ?? 1, 1)) * 100)}%` }} /></div>
        <div className="budget-row second"><div><span className="eyebrow">MONTHLY CLOUD</span><strong>{budget ? `${money(budget.monthlyUsed)} / ${money(budget.monthlyLimit)}` : '—'}</strong></div><span className="budget-percent gold">{budget ? `${Math.round((budget.monthlyUsed / Math.max(budget.monthlyLimit, 1)) * 100)}%` : '—'}</span></div>
        <div className="progress-track gold-track"><span style={{ width: `${Math.min(100, ((budget?.monthlyUsed ?? 0) / Math.max(budget?.monthlyLimit ?? 1, 1)) * 100)}%` }} /></div>
      </Surface>
    </div>
    <Surface title="Recent activity" className="recent-panel" action={<button data-testid="button-refresh-activity" className="quiet-button" onClick={() => refetch()}><RotateCcw size={14} /> Refresh</button>}>
      <EventTable events={d.recentEvents ?? []} />
    </Surface>
  </div>;
}

function EventRow({ event }: { event: TaskEvent }) {
  return <div className="event-row" data-testid={`event-row-${event.id}`}><div className="event-icon"><GitBranch size={15} /></div><div className="event-body"><div><b>{event.action}</b><span className="muted"> · {event.message}</span></div><small>{event.worker ?? 'system'} <span>·</span> {time(event.timestamp)}</small></div><Status value={event.status} /></div>;
}

function EventTable({ events }: { events: TaskEvent[] }) {
  if (!events.length) return <Empty label="Events will appear here as the system works." />;
  return <div className="table-wrap"><table><thead><tr><th>Timestamp</th><th>Action</th><th>Worker / model</th><th>Status</th><th>Usage</th></tr></thead><tbody>{events.map((event) => <tr key={event.id} data-testid={`row-event-${event.id}`}><td className="mono">{time(event.timestamp)}</td><td><b>{event.action}</b><div className="cell-sub">{event.message}</div></td><td><span>{event.worker ?? 'system'}</span><div className="cell-sub">{event.model ?? '—'}</div></td><td><Status value={event.status} /></td><td className="mono">{number(event.tokens)} · {money(event.cost)}</td></tr>)}</tbody></table></div>;
}

function ErrorState({ onRetry }: { onRetry: () => void }) { return <div className="error-state"><TriangleAlert size={21} /><b>Telemetry unavailable</b><span>We could not reach the control plane.</span><button data-testid="button-retry" className="button button-secondary" onClick={onRetry}>Retry connection</button></div>; }

type TaskForm = { title: string; description: string; scenario: string; priority: string; budget: string };
function CreateTaskDialog({ onClose }: { onClose: () => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<TaskForm>({ defaultValues: { scenario: 'feature', priority: 'normal', budget: '5' } });
  const create = useCreateTask();
  const qc = useQueryClient();
  const onSubmit = (values: TaskForm) => create.mutate({ data: { title: values.title, description: values.description, scenario: values.scenario, priority: values.priority, budget: Number(values.budget) } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTasksQueryKey() }); onClose(); } });
  return <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true"><div className="modal-head"><div><div className="eyebrow">NEW ORCHESTRATION</div><h2>Queue a task</h2></div><button data-testid="button-close-create-task" className="icon-button" onClick={onClose}><X size={18} /></button></div><form onSubmit={handleSubmit(onSubmit)} className="modal-form">
    <label>Task title<input data-testid="input-task-title" {...register('title', { required: true })} placeholder="e.g. Add retry policy to deploy worker" />{errors.title && <small className="form-error">A title is required.</small>}</label>
    <label>Brief<input data-testid="input-task-description" {...register('description', { required: true })} placeholder="What should the worker accomplish?" />{errors.description && <small className="form-error">A brief is required.</small>}</label>
    <div className="form-row"><label>Scenario<select data-testid="select-task-scenario" {...register('scenario')}><option value="feature">Feature</option><option value="bugfix">Bug fix</option><option value="refactor">Refactor</option><option value="test">Test coverage</option></select></label><label>Priority<select data-testid="select-task-priority" {...register('priority')}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option><option value="low">Low</option></select></label></div>
    <label>Task budget (USD)<input data-testid="input-task-budget" type="number" step="0.25" min="0" {...register('budget')} /></label>
    <div className="modal-actions"><button data-testid="button-cancel-create-task" type="button" className="button button-secondary" onClick={onClose}>Cancel</button><button data-testid="button-submit-create-task" className="button button-primary" disabled={create.isPending}>{create.isPending && <Loader2 className="spin" size={15} />} Queue task</button></div>
  </form></div></div>;
}

function SimulationDialog({ onClose }: { onClose: () => void }) {
  const run = useRunSimulation(); const qc = useQueryClient();
  const [scenario, setScenario] = useState('standard feature delivery'); const [title, setTitle] = useState('Simulation run');
  const submit = () => run.mutate({ data: { scenario, title } }, { onSuccess: () => { qc.invalidateQueries({ queryKey: getListTasksQueryKey() }); onClose(); } });
  return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><div className="eyebrow">DRY RUN</div><h2>Simulate orchestration</h2></div><button data-testid="button-close-simulation" className="icon-button" onClick={onClose}><X size={18} /></button></div><p className="modal-copy">Preview worker routing, attempts, checkpoints, and spend without changing your production queue.</p><label>Simulation title<input data-testid="input-simulation-title" value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>Scenario<select data-testid="select-simulation-scenario" value={scenario} onChange={(e) => setScenario(e.target.value)}><option>standard feature delivery</option><option>multi-agent bug triage</option><option>dependency upgrade with validation</option><option>high-risk production hotfix</option></select></label><div className="simulation-note"><Sparkles size={16} /><span>Simulation uses the current policy and worker catalog.</span></div><div className="modal-actions"><button data-testid="button-cancel-simulation" className="button button-secondary" onClick={onClose}>Cancel</button><button data-testid="button-run-simulation" className="button button-primary" onClick={submit} disabled={run.isPending}>{run.isPending && <Loader2 className="spin" size={15} />} Run simulation</button></div></div></div>;
}

function TasksPage() {
  const { data, isLoading, isError, refetch } = useListTasks(); const tasks = (data as Task[] | undefined) ?? []; const [showCreate, setShowCreate] = useState(false); const [showSimulation, setShowSimulation] = useState(false); const [query, setQuery] = useState(''); const [status, setStatus] = useState('all');
  const filtered = tasks.filter((task) => (status === 'all' || task.status === status) && `${task.title} ${task.description}`.toLowerCase().includes(query.toLowerCase()));
  if (isLoading) return <Loading />; if (isError) return <ErrorState onRetry={() => refetch()} />;
  return <div className="animate-appear"><div className="page-intro"><div><p className="lede">Every task, attempt, and escalation in one traceable queue.</p><p className="muted">{tasks.length} tasks · sorted by latest activity</p></div><div className="button-row"><button data-testid="button-open-simulation" className="button button-secondary" onClick={() => setShowSimulation(true)}><Sparkles size={16} /> Simulate</button><button data-testid="button-open-create-task" className="button button-primary" onClick={() => setShowCreate(true)}><Plus size={16} /> New task</button></div></div>
    <div className="filter-bar"><div className="search-field"><Search size={16} /><input data-testid="input-task-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" /></div><div className="filter-tabs">{['all', 'running', 'queued', 'completed', 'failed'].map((item) => <button data-testid={`button-filter-${item}`} key={item} className={cn(status === item && 'selected')} onClick={() => setStatus(item)}>{label(item)}</button>)}</div><button data-testid="button-task-filters" className="quiet-button" onClick={() => setStatus('all')}><SlidersHorizontal size={15} /> Reset filters</button></div>
    <Surface className="task-table-surface"><div className="table-wrap"><table className="task-table"><thead><tr><th>Task</th><th>Status</th><th>Routing</th><th>Progress</th><th>Attempts</th><th>Spend</th><th>Updated</th><th /></tr></thead><tbody>{filtered.map((task) => <TaskRow key={task.id} task={task} />)}</tbody></table>{!filtered.length && <Empty label={query ? 'No tasks match this search.' : 'The queue is clear.'} />}</div></Surface>
    {showCreate && <CreateTaskDialog onClose={() => setShowCreate(false)} />}{showSimulation && <SimulationDialog onClose={() => setShowSimulation(false)} />}
  </div>;
}

function TaskRow({ task }: { task: Task }) {
  return <tr data-testid={`row-task-${task.id}`}><td><Link data-testid={`link-task-${task.id}`} href={`/tasks/${task.id}`} className="task-name"><span className={`priority-mark priority-${task.priority}`} /><div><b>{task.title}</b><div className="cell-sub task-id">{task.id} · {label(task.scenario)}</div></div></Link></td><td><Status value={task.status} /></td><td><div className="route-cell"><span className="avatar-mini">{(task.currentWorker ?? 'S').slice(0, 1).toUpperCase()}</span><div>{task.currentWorker ?? 'unassigned'}<small>{task.currentModel ?? 'awaiting route'}</small></div></div></td><td><div className="progress-cell"><span>{task.progress}%</span><div className="mini-progress"><i style={{ width: `${task.progress}%` }} /></div></div></td><td className="mono">{task.attempts} <span className="muted">({task.retryCount} retries)</span></td><td className="mono">{money(task.estimatedCost)}</td><td className="muted">{dateTime(task.updatedAt)}</td><td><Link data-testid={`link-open-task-${task.id}`} href={`/tasks/${task.id}`} className="row-arrow"><ChevronRight size={16} /></Link></td></tr>;
}

function TaskDetailPage() {
  const { id = '' } = useParams<{ id: string }>(); const { data: taskData, isLoading, isError, refetch } = useGetTask(id, { query: { queryKey: getGetTaskQueryKey(id), enabled: !!id } }); const { data: eventData } = useGetTaskEvents(id, { query: { queryKey: getGetTaskEventsQueryKey(id), enabled: !!id } }); const { data: checkpointData } = useGetTaskCheckpoints(id, { query: { queryKey: getGetTaskCheckpointsQueryKey(id), enabled: !!id } }); const task = taskData as Task | undefined; const events = (eventData as TaskEvent[] | undefined) ?? []; const checkpoints = (checkpointData as Checkpoint[] | undefined) ?? []; const [checkpointOpen, setCheckpointOpen] = useState(false);
  const qc = useQueryClient(); const start = useStartTask(); const pause = usePauseTask(); const resume = useResumeTask(); const cancel = useCancelTask(); const createCheckpoint = useCreateCheckpoint();
  if (isLoading) return <Loading />; if (isError || !task) return <ErrorState onRetry={() => refetch()} />;
  const act = (mutation: typeof start) => mutation.mutate({ taskId: id }, { onSuccess: (next) => { qc.setQueryData(getGetTaskQueryKey(id), next); qc.invalidateQueries({ queryKey: getGetTaskEventsQueryKey(id) }); } });
  const lastCheckpoint = checkpoints[checkpoints.length - 1];
  return <div className="animate-appear"><div className="breadcrumb"><Link data-testid="link-back-to-tasks" href="/tasks">Task queue</Link><ChevronRight size={14} /><span>{task.id}</span></div><div className="detail-heading"><div><div className="title-line"><span className={`priority-mark priority-${task.priority}`} /><h2>{task.title}</h2><Status value={task.status} /></div><p>{task.description}</p><div className="detail-meta"><span><Clock3 size={14} /> updated {dateTime(task.updatedAt)}</span><span><Terminal size={14} /> {label(task.scenario)}</span><span><Coins size={14} /> {money(task.estimatedCost)} of {money(task.budget)}</span></div></div><div className="button-row">{task.status === 'running' ? <button data-testid="button-pause-task" className="button button-secondary" onClick={() => act(pause)}><Pause size={15} /> Pause</button> : task.status === 'paused' ? <button data-testid="button-resume-task" className="button button-primary" onClick={() => act(resume)}><Play size={15} /> Resume</button> : <button data-testid="button-start-task" className="button button-primary" onClick={() => act(start)}><Play size={15} /> Start task</button>}<button data-testid="button-cancel-task" className="button button-danger" onClick={() => act(cancel)}><Square size={14} /> Cancel</button></div></div>
    <div className="detail-grid"><div className="detail-main"><Surface title="Execution timeline" action={<span className="live-caption"><span className="live-dot" /> live trace</span>}><Timeline events={events} /></Surface><Surface title="Validation & checkpoint" action={<button data-testid="button-open-checkpoint" className="quiet-button" onClick={() => setCheckpointOpen(true)}><Plus size={14} /> Add checkpoint</button>}><CheckpointCard checkpoint={lastCheckpoint} task={task} /></Surface></div><aside className="detail-side"><Surface title="Task health"><div className="health-score"><div className="score-ring" style={{ '--progress': `${task.progress * 3.6}deg` } as React.CSSProperties}><strong>{task.progress}</strong><span>%</span></div><div><b>{task.progress >= 100 ? 'Ready to ship' : 'In execution'}</b><p>{task.latestMessage}</p></div></div><div className="health-stats"><div><span>Successful attempts</span><b>{task.successfulAttempts}</b></div><div><span>Failed attempts</span><b>{task.failedAttempts}</b></div><div><span>Tokens consumed</span><b>{number(task.tokensUsed)}</b></div></div></Surface><Surface title="Current routing"><div className="routing-card"><div className="route-avatar"><Bot size={18} /></div><div><b>{task.currentWorker ?? 'Awaiting worker'}</b><span>{task.currentModel ?? 'No model assigned'}</span></div><ChevronRight size={16} /></div><div className="routing-detail"><span>Attempt</span><b>{task.attempts} / {Math.max(task.attempts, 1) + task.retryCount}</b></div></Surface><Surface title="Attempts"><div className="attempt-bars">{Array.from({ length: Math.max(3, task.attempts) }, (_, i) => <div key={i} className="attempt-bar"><span>{i + 1}</span><i className={i < task.successfulAttempts ? 'passed' : i < task.failedAttempts + task.successfulAttempts ? 'failed' : ''} /></div>)}</div></Surface></aside></div>{checkpointOpen && <CheckpointDialog taskId={id} onClose={() => setCheckpointOpen(false)} onSuccess={() => { setCheckpointOpen(false); qc.invalidateQueries({ queryKey: getGetTaskCheckpointsQueryKey(id) }); }} />}
  </div>;
}

function Timeline({ events }: { events: TaskEvent[] }) { if (!events.length) return <Empty label="The execution timeline will populate when the task starts." />; return <div className="timeline">{events.map((event, i) => <div className="timeline-item" key={event.id} data-testid={`timeline-event-${event.id}`}><div className={cn('timeline-marker', i === 0 && 'current')}><span /></div><div className="timeline-content"><div className="timeline-title"><b>{event.action}</b><Status value={event.status} /><small>{dateTime(event.timestamp)}</small></div><p>{event.message}</p><div className="timeline-meta"><span>{event.worker ?? 'system'}</span><span>{event.model ?? '—'}</span><span className="mono">{number(event.tokens)} tokens · {money(event.cost)}</span></div></div></div>)}</div>; }
function CheckpointCard({ checkpoint, task }: { checkpoint?: Checkpoint; task: Task }) { if (!checkpoint) return <Empty label="No checkpoint has been recorded yet." />; return <div className="checkpoint-card"><div className="checkpoint-top"><div className="checkpoint-state"><ShieldCheck size={18} /><div><b>{label(checkpoint.state)}</b><span>{dateTime(checkpoint.timestamp)} · {checkpoint.worker ?? task.currentWorker ?? 'system'}</span></div></div><Status value={checkpoint.testsFailed ? 'failed' : 'passed'} /></div><div className="check-grid"><div><span className="eyebrow">COMPLETED WORK</span>{checkpoint.completedWork.map((work) => <p key={work}><Check size={13} />{work}</p>)}</div><div><span className="eyebrow">REMAINING WORK</span>{checkpoint.remainingWork.map((work) => <p key={work}><ArrowUpRight size={13} />{work}</p>)}</div></div><div className="next-action"><span>Next action</span><b>{checkpoint.nextAction}</b></div></div>; }
function CheckpointDialog({ taskId, onClose, onSuccess }: { taskId: string; onClose: () => void; onSuccess: () => void }) { const create = useCreateCheckpoint(); const [nextAction, setNextAction] = useState(''); const [blocker, setBlocker] = useState(''); const submit = () => create.mutate({ taskId, data: { nextAction, blocker: blocker || undefined } }, { onSuccess }); return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><div><div className="eyebrow">EXECUTION TRACE</div><h2>Record checkpoint</h2></div><button data-testid="button-close-checkpoint" className="icon-button" onClick={onClose}><X size={18} /></button></div><label>Next action<textarea data-testid="input-checkpoint-next-action" value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="What should the next worker do?" /></label><label>Blocker <span className="muted">(optional)</span><textarea data-testid="input-checkpoint-blocker" value={blocker} onChange={(e) => setBlocker(e.target.value)} placeholder="Describe anything holding execution..." /></label><div className="modal-actions"><button data-testid="button-cancel-checkpoint" className="button button-secondary" onClick={onClose}>Cancel</button><button data-testid="button-submit-checkpoint" className="button button-primary" onClick={submit} disabled={!nextAction || create.isPending}>{create.isPending && <Loader2 className="spin" size={15} />} Save checkpoint</button></div></div></div>; }

function WorkersPage() {
  const { data: workers } = useListWorkers(); const { data: models } = useListModels(); const { data: providers } = useListProviders(); const qc = useQueryClient(); const workerRows = (workers as Worker[] | undefined) ?? []; const modelRows = (models as Model[] | undefined) ?? []; const providerRows = (providers as Provider[] | undefined) ?? [];
  return <div className="animate-appear"><div className="page-intro"><div><p className="lede">A clear view of every execution surface available to the orchestrator.</p><p className="muted">{workerRows.length} workers · {modelRows.length} models · {providerRows.length} providers</p></div><button data-testid="button-refresh-catalog" className="button button-secondary" onClick={() => { qc.invalidateQueries({ queryKey: getListWorkersQueryKey() }); qc.invalidateQueries({ queryKey: getListModelsQueryKey() }); qc.invalidateQueries({ queryKey: getListProvidersQueryKey() }); }}><RotateCcw size={15} /> Refresh catalog</button></div><div className="catalog-grid"><Surface title="Workers" className="catalog-panel">{workerRows.length ? workerRows.map((worker) => <div className="catalog-row" key={worker.id} data-testid={`row-worker-${worker.id}`}><div className="catalog-icon worker"><Bot size={17} /></div><div className="catalog-copy"><b>{worker.name}</b><span>{worker.type} · {worker.model}</span><div className="capabilities">{worker.capabilities.slice(0, 3).map((cap) => <small key={cap}>{cap}</small>)}</div></div><div className="catalog-status"><Status value={worker.status} /><small>{worker.isLocal ? 'local' : worker.provider}</small></div></div>) : <Empty label="No workers configured." />}</Surface><Surface title="Models" className="catalog-panel">{modelRows.length ? modelRows.map((model) => <div className="catalog-row" key={model.id} data-testid={`row-model-${model.id}`}><div className="catalog-icon model"><BrainCircuit size={17} /></div><div className="catalog-copy"><b>{model.name}</b><span>{model.provider} · {number(model.contextSize)} context</span><div className="capabilities">{model.capabilities.slice(0, 2).map((cap) => <small key={cap}>{cap}</small>)}</div></div><div className="catalog-status"><b>{money(model.costPer1k)}<small> / 1k</small></b><small>{number(model.maxOutput)} max output</small></div></div>) : <Empty label="No models configured." />}</Surface><Surface title="Providers" className="catalog-panel providers-panel">{providerRows.length ? providerRows.map((provider) => <div className="catalog-row" key={provider.id} data-testid={`row-provider-${provider.id}`}><div className="catalog-icon provider"><Cloud size={17} /></div><div className="catalog-copy"><b>{provider.name}</b><span>{provider.kind} · {provider.endpoint}</span></div><div className="catalog-status"><Status value={provider.status} /><small>{provider.models} models</small></div></div>) : <Empty label="No providers configured." />}</Surface></div></div>;
}

function UsagePage() { const { data: usageData } = useGetUsage(); const { data: budgetsData } = useGetBudgets(); const usage = usageData as Usage | undefined; const budget = budgetsData as Budget | undefined; const monthlyPercent = budget ? Math.round((budget.monthlyUsed / Math.max(budget.monthlyLimit, 1)) * 100) : 0; return <div className="animate-appear"><div className="page-intro"><div><p className="lede">Spend with enough context to make the next routing decision.</p><p className="muted">Usage is aggregated across local and cloud execution.</p></div><div className="signal"><span className="signal-pulse" /> billing sync healthy</div></div><div className="usage-top"><Metric label="Tokens used" value={number(usage?.tokensUsed)} note="current cycle" icon={Zap} /><Metric label="Estimated cost" value={money(usage?.estimatedCost)} note="all providers" icon={Coins} tone="gold" /><Metric label="Completed tasks" value={usage?.completedTasks ?? '—'} note={`avg ${usage?.averageDuration ?? '—'}`} icon={Check} tone="green" /><Metric label="Local / cloud runs" value={`${usage?.localRuns ?? '—'} / ${usage?.cloudRuns ?? '—'}`} note="execution split" icon={Layers3} tone="slate" /></div><div className="usage-grid"><Surface title="Monthly cloud budget"><div className="budget-hero"><div><span className="eyebrow">CONSUMED THIS CYCLE</span><strong>{money(budget?.monthlyUsed)}</strong><span> of {money(budget?.monthlyLimit)} limit</span></div><div className="big-percent">{monthlyPercent}%</div></div><div className="progress-track tall gold-track"><span style={{ width: `${monthlyPercent}%` }} /></div><div className="budget-foot"><span>Credits remaining <b>{money(budget?.creditsRemaining)}</b></span><span>Resets in 12 days</span></div></Surface><Surface title="Task allocation"><div className="budget-hero"><div><span className="eyebrow">TASKS STARTED</span><strong>{number(budget?.taskUsed)}</strong><span> of {number(budget?.taskLimit)} limit</span></div><div className="big-percent teal-percent">{budget ? Math.round((budget.taskUsed / Math.max(budget.taskLimit, 1)) * 100) : 0}%</div></div><div className="progress-track tall"><span style={{ width: `${budget ? (budget.taskUsed / Math.max(budget.taskLimit, 1)) * 100 : 0}%` }} /></div><div className="budget-foot"><span>Queue remains healthy</span><span>Monthly policy</span></div></Surface></div><Surface title="Cost posture"><div className="cost-bars">{[['Local execution', 22, money(0)], ['Cloud inference', 68, money(usage?.estimatedCost)], ['Validation & retries', 34, money((usage?.estimatedCost ?? 0) * .34)]].map(([name, pct, cost]) => <div className="cost-bar" key={String(name)}><div><span>{name}</span><b>{cost}</b></div><div className="bar-track"><i style={{ width: `${pct}%` }} /></div></div>)}</div></Surface></div>; }

function SettingsPage() { const [autoCheckpoint, setAutoCheckpoint] = useState(true); const [simulationMode, setSimulationMode] = useState(true); const [retry, setRetry] = useState(true); return <div className="animate-appear"><div className="page-intro"><div><p className="lede">Policy is visible here before it becomes behavior.</p><p className="muted">Changes apply to new tasks and simulation runs.</p></div><span className="saved-state"><Check size={14} /> all changes saved</span></div><div className="settings-grid"><Surface title="Simulation policy"><SettingRow icon={Sparkles} title="Simulation mode" description="Allow dry runs to exercise the complete orchestration path." checked={simulationMode} onChange={() => setSimulationMode(!simulationMode)} testId="switch-simulation-mode" /><SettingRow icon={FileClock} title="Automatic checkpoints" description="Record a checkpoint after each validation boundary." checked={autoCheckpoint} onChange={() => setAutoCheckpoint(!autoCheckpoint)} testId="switch-automatic-checkpoints" /></Surface><Surface title="Execution safeguards"><SettingRow icon={RotateCcw} title="Retry failed attempts" description="Let the supervisor route recoverable failures to a fresh worker." checked={retry} onChange={() => setRetry(!retry)} testId="switch-retry-failed-attempts" /><SettingRow icon={ShieldCheck} title="Require validation before completion" description="A task cannot complete until tests and policy checks pass." checked={true} disabled testId="switch-require-validation" /></Surface><Surface title="Runtime defaults"><div className="setting-select"><div><b>Default scenario</b><span>Applied when a task does not declare one.</span></div><select data-testid="select-default-scenario" defaultValue="feature"><option value="feature">Feature delivery</option><option value="bugfix">Bug fix</option><option value="refactor">Refactor</option></select></div><div className="setting-select"><div><b>Escalation threshold</b><span>Maximum attempts before human review.</span></div><select data-testid="select-escalation-threshold" defaultValue="3"><option value="2">2 attempts</option><option value="3">3 attempts</option><option value="5">5 attempts</option></select></div></Surface><Surface title="Control plane"><div className="control-plane"><div className="control-row"><span>Policy revision</span><b className="mono">policy-2024.11.7</b></div><div className="control-row"><span>Last changed</span><b>Today, 09:42</b></div><div className="control-row"><span>Audit retention</span><b>30 days</b></div></div></Surface></div></div>; }
function SettingRow({ icon: Icon, title, description, checked, onChange, disabled, testId }: { icon: typeof Sparkles; title: string; description: string; checked: boolean; onChange?: () => void; disabled?: boolean; testId: string }) { return <div className="setting-row"><div className="setting-icon"><Icon size={17} /></div><div className="setting-copy"><b>{title}</b><span>{description}</span></div><button data-testid={testId} aria-pressed={checked} disabled={disabled} onClick={onChange} className={cn('switch', checked && 'on')}><span /></button></div>; }

function Router() { return <ErrorBoundary resetKey={location.pathname}><Shell><Switch><Route path="/" component={DashboardPage} /><Route path="/tasks" component={TasksPage} /><Route path="/tasks/:id" component={TaskDetailPage} /><Route path="/workers" component={WorkersPage} /><Route path="/usage" component={UsagePage} /><Route path="/settings" component={SettingsPage} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;