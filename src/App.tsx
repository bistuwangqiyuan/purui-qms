import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BatchList from './pages/BatchList';
import BatchNew from './pages/BatchNew';
import BatchDetail from './pages/BatchDetail';
import Standards from './pages/Standards';
import Users from './pages/Users';

export default function App() {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/batches" element={<BatchList />} />
        <Route path="/batches/new" element={<BatchNew />} />
        <Route path="/batches/:id" element={<BatchDetail />} />
        <Route path="/standards" element={<Standards />} />
        {user.role === 'admin' && <Route path="/users" element={<Users />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
