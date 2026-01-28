import { Link, Outlet, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Ship } from 'lucide-react';
import clsx from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Permits', href: '/permits', icon: FileText },
];

export default function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar - Clipper Construction Branded */}
      <aside className="fixed inset-y-0 left-0 w-64 bg-clipper-navy">
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center h-20 px-6 border-b border-clipper-navy-light">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-clipper-gold rounded-lg flex items-center justify-center">
                <Ship className="w-6 h-6 text-clipper-navy" />
              </div>
              <div>
                <span className="text-lg font-bold text-white">Clipper</span>
                <span className="block text-xs text-clipper-gold">Construction</span>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-clipper-gold text-clipper-navy'
                      : 'text-gray-300 hover:bg-clipper-navy-light hover:text-white'
                  )}
                >
                  <item.icon className="w-5 h-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-clipper-navy-light">
            <div className="text-xs text-gray-400">
              <span className="text-clipper-gold font-semibold">Permit SDR</span> v3.0
              <br />
              AI-Powered Opportunity Scoring
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="pl-64">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
