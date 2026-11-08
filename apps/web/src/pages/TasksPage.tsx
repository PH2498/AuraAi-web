import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AgentStepDto, AgentTaskDto } from '@aura/shared-types';
import { useSession } from '../app/session';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { EmptyState } from '../components/empty-state';
import { Icon } from '../components/icon';
import { STATUS_LABEL, TASKS } from '../fixtures/content';
import { cancelTask, createTask, decideTask, listAuditLogs, listTasks, type AuditRow } from '../tasks/api';

const LIVE_LABEL: Record<AgentTaskDto['status'], string> = {
  queued: '排队',
  planning: '规划中',
  running: '进行中',
  waiting_confirmation: '待确认',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  rejected: '已拒绝',
};

type ViewTask = {
  id: string;
  title: string;
  goal: string;
  status: 'wait' | 'run' | 'done' | 'fail';
  label: string;
  when: string;
  icon: string;
  live: boolean;
  summary: string | null;
  cancellable: boolean;
  steps: ViewStep[];
  confirmation: { id: string; title: string; detail: string; body: string | null; high: boolean } | null;
};

type ViewStep = {
  id: string;
  s: string;
  name: string;
  d: string;
  meta: string;
  note: { title: string; body: string } | null;
  hits: { id: string; title: string }[];
};

