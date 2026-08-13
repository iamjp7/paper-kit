import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import Home from './pages/Home'
import EditPdf from './pages/EditPdf'
import CompressPdf from './pages/CompressPdf'
import MergePdf from './pages/MergePdf'
import DeletePages from './pages/DeletePages'

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<Home />} />
        <Route path="/edit" element={<EditPdf />} />
        <Route path="/compress" element={<CompressPdf />} />
        <Route path="/merge" element={<MergePdf />} />
        <Route path="/delete-pages" element={<DeletePages />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
