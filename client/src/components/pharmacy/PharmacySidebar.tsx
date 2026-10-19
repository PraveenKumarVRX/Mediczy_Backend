import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  Pill,
  LayoutDashboard,
  Package,
  ShoppingCart,
  FileText,
  Users,
  TrendingUp,
  AlertTriangle,
  Settings,
  LogOut,
  ClipboardList,
  Boxes,
  Receipt,
  Calendar,
  BarChart3,
  Truck,
  LifeBuoy,
} from 'lucide-react';

const PharmacySidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('pharmacyToken');
    localStorage.removeItem('pharmacyData');
    navigate('/pharmacy/login');
  };

  const menuItems = [
    {
      title: 'Main Menu',
      items: [
        { name: 'Dashboard', href: '/pharmacy/dashboard', icon: LayoutDashboard },
        { name: 'Point of Sale', href: '/pharmacy/pos', icon: ShoppingCart },
        { name: 'Prescriptions', href: '/pharmacy/prescriptions', icon: FileText },
      ],
    },
    {
      title: 'Inventory',
      items: [
        { name: 'Medicine Stock', href: '/pharmacy/inventory', icon: Pill },
        { name: 'Stock Alerts', href: '/pharmacy/stock-alerts', icon: AlertTriangle },
        { name: 'Batch Management', href: '/pharmacy/batches', icon: Boxes },
        { name: 'Purchase Orders', href: '/pharmacy/purchase-orders', icon: Truck },
        { name: 'Suppliers', href: '/pharmacy/suppliers', icon: Truck },
        { name: 'Supplier Returns', href: '/pharmacy/supplier-returns', icon: Boxes },
      ],
    },
    {
      title: 'Management',
      items: [
        { name: 'Customers', href: '/pharmacy/customers', icon: Users },
        { name: 'Sales Reports', href: '/pharmacy/reports', icon: TrendingUp },
        { name: 'Bills & Invoices', href: '/pharmacy/invoices', icon: Receipt },
        { name: 'Expiry Tracking', href: '/pharmacy/expiry', icon: Calendar },
      ],
    },
    {
      title: 'System',
      items: [
        { name: 'Analytics', href: '/pharmacy/analytics', icon: BarChart3 },
        { name: 'Settings', href: '/pharmacy/settings', icon: Settings },
        { name: 'Support', href: '/pharmacy/support', icon: LifeBuoy },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-teal-900 to-teal-950 text-white w-64">
      {/* Logo */}
      <div className="p-6 border-b border-teal-800">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-teal-400 to-cyan-500 p-2 rounded-xl shadow-lg">
            <Pill className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-xl">Pharmacy</h1>
            <p className="text-teal-300 text-xs">Management Portal</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-6">
        {menuItems.map((section) => (
          <div key={section.title}>
            <h2 className="text-xs font-semibold text-teal-400 uppercase tracking-wider mb-3 px-3">
              {section.title}
            </h2>
            <ul className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      to={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                        isActive
                          ? 'bg-teal-600 text-white shadow-lg shadow-teal-600/30'
                          : 'text-teal-100 hover:bg-teal-800/50 hover:text-white'
                      )}
                    >
                      <Icon className={cn('h-5 w-5', isActive ? 'text-white' : 'text-teal-300')} />
                      <span className="font-medium">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-teal-800">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-teal-100 hover:bg-red-600/20 hover:text-red-300 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default PharmacySidebar;