export function TasksPage() {
  const { dismissed, dismissTask, confirm, account, accountKnown, requireAccount, toast, setAura } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [goal, setGoal] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [remote, setRemote] = useState<AgentTaskDto[]>([]);
  const [ready, setReady] = useState(false);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const executing = remote.some((task) => task.status === 'queued' || task.status === 'planning' || task.status === 'running');
  useEffect(() => {
    if (!executing) return;
    setAura('executing');
    return () => setAura('idle');
  }, [executing, setAura]);
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const reload = useCallback(() => {
    if (!accountKnown) return;
    if (!account) {
      setRemote([]);
      setReady(true);
      return;
    }
    void listTasks()
      .then(setRemote)
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, [account, accountKnown]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const active = remote.some((task) => !['completed', 'failed', 'cancelled', 'rejected'].includes(task.status));
    if (!account || !active) return;
    const timer = window.setInterval(reload, 1000);
    return () => window.clearInterval(timer);
  }, [account, reload, remote]);

  useEffect(() => {
    if (!account) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let timer = 0;
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${protocol}://${window.location.host}/api/v1/agents/events`);
      socket.onmessage = () => reload();
      socket.onclose = () => {
        if (!closed) timer = window.setTimeout(connect, 1500);
      };
    };
    connect();
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      closed = true;
      window.clearTimeout(timer);
      socket?.close();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [account, reload]);

  const tasks = useMemo(() => {
    const live = remote.map(toView);
    const demos = TASKS.map((task) => ({
      id: task.id,
      title: task.title,
      goal: task.goal,
      status: task.status,
      label: dismissed.includes(task.id) ? '演示已关闭' : STATUS_LABEL[task.status],
      when: task.when,
      icon: task.icon,
      live: false,
      summary: null,
      cancellable: false,
      steps: task.steps.map((step) => ({ s: step.s, name: step.name, d: step.d, id: step.name + step.d, meta: '', note: null, hits: [] })),
      confirmation: null,
    }));
    return [...live, ...demos];
  }, [dismissed, remote]);
  const needle = query.trim();
  const visible = useMemo(
    () => tasks.filter((task) => (filter === 'all' || task.status === filter) && (!needle || `${task.title}${task.goal}`.includes(needle))),
    [filter, needle, tasks],
  );
  const counts = useMemo(
    () => ({
      all: tasks.length,
      run: tasks.filter((task) => task.status === 'run').length,
      wait: tasks.filter((task) => task.status === 'wait').length,
      done: tasks.filter((task) => task.status === 'done').length,
      fail: tasks.filter((task) => task.status === 'fail').length,
    }),
    [tasks],
  );
  useEffect(() => {
    if (!ready) return;
    if (!id || visible.some((task) => task.id === id)) return;
    const next = visible[0];
    navigate(next ? `/tasks/${next.id}` : '/tasks', { replace: true });
  }, [id, navigate, ready, visible]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !needle || document.querySelector('.scrim.open')) return;
      setQuery('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [needle]);
  const current = visible.find((task) => task.id === id) ?? (id && !ready ? undefined : visible[0]);
  useEffect(() => {
    if (!current?.live) {
      setAudit([]);
      return;
    }
    const task = remote.find((item) => item.id === current.id);
    const stepIds = new Set(task?.steps.map((step) => step.id) ?? []);
    let stop = false;
    void listAuditLogs()
      .then((rows) => {
        if (stop) return;
        setAudit(
          rows
            .filter((row) => row.resourceId === current.id || (row.resourceId != null && stepIds.has(row.resourceId)))
            .slice()
            .reverse(),
        );
      })
      .catch(() => {
        if (!stop) setAudit([]);
      });
    return () => {
      stop = true;
    };
  }, [current?.id, current?.live, remote]);
  const empty = (
    <EmptyState icon={needle ? 'search-x' : 'list-checks'} title={needle ? '没有匹配的任务' : '这里还没有任务'}>
      {needle ? `没有标题或目标包含「${needle}」。` : '让 AURA 执行一件需要多步完成的事，记录会出现在这里。'}
    </EmptyState>
  );
  const recorded = visible.filter((task) => task.live);
  const demos = visible.filter((task) => !task.live);

  const submit = () => {
    const text = goal.trim();
    if (!text) return;
    void (async () => {
      if (!(await requireAccount())) return;
      try {
        const task = await createTask(text);
        setGoal('');
        setRemote((items) => [task, ...items.filter((item) => item.id !== task.id)]);
        navigate(`/tasks/${task.id}`);
      } catch (error) {
        toast(error instanceof Error ? error.message : '任务没有创建', { icon: 'circle-alert' });
      }
    })();
  };

  return (
    <main className="page taskpage">
      <aside className="rail" aria-label="任务列表" data-enter="" style={{ ['--enter' as string]: 0 }}>
        <div className="rail-head">
          <h1>任务</h1>
          <span className="n">
            {visible.length} / {tasks.length}
          </span>
        </div>
        <div className="filters" role="toolbar" aria-label="筛选">
          {(['all', 'run', 'wait', 'done', 'fail'] as const).map((key) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key === 'all' ? '全部' : STATUS_LABEL[key]}
              <span className="c">{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="search">
          <Icon name="search" />
          <input className="input" value={query} placeholder="搜索任务" aria-label="搜索任务" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input className="input" value={goal} placeholder="交给 AURA 一件需要步骤的事" aria-label="新任务" onChange={(event) => setGoal(event.target.value)} />
          <button type="submit" className="btn btn-secondary" disabled={!goal.trim()}>
            创建
          </button>
        </form>
        <div className="tlist scroll fade-edges">
          {visible.length === 0 ? empty : null}
          {recorded.length > 0 ? <h3>记录</h3> : null}
          {recorded.map((task) => (
            <TaskLink key={task.id} task={task} current={current?.id === task.id} />
          ))}
          {demos.length > 0 ? <h3>演示</h3> : null}
          {demos.map((task) => (
            <TaskLink key={task.id} task={task} current={current?.id === task.id} />
          ))}
        </div>
      </aside>
      <section className="detail" aria-label="任务详情" data-enter="" style={{ ['--enter' as string]: 1 }}>
        {current ? (
          <>
            <header className="dhead">
              <button ref={slot} className="core-slot" type="button" aria-label="任务状态" />
              <div className="ttl">
                <h2>{current.title}</h2>
                <p className="sub">
                  <span className={`st st-${current.status === 'fail' ? 'err' : current.status === 'wait' ? 'warn' : current.status === 'done' ? 'ok' : 'run'}`}>
                    <Icon
                      name={
                        current.status === 'fail'
                          ? 'circle-alert'
                          : current.status === 'wait'
                            ? 'triangle-alert'
                            : current.status === 'done'
                              ? 'circle-check'
                              : 'loader-circle'
                      }
                      className="i i-14"
                    />
                    <span>{current.label}</span>
                  </span>
                  <span>{current.when}</span>
                </p>
              </div>
              {current.cancellable ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    void cancelTask(current.id)
                      .then((task) => {
                        setRemote((items) => items.map((item) => (item.id === task.id ? task : item)));
                        toast('已取消任务');
                      })
                      .catch((error: unknown) => toast(error instanceof Error ? error.message : '没有取消', { icon: 'circle-alert' }));
                  }}
                >
                  取消
                </button>
              ) : null}
            </header>
            <div className="dbody scroll fade-edges">
              <p className="goal">{current.goal}</p>
              {current.summary ? <p className="goal">{current.summary}</p> : null}
              <div className="flow">
                {current.steps.map((step) => (
                  <div key={step.id} className="step" data-s={step.s === 'active' ? 'run' : step.s}>
                    <span className="node">
                      <Icon
                        name={
                          step.s === 'fail'
                            ? 'circle-alert'
                            : step.s === 'done'
                              ? 'check'
                              : step.s === 'active'
                                ? 'loader-circle'
                                : step.s === 'wait'
                                  ? 'triangle-alert'
                                  : 'circle-dot'
                        }
                        className="i i-14"
                      />
                    </span>
                    <div>
                      <div className="nm">
                        {step.name}
                        {step.meta ? <span className="tool">{step.meta}</span> : null}
                      </div>
                      <div className="d">{step.d}</div>
                      {step.note ? (
                        <div className="note">
                          <b>{step.note.title}</b>
                          <p>{step.note.body}</p>
                        </div>
                      ) : null}
                      {step.hits.length > 0 ? (
                        <div className="hits">
                          {step.hits.map((hit) => (
                            <Link key={hit.id} to={`/conversations/${hit.id}`}>
                              {hit.title}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
              {current.live && current.confirmation ? (
                <div className={`confirm-band${current.confirmation.high ? ' high' : ''}`}>
                  <div className="k">需要你的确认 · {current.confirmation.title}</div>
                  <h3>{current.confirmation.detail}</h3>
                  {current.confirmation.body ? <p className="preview">{current.confirmation.body}</p> : null}
                  <p>允许后只会执行这一步里已经固定的参数。不会执行命令，也不会改动电脑上的文件。</p>
                  <div className="acts">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        const stepId = current.confirmation?.id;
                        if (!stepId) return;
                        void decideTask(current.id, stepId, 'reject')
                          .then((task) => setRemote((items) => items.map((item) => (item.id === task.id ? task : item))))
                          .catch((error: unknown) => toast(error instanceof Error ? error.message : '没有拒绝', { icon: 'circle-alert' }));
                      }}
                    >
                      不允许
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        const stepId = current.confirmation?.id;
                        if (!stepId) return;
                        void decideTask(current.id, stepId, 'approve')
                          .then((task) => setRemote((items) => items.map((item) => (item.id === task.id ? task : item))))
                          .catch((error: unknown) => toast(error instanceof Error ? error.message : '没有执行', { icon: 'circle-alert' }));
                      }}
                    >
                      允许并执行
                    </button>
                  </div>
                </div>
              ) : null}
              {current.live && audit.length > 0 ? (
                <section className="log" aria-label="执行记录">
                  <h3>执行记录</h3>
                  <ol>
                    {audit.map((row) => (
                      <li key={row.id}>
                        <span>{auditLabel(row)}</span>
                        <time>{new Date(row.createdAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
              {current.status === 'wait' && !current.live && !dismissed.includes(current.id) ? (
                <div className="confirm-band high">
                  <div className="k">演示确认 · 不会真的执行</div>
                  <h3>{current.title}</h3>
                  <p>允许或不允许都只关闭这条演示。不会发信，也不会改动文件。</p>
                  <div className="acts">
                    <button type="button" className="btn btn-secondary" onClick={() => dismissTask(current.id)}>
                      不允许
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        void confirm({
                          risk: '演示确认 · 不会发出',
                          level: 'high',
                          title: current.title,
                          desc: '关闭后只去掉待确认标记。不会发信，也不会改动文件。',
                          rows: [
                            ['mail', '不会发送', '没有邮件会离开这台浏览器'],
                            ['file', '不会读取', '相关文件没有被打开'],
                          ],
                          ack: '我知道这只是演示，不会真的发送',
                          deny: '取消',
                          allow: '关闭这条演示',
                        }).then((ok) => {
                          if (ok) dismissTask(current.id);
                        });
                      }}
                    >
                      知道了，这只是演示
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : ready ? (
          empty
        ) : null}
      </section>
    </main>
  );
}

function TaskLink({ task, current }: { task: ViewTask; current: boolean }) {
  return (
    <Link className="trow" data-s={task.status} to={`/tasks/${task.id}`} aria-current={current ? true : undefined}>
      <Icon name={task.icon} className="i ic" />
      <span className="t">{task.title}</span>
      <span className="m">{task.label}</span>
    </Link>
  );
}

function toView(task: AgentTaskDto): ViewTask {
  const waiting = task.steps.find((step) => step.confirmationStatus === 'pending');
  const status = bucket(task.status);
  return {
    id: task.id,
    title: task.goal.slice(0, 42),
    goal: task.goal,
    status,
    label: LIVE_LABEL[task.status],
    when: new Date(task.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    icon: iconFor(task.steps.find((step) => step.toolName)?.toolName ?? ''),
    live: true,
    summary: task.summary,
    cancellable: status === 'run' || status === 'wait',
    steps: task.steps.map((step) => ({
      id: step.id,
      s: stepView(step.status),
      name: step.title,
      d: stepDetail(step),
      meta: stepMeta(step),
      note: noteOf(step),
      hits: hitsOf(step),
    })),
    confirmation: waiting
      ? {
          id: waiting.id,
          title: waiting.title,
          detail: detailOf(waiting.toolName, waiting.input),
          body: typeof waiting.input?.body === 'string' ? waiting.input.body : null,
          high: waiting.riskLevel === 'high',
        }
      : null,
  };
}

function bucket(status: AgentTaskDto['status']): ViewTask['status'] {
  if (status === 'waiting_confirmation') return 'wait';
  if (status === 'completed') return 'done';
  if (status === 'failed' || status === 'cancelled' || status === 'rejected') return 'fail';
  return 'run';
}

function stepDetail(step: AgentStepDto): string {
  if (step.summary) return step.summary;
  if (step.confirmationStatus === 'pending') return '等待你确认后才会执行';
  if (step.confirmationStatus === 'rejected' || step.status === 'rejected') return '已拒绝，这一步没有执行';
  if (step.confirmationStatus === 'expired') return '确认已过期，这一步没有执行';
  if (step.status === 'cancelled') return '已取消，这一步没有执行';
  if (step.status === 'failed') return '这一步没有执行';
  return '等待执行';
}

function stepMeta(step: AgentStepDto): string {
  const risk = step.riskLevel === 'high' ? '高风险' : step.riskLevel === 'medium' ? '需确认' : step.riskLevel === 'low' ? '低风险' : '';
  const stamp = step.completedAt ?? step.startedAt;
  const when = stamp ? new Date(stamp).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
  const mark = step.completedAt ? '完成' : step.startedAt ? '开始' : '';
  return [risk, when && mark ? `${when} ${mark}` : ''].filter(Boolean).join(' · ');
}

function noteOf(step: AgentStepDto): { title: string; body: string } | null {
  if (step.toolName !== 'create_note') return null;
  const title = typeof step.input?.title === 'string' ? step.input.title : '';
  const body = typeof step.input?.body === 'string' ? step.input.body : '';
  if (!title && !body) return null;
  return { title, body };
}

function hitsOf(step: AgentStepDto): { id: string; title: string }[] {
  const items = step.result?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as { id?: unknown; title?: unknown };
    if (typeof row.id !== 'string' || typeof row.title !== 'string') return [];
    return [{ id: row.id, title: row.title }];
  });
}

function auditLabel(row: AuditRow): string {
  const tool = typeof row.metadata?.tool === 'string' ? row.metadata.tool : '';
  const toolName = tool ? toolTitle(tool) : '';
  if (row.action === 'agent.task.create') return '创建任务';
  if (row.action === 'agent.task.cancel') return '取消任务';
  if (row.action === 'agent.confirmation.approve') return toolName ? `允许${toolName}` : '允许执行';
  if (row.action === 'agent.confirmation.reject') return toolName ? `拒绝${toolName}` : '拒绝执行';
  if (row.action === 'agent.tool.execute') return toolName ? `执行了${toolName}` : '执行了工具';
  if (row.action === 'agent.task.complete') return '任务完成';
  if (row.action === 'agent.task.finish') return '任务结束';
  return row.action;
}

function toolTitle(name: string): string {
  if (name === 'get_current_time') return '读取当前时间';
  if (name === 'search_conversation') return '搜索会话';
  if (name === 'list_memories') return '读取记忆';
  if (name === 'create_note') return '创建笔记';
  return name;
}

function stepView(status: string): string {
  if (status === 'completed') return 'done';
  if (status === 'running') return 'active';
  if (status === 'waiting_confirmation') return 'wait';
  if (status === 'failed' || status === 'rejected' || status === 'cancelled') return 'fail';
  return 'pending';
}

function iconFor(tool: string): string {
  if (tool === 'get_current_time') return 'clock';
  if (tool === 'search_conversation') return 'search';
  if (tool === 'list_memories') return 'brain';
  if (tool === 'create_note') return 'file-text';
  return 'list-checks';
}

function detailOf(tool: string | null, input: Record<string, unknown> | null): string {
  if (tool === 'create_note') return `将在 AURA 里创建笔记「${String(input?.title ?? '')}」。`;
  if (tool === 'search_conversation') return `将搜索标题包含「${String(input?.query ?? '')}」的会话。`;
  return '将按已固定的参数执行这个白名单工具。';
}
