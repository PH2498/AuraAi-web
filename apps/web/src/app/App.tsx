import { lazy, Suspense } from 'react';
import { RouterProvider, createBrowserRouter, Outlet } from 'react-router-dom';
import { AppShell } from '../components/app-shell/AppShell';
import { HomePage } from '../pages/HomePage';
import { Icon } from '../components/icon';
import { ErrorBoundary } from './error-boundary';
import { SessionProvider, useSession } from './session';

const ConversationsPage = lazy(() => import('../pages/ConversationsPage').then((mod) => ({ default: mod.ConversationsPage })));
const VisionPage = lazy(() => import('../pages/VisionPage').then((mod) => ({ default: mod.VisionPage })));
const TasksPage = lazy(() => import('../pages/TasksPage').then((mod) => ({ default: mod.TasksPage })));
const MemoryPage = lazy(() => import('../pages/MemoryPage').then((mod) => ({ default: mod.MemoryPage })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then((mod) => ({ default: mod.SettingsPage })));

function Frame() {
  const { toasts, dismissToast } = useSession();
  return (
    <>
      <AppShell>
        <Suspense fallback={<p className="route-wait">正在打开</p>}>
          <Outlet />
        </Suspense>
      </AppShell>
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className="toast">
            <Icon name={item.icon} />
            <span>{item.text}</span>
            {item.action ? (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={() => {
                  item.action?.run();
                  dismissToast(item.id);
                }}
              >
                {item.action.label}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

function Layout() {
  return (
    <SessionProvider>
      <Frame />
    </SessionProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/conversations', element: <ConversationsPage /> },
      { path: '/conversations/:id', element: <ConversationsPage /> },
      { path: '/vision', element: <VisionPage /> },
      { path: '/tasks', element: <TasksPage /> },
      { path: '/tasks/:id', element: <TasksPage /> },
      { path: '/memory', element: <MemoryPage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/settings/:section', element: <SettingsPage /> },
    ],
  },
]);

export function App() {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
}
