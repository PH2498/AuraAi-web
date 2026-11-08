import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/aura.css';
import './styles/pages/home.css';
import './styles/pages/conversations.css';
import './styles/pages/vision.css';
import './styles/pages/tasks.css';
import './styles/pages/memory.css';
import './styles/pages/settings.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('找不到根节点');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
