"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Hospital, Package, Stethoscope, BedDouble, LineChart, FileText, ChevronLeft, ChevronRight, Users, Building2, Sparkles, Activity, Globe2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ROUTE_PERMISSIONS } from '@/lib/permissions';

interface SidebarProps {
  isCollapsed?: boolean;
  setIsCollapsed?: (val: boolean) => void;
  isMobileOpen?: boolean;
  setIsMobileOpen?: (val: boolean) => void;
  sidebarWidth?: number;
  setIsResizing?: (val: boolean) => void;
  isResizing?: boolean;
}

export function Sidebar({ isCollapsed = false, setIsCollapsed, isMobileOpen = false, setIsMobileOpen, sidebarWidth = 256, setIsResizing, isResizing }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const { t } = useLanguage();
  const role = user?.role;

  // Nav item definitions — roles are derived from the centralized ROUTE_PERMISSIONS map
  const allNavItems = [
    { name: t('nav.dashboard'),      href: '/district-admin', icon: LayoutDashboard },
    { name: "Federation",             href: '/federation',     icon: Globe2 },
    { name: t('nav.healthCentres'),   href: '/health-centre',  icon: Hospital },
    { name: t('nav.inventory'),       href: '/inventory',      icon: Package },
    { name: "Forecasting",            href: '/forecasting',    icon: Activity },
    { name: "Redistribution",         href: '/redistribution', icon: ArrowRightLeft },
    { name: "Attendance",             href: '/attendance',     icon: role === 'DOCTOR' ? LayoutDashboard : Stethoscope },
    { name: t('nav.patients'),        href: '/patients',       icon: Users },
    { name: t('nav.beds'),            href: '/beds',           icon: BedDouble },
    { name: t('nav.analytics'),       href: '/analytics',      icon: LineChart },
    { name: t('nav.manageRoles'),     href: '/manage-roles',   icon: Building2 },
  ];

  // Filter nav items using the centralized permissions map — DEVELOPER sees everything
  const navItems = allNavItems.filter(item => {
    if (!role) return false;
    if (role === 'DEVELOPER') return true;
    const allowed = ROUTE_PERMISSIONS[item.href];
    return allowed ? allowed.includes(role) : false;
  });

  if (!user) {
    return (
      <nav 
        className={`bg-card/80 backdrop-blur-xl border-r border-border h-screen fixed left-0 top-0 overflow-y-auto flex flex-col py-6 gap-2 z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-0
          md:[width:var(--sidebar-width)] w-64 ${isCollapsed ? 'md:!w-20' : ''} 
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`
        }
        style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
      >
        <div className={`px-4 mb-6 mt-2 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Aarogya Logo" className="w-8 h-8 object-contain shrink-0 opacity-50" />
            {!isCollapsed && <h1 className="text-2xl font-bold text-foreground/50 tracking-tight">Aarogya</h1>}
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav 
      className={`bg-card/80 backdrop-blur-xl border-r border-border h-screen fixed left-0 top-0 overflow-y-auto flex flex-col py-6 gap-2 z-50 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-all duration-0
        md:[width:var(--sidebar-width)] w-64 ${isCollapsed ? 'md:!w-20' : ''} 
        ${isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`
      }
      style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}
    >
      {/* Resizer Handle */}
      {!isCollapsed && setIsResizing && (
        <div 
          className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-50 transition-colors ${isResizing ? 'bg-primary' : 'hover:bg-primary/50'}`}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        />
      )}
      <div className={`px-4 mb-6 mt-2 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        <div className="flex items-center gap-2.5">
          <img src="/logo.png" alt="Aarogya Logo" className="w-8 h-8 object-contain shrink-0" />
          {!isCollapsed && <h1 className="text-2xl font-bold text-foreground tracking-tight">Aarogya</h1>}
        </div>
        
        {setIsCollapsed && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="hidden md:flex cursor-pointer text-muted-foreground hover:text-foreground hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            {isCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </Button>
        )}
      </div>

      <div className="flex-1 flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (pathname !== '/' && item.href !== '/' && pathname.startsWith(item.href));
          const Icon = item.icon;
          
          return (
            <Link 
              key={item.href}
              href={item.href} 
              onClick={() => { if (setIsMobileOpen) setIsMobileOpen(false); }}
              className={`flex items-center gap-3 py-3 rounded-xl transition-all duration-200 font-medium text-sm group relative overflow-hidden cursor-pointer ${isCollapsed ? 'justify-center px-0' : 'px-4'} ${
                isActive 
                  ? 'text-primary-foreground font-bold shadow-[0_4px_12px_rgba(37,52,63,0.15)]' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-slate-200/90 dark:hover:bg-slate-800/90 hover:font-semibold'
              }`}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-primary to-primary/80 opacity-100 transition-opacity" />
              )}
              <Icon className={`w-5 h-5 relative z-10 transition-transform duration-300 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
              {!isCollapsed && <span className="relative z-10">{item.name}</span>}
            </Link>
          );
        })}
      </div>
      
      <div className="mt-auto px-2 pb-6">
      </div>
    </nav>
  );
}
