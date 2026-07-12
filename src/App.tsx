import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import BatchList from './pages/BatchList';
import BatchNew from './pages/BatchNew';
import BatchDetail from './pages/BatchDetail';
import Standards from './pages/Standards';
import StandardsMgmt from './pages/StandardsMgmt';
import BasicData from './pages/BasicData';
import PatrolPlans from './pages/PatrolPlans';
import Ncrs from './pages/Ncrs';
import NcrDetail from './pages/NcrDetail';
import { Complaints, ComplaintDetail } from './pages/Complaints';
import { Capas, CapaDetail } from './pages/Capas';
import Issues from './pages/Issues';
import { Audits, AuditDetail } from './pages/Audits';
import Tests from './pages/Tests';
import Gauges from './pages/Gauges';
import Costs from './pages/Costs';
import Tasks from './pages/Tasks';
import Messages from './pages/Messages';
import Trace from './pages/Trace';
import SpcReports from './pages/SpcReports';
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

  const userType = user.userType ?? 'internal';

  if (userType === 'supplier') {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/batches" replace />} />
          <Route path="/batches" element={<BatchList />} />
          <Route path="/batches/:id" element={<BatchDetail />} />
          <Route path="/ncrs" element={<Ncrs />} />
          <Route path="/ncrs/:id" element={<NcrDetail />} />
          <Route path="/capa" element={<Capas />} />
          <Route path="/capa/:id" element={<CapaDetail />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="*" element={<Navigate to="/batches" replace />} />
        </Route>
      </Routes>
    );
  }

  if (userType === 'customer') {
    return (
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/complaints" replace />} />
          <Route path="/complaints" element={<Complaints />} />
          <Route path="/complaints/:id" element={<ComplaintDetail />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="*" element={<Navigate to="/complaints" replace />} />
        </Route>
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/spc" element={<SpcReports />} />
        <Route path="/trace" element={<Trace />} />
        <Route path="/batches" element={<BatchList />} />
        <Route path="/batches/new" element={<BatchNew />} />
        <Route path="/batches/:id" element={<BatchDetail />} />
        <Route path="/patrol" element={<PatrolPlans />} />
        <Route path="/standards-mgmt" element={<StandardsMgmt />} />
        <Route path="/ncrs" element={<Ncrs />} />
        <Route path="/ncrs/:id" element={<NcrDetail />} />
        <Route path="/complaints" element={<Complaints />} />
        <Route path="/complaints/:id" element={<ComplaintDetail />} />
        <Route path="/capa" element={<Capas />} />
        <Route path="/capa/:id" element={<CapaDetail />} />
        <Route path="/issues" element={<Issues />} />
        <Route path="/audits" element={<Audits />} />
        <Route path="/audits/:id" element={<AuditDetail />} />
        <Route path="/tests" element={<Tests />} />
        <Route path="/gauges" element={<Gauges />} />
        <Route path="/costs" element={<Costs />} />
        <Route path="/tasks" element={<Tasks />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/basic-data" element={<BasicData />} />
        {user.role === 'admin' && <Route path="/users" element={<Users />} />}
        <Route path="/standards" element={<Standards />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
