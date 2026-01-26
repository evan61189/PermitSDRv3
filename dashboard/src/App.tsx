import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Permits from './pages/Permits';
import PermitDetail from './pages/PermitDetail';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="permits" element={<Permits />} />
        <Route path="permits/:id" element={<PermitDetail />} />
      </Route>
    </Routes>
  );
}

export default App;
