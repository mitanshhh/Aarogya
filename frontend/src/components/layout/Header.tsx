"use client";

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Search, User, Menu, ChevronDown, Check, Globe, Loader2 } from 'lucide-react';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LOCALE_LABELS, Locale } from '@/lib/translations';
import { apiFetch, API_BASE_URL } from '@/lib/api';

interface HeaderProps {
  setIsMobileOpen?: (val: boolean) => void;
}

export function Header({ setIsMobileOpen }: HeaderProps) {
  const { user, logout, token, selectedHospitalId, setSelectedHospitalId } = useAuth();
  const { locale, setLocale, t, isTranslating } = useLanguage();
  const pathname = usePathname();
  const [hospitals, setHospitals] = useState<Record<string, unknown>[]>([]);
  const [hospitalSearch, setHospitalSearch] = useState('');
  const [backendDown, setBackendDown] = useState(false);

  const filteredHospitals = hospitals.filter(h => 
    String(h.name).toLowerCase().includes(hospitalSearch.toLowerCase())
  );


  const fetchHospitals = async () => {
    if (!token || (user?.role !== 'DISTRICT_ADMIN' && user?.role !== 'DEVELOPER' && user?.role !== 'NATION_ADMIN')) return;
    try {
      const res = await apiFetch(`${API_BASE_URL}/api/v1/phc`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setHospitals(data);
        if (!selectedHospitalId && data.length > 0) {
          setSelectedHospitalId(data[0].id as number);
        }
        setBackendDown(false);
      }
    } catch(e) {
      // Silently handle backend connection failures
      setBackendDown(true);
    }
  };

  useEffect(() => {
    fetchHospitals();
  }, [token, user]);


  const selectedHospitalName = (hospitals.find(h => h.id === selectedHospitalId)?.name as string) || 'Select Hospital';

  return (
    <header className="bg-card/70 backdrop-blur-md border-b border-border h-16 px-4 md:px-6 flex justify-between items-center w-full sticky top-0 z-40 shadow-[0_1px_8px_rgba(0,0,0,0.02)]">
      <div className="flex items-center gap-2 md:gap-4">
        {setIsMobileOpen && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden text-muted-foreground hover:text-foreground"
            onClick={() => setIsMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </Button>
        )}
        
        {(user?.role === 'DISTRICT_ADMIN' || user?.role === 'DEVELOPER' || user?.role === 'NATION_ADMIN') && !pathname.startsWith('/district-admin') && !pathname.startsWith('/health-centre') && !pathname.startsWith('/federation') && !pathname.startsWith('/redistribution') ? (
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-0.5 px-1 hidden md:block">
              {t('header.viewingDataFor')}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" className="hidden md:flex items-center justify-between w-64 gap-2 border-border bg-background/50 text-foreground font-medium rounded-xl shadow-sm hover:bg-accent/50 transition-colors" />}>
                <span className="truncate flex-1 text-left">{selectedHospitalName}</span>
                <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64 p-2 rounded-xl shadow-lg border-border">
                <div className="flex items-center px-2 pb-2 mb-2 border-b border-border/50 sticky top-0 bg-popover z-10">
                  <Search className="w-4 h-4 text-muted-foreground mr-2 shrink-0" />
                  <input
                    type="text"
                    placeholder={t('header.searchHospitals')}
                    value={hospitalSearch}
                    onChange={(e) => setHospitalSearch(e.target.value)}
                    className="bg-transparent border-none focus:outline-none text-sm w-full"
                    autoFocus
                  />
                </div>
                <div className="max-h-[250px] overflow-y-auto">
                  {filteredHospitals.length === 0 ? (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                      {t('header.noHospitalsFound')}
                    </div>
                  ) : (
                    filteredHospitals.map((h) => (
                      <DropdownMenuItem 
                        key={h.id as number} 
                        onClick={() => {
                          setSelectedHospitalId(h.id as number);
                          setHospitalSearch('');
                        }}
                        className={`flex items-center justify-between cursor-pointer rounded-lg px-3 py-2 mb-1 ${selectedHospitalId === h.id ? 'bg-primary/10 text-primary font-medium' : ''}`}
                      >
                        <span className="truncate">{String(h.name)}</span>
                        {selectedHospitalId === h.id && <Check className="w-4 h-4 shrink-0" />}
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : !pathname.startsWith('/district-admin') && !pathname.startsWith('/health-centre') && !pathname.startsWith('/forecasting') && !pathname.startsWith('/federation') && !pathname.startsWith('/redistribution') ? (
          <div className="hidden md:flex items-center bg-background/80 shadow-inner rounded-full px-4 py-2 border border-border focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/20 w-96 transition-all duration-300">
            <Search className="w-4 h-4 text-primary mr-2" />
            <input 
              className="bg-transparent border-none focus:outline-none w-full text-sm text-foreground placeholder:text-muted-foreground font-medium" 
              placeholder={t('header.searchFacilities')}
              type="text" 
            />
          </div>
        ) : null}
      </div>
      
      <div className="flex items-center gap-2 md:gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full focus:outline-none">
            <Avatar className="w-9 h-9 cursor-pointer border-2 border-primary/20 hover:border-primary shadow-sm transition-all duration-300 bg-muted flex items-center justify-center">
              <AvatarFallback className="bg-transparent">
                <User className="w-5 h-5 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 rounded-2xl p-3 shadow-2xl border-border/50 bg-card/95 backdrop-blur-xl">
            <div className="flex flex-col space-y-2 p-4 bg-gradient-to-br from-primary/10 via-background to-background rounded-xl border border-primary/10 shadow-inner mb-2">
              <p className="text-xl font-bold leading-none text-foreground tracking-tight">{user?.username || "Guest"}</p>
              <p className="text-sm leading-none text-muted-foreground font-medium">{user?.email}</p>
            </div>
            
            <div className="p-3 space-y-4">
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-medium">Role:</span>
                <span className="font-semibold text-foreground bg-primary/10 text-primary px-2.5 py-1 rounded-md text-xs uppercase tracking-wider">
                  {user?.role?.replace("_", " ") || "N/A"}
                </span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-muted-foreground font-medium">PHC Name:</span>
                <span className="font-semibold text-foreground truncate max-w-[200px]" title={user?.hospital_name || (user?.hospital_id ? `PHC ${user.hospital_id}` : 'System Wide')}>
                  {user?.hospital_name ? user.hospital_name : (user?.hospital_id ? `PHC ${user.hospital_id}` : 'System Wide')}
                </span>
              </div>
            </div>
            
            <DropdownMenuSeparator className="bg-border/60 my-2" />
            
            <DropdownMenuItem onClick={logout} className="text-destructive font-semibold justify-center py-3 cursor-pointer rounded-xl hover:bg-destructive hover:text-white focus:bg-destructive focus:text-white transition-all duration-200 mt-1">
              {t('header.logout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
