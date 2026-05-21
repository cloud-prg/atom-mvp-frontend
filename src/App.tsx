import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { api } from './api/client';
import type { User } from './types/domain';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import AuthCallbackPage from './pages/AuthCallbackPage';

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    if (window.location.pathname === '/auth/callback') {
      return;
    }
    api.me().then(setUser).catch(() => setUser(null));
  }, []);

  return (
    <Router>
      {user === undefined ? (
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage onLogin={setUser} />} />
          <Route path="*" element={<div className="boot-screen">Atom Workbench</div>} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage onLogin={setUser} />} />
          <Route path="/login" element={<LoginPage onLogin={setUser} />} />
          <Route path="/chat" element={user ? <ChatPage user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} />
          <Route path="/chat/:conversationId" element={user ? <ChatPage user={user} onLogout={() => setUser(null)} /> : <Navigate to="/login" replace />} />
          <Route path="*" element={<Navigate to={user ? '/chat' : '/login'} replace />} />
        </Routes>
      )}
    </Router>
  );
}
