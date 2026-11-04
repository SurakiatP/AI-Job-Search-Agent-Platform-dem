import { Navigate, Outlet } from 'react-router';
import { useAccount } from '../../lib/api';

// Admin accounts only use /admin; everyone else is sent to the workspace. Both gates sit inside OwnerGate, so the account is loaded.
export function AdminGate() {
  return useAccount()?.is_admin === true ? <Outlet /> : <Navigate to="/app" replace />;
}

// The mirror gate for /app*: an admin account has no projects, so first-run and project URLs land on the console instead.
export function WorkspaceGate() {
  return useAccount()?.is_admin === true ? <Navigate to="/admin" replace /> : <Outlet />;
}
