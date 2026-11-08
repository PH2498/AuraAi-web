import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useSession } from '../app/session';
import { useCoreSlot } from '../components/aura-core/CoreProvider';
import { Icon } from '../components/icon';
import { STATUS_LABEL, TASKS } from '../fixtures/content';

export function TasksPage() {
  const { dismissed, dismissTask } = useSession();
  const { id } = useParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const slot = useCoreSlot<HTMLButtonElement>(true);
  const visible = useMemo(
    () =>
      TASKS.filter((task) => (filter === 'all' || task.status === filter) && (!query || task.title.includes(query))),
    [filter, query],
  );
  const current = TASKS.find((task) => task.id === (id ?? visible[0]?.id)) ?? visible[0];

  return (
    <main className="page taskpage">
      <aside className="rail" aria-label="任务列表">
        <div className="rail-head">
          <h1>任务</h1>
          <span className="n">{visible.length}</span>
        </div>
        <div className="filters" role="toolbar" aria-label="筛选">
          {(['all', 'wait', 'run', 'fail', 'done'] as const).map((key) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {key === 'all' ? '全部' : STATUS_LABEL[key]}
            </button>
          ))}
        </div>
        <div className="search">
          <Icon name="search" />
          <input className="input" value={query} placeholder="搜索任务" aria-label="搜索任务" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="tlist scroll fade-edges">
          {visible.map((task) => (
            <Link key={task.id} className="trow" data-s={task.status} to={`/tasks/${task.id}`} aria-current={current?.id === task.id ? true : undefined}>
              <Icon name={task.icon} className="i ic" />
              <span className="t">{task.title}</span>
              <span className="m">{dismissed.includes(task.id) ? '演示已关闭' : STATUS_LABEL[task.status]}</span>
            </Link>
          ))}
        </div>
      </aside>
      <section className="detail" aria-label="任务详情">
        {current ? (
          <>
            <header className="dhead">
              <button ref={slot} className="core-slot" type="button" aria-label="任务状态" />
              <div className="ttl">
                <h2>{current.title}</h2>
                <p className="sub">{current.when}</p>
              </div>
            </header>
            <div className="dbody scroll fade-edges">
              <p className="goal">{current.goal}</p>
              <div className="flow">
                {current.steps.map((step) => (
                  <div key={step.name} className="step" data-s={step.s === 'active' ? 'run' : step.s}>
                    <span className="node">
                      <Icon name={step.s === 'fail' ? 'circle-x' : step.s === 'done' ? 'check' : 'circle-dot'} className="i i-14" />
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
                    <button type="button" className="btn btn-primary" onClick={() => dismissTask(current.id)}>
                      知道了，这只是演示
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <p className="empty-state">没有符合筛选的演示任务。</p>
        )}
      </section>
    </main>
  );
}
