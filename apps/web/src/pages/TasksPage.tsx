import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { EmptyState } from '../components/empty-state';
import { Icon } from '../components/icon';
import { STATUS_LABEL, TASKS } from '../fixtures/content';

export function TasksPage() {
  const { dismissed, dismissTask, confirm } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const needle = query.trim();
  const visible = useMemo(
    () =>
      TASKS.filter(
        (task) => (filter === 'all' || task.status === filter) && (!needle || `${task.title}${task.goal}`.includes(needle)),
      ),
    [filter, needle],
  );
  const counts = useMemo(
    () => ({
      all: TASKS.length,
      run: TASKS.filter((task) => task.status === 'run').length,
      wait: TASKS.filter((task) => task.status === 'wait').length,
      done: TASKS.filter((task) => task.status === 'done').length,
      fail: TASKS.filter((task) => task.status === 'fail').length,
    }),
    [],
  );
  useEffect(() => {
    if (!id || visible.some((task) => task.id === id)) return;
    const next = visible[0];
    navigate(next ? `/tasks/${next.id}` : '/tasks', { replace: true });
  }, [id, navigate, visible]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !needle || document.querySelector('.scrim.open')) return;
      setQuery('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [needle]);
  const current = visible.find((task) => task.id === (id ?? visible[0]?.id)) ?? visible[0];
  const empty = (
    <EmptyState icon={needle ? 'search-x' : 'list-checks'} title={needle ? '没有匹配的任务' : '这里还没有任务'}>
      {needle ? `没有标题或目标包含「${needle}」。` : '让 AURA 执行一件需要多步完成的事，记录会出现在这里。'}
    </EmptyState>
  );

  return (
    <main className="page taskpage">
      <aside className="rail" aria-label="任务列表" data-enter="" style={{ ['--enter' as string]: 0 }}>
        <div className="rail-head">
          <h1>任务</h1>
          <span className="n">
            {visible.length} / {TASKS.length}
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
        <div className="tlist scroll fade-edges">
          {visible.length === 0 ? empty : null}
          {visible.map((task) => (
            <Link key={task.id} className="trow" data-s={task.status} to={`/tasks/${task.id}`} aria-current={current?.id === task.id ? true : undefined}>
              <Icon name={task.icon} className="i ic" />
              <span className="t">{task.title}</span>
              <span className="m">{dismissed.includes(task.id) ? '演示已关闭' : STATUS_LABEL[task.status]}</span>
            </Link>
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
                  <span
                    className={`st st-${current.status === 'fail' ? 'err' : current.status === 'wait' ? 'warn' : current.status === 'done' ? 'ok' : 'run'}`}
                  >
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
                    <span>{dismissed.includes(current.id) ? '演示已关闭' : STATUS_LABEL[current.status]}</span>
                  </span>
                  <span>{current.when}</span>
                </p>
              </div>
            </header>
            <div className="dbody scroll fade-edges">
              <p className="goal">{current.goal}</p>
              <div className="flow">
                {current.steps.map((step) => (
                  <div key={step.name} className="step" data-s={step.s === 'active' ? 'run' : step.s}>
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
                      <div className="nm">{step.name}</div>
                      <div className="d">{step.d}</div>
                    </div>
                  </div>
                ))}
              </div>
              {current.status === 'wait' && !dismissed.includes(current.id) ? (
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
        ) : (
          empty
        )}
      </section>
    </main>
  );
}
