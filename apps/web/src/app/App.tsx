import { RouterProvider, createBrowserRouter, Outlet } from 'react-router-dom';
import { AppShell } from '../components/app-shell/AppShell';
import { ConversationsPage } from '../pages/ConversationsPage';
import { HomePage } from '../pages/HomePage';
import { MemoryPage } from '../pages/MemoryPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TasksPage } from '../pages/TasksPage';
import { VisionPage } from '../pages/VisionPage';
import { SessionProvider, useSession } from './session';

function Frame() {
  const { toasts } = useSession();
  return (
    <>
      <AppShell>
        <Outlet />
      </AppShell>
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((item) => (
          <div key={item.id} className="toast">
            {item.text}
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
  return <RouterProvider router={router} />;
}
