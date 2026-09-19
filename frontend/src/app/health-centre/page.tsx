"use client";
import { apiFetch } from '@/lib/api';

import { useState, useEffect, useCallback, memo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Plus, MoreVertical, Loader2, ChevronLeft, ChevronRight, Search,
  MapPin, User, Building2, Circle, ShieldCheck, Users, Stethoscope, Package, BedDouble, Eye, Edit, UserPlus, Power, AlertCircle, Activity
} from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import Link from 'next/link';

// Types
interface HealthCentre {
  id: number;
  name: string;
  type: string;
  health_score: number;
  location: string;
  medical_officer: string;
  status: string;
  total_beds?: number;
  available_beds?: number;
  total_staff?: number;
  latitude?: number;
  longitude?: number;
  contact_number?: string;
  email?: string | null;
  email_sent?: boolean;
  email_detail?: string | null;
}

const getStatusBadge = (status: string) => {
  switch (status.toLowerCase()) {
    case 'active':
    case 'optimal':
      return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Active</Badge>;
    case 'critical':
      return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Critical</Badge>;
    case 'maintenance':
    case 'review':
    case 'monitor':
      return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">{status}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getScoreVisual = (score: number) => {
  let color = 'bg-green-500';
  if (score < 40) color = 'bg-red-500';
  else if (score < 70) color = 'bg-orange-500';
  else if (score < 90) color = 'bg-yellow-500';

  return (
    <div className="flex items-center gap-3">
      <span className="font-semibold w-8">{score}</span>
      <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${score}%` }}></div>
      </div>
    </div>
  );
};

const HealthCentreRow = memo(({ centre, onSelect, onEdit, onDelete }: { centre: HealthCentre, onSelect: (c: HealthCentre) => void, onEdit: (c: HealthCentre) => void, onDelete: (c: HealthCentre) => void }) => {
  return (
    <TableRow 
      className="hover:bg-muted/40 transition-colors cursor-pointer group"
      onClick={() => onSelect(centre)}
    >
      <TableCell>
        <div className="font-medium text-foreground text-base group-hover:text-primary transition-colors">{centre.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{centre.type}</div>
      </TableCell>
      <TableCell>
        {getScoreVisual(centre.health_score)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">{centre.location}</TableCell>
      <TableCell className="text-sm">{centre.medical_officer}</TableCell>
      <TableCell>
        {getStatusBadge(centre.status)}
      </TableCell>
      <TableCell onClick={e => e.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted focus:outline-none transition-all">
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem 
              className="cursor-pointer"
              onClick={() => onSelect(centre)}
            >
              View Centre
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="cursor-pointer"
              onClick={() => onEdit(centre)}
            >
              Edit Centre
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={() => onDelete(centre)}
            >
              Deactivate Centre
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});

export default function HealthCentreManagement() {
  const [centres, setCentres] = useState<HealthCentre[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  
  // Modals state
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  
  // Selected centre for view/edit
  const [selectedCentre, setSelectedCentre] = useState<HealthCentre | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    type: 'PHC',
    health_score: 100, // default
    location: '',
    medical_officer: '',
    status: 'Active',
    phc_id: '',
    admin_email: '',
    admin_mobile: ''
  });

  const [editFormData, setEditFormData] = useState<Partial<HealthCentre>>({});

  // Filter & Pagination States
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>('All Types');
  const [filterDistrict, setFilterDistrict] = useState<string>('All Districts');
  const [filterStatus, setFilterStatus] = useState<string>('All Statuses');
  const [filterScore, setFilterScore] = useState<string>('All Scores');
  const [sortBy, setSortBy] = useState("id");
  const [sortDesc, setSortDesc] = useState(false);
  
  const { user, selectedHospitalId, setSelectedHospitalId } = useAuth();
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const [page, setPage] = useState(0);
  
  // Dynamic filter options from DB
  const [dbTypes, setDbTypes] = useState<string[]>(['PHC', 'CHC']);
  const [dbDistricts, setDbDistricts] = useState<string[]>(['North District', 'South District', 'East District', 'West District', 'Central']);
  const [dbStatuses, setDbStatuses] = useState<string[]>(['Active', 'Monitor', 'Review', 'Critical', 'Maintenance']);

  // Fetch centres with server-side pagination and filtering
  const fetchCentres = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (filterType !== 'All Types') params.append('type', filterType);
      if (filterDistrict !== 'All Districts') params.append('location', filterDistrict);
      if (filterStatus !== 'All Statuses') params.append('status', filterStatus);
      if (filterScore !== 'All Scores') {
         if (filterScore === 'Healthy') { params.append('min_score', '90'); params.append('max_score', '100'); }
         else if (filterScore === 'Monitor') { params.append('min_score', '70'); params.append('max_score', '89'); }
         else if (filterScore === 'Attention') { params.append('min_score', '40'); params.append('max_score', '69'); }
         else if (filterScore === 'Critical') { params.append('min_score', '0'); params.append('max_score', '39'); }
      }
      params.append('sort_by', sortBy);
      params.append('sort_desc', sortDesc.toString());
      params.append('skip', (page * rowsPerPage).toString());
      params.append('limit', rowsPerPage.toString());

      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/phc?${params.toString()}`, {
        headers: {
          'X-Role': 'DISTRICT_ADMIN'
        }
      });
      if (res.ok) {
        const total = res.headers.get('X-Total-Count');
        if (total) setTotalCount(parseInt(total, 10));

        const data = await res.json();
        const mappedData = data.map((c: any) => ({
          ...c,
          status: c.status || 'Active',
          health_score: c.health_score || 0,
          location: c.district || c.location || 'Unknown',
          medical_officer: c.medical_officer || 'Unassigned'
        }));
        setCentres(mappedData);
      } else {
        toast.error("Failed to fetch health centres");
      }
    } catch (error) {
      toast.error("Network error: Could not reach backend");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, filterType, filterDistrict, filterStatus, filterScore, sortBy, sortDesc, page, rowsPerPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCentres();
    }, 300); // debounce search
    return () => clearTimeout(timer);
  }, [fetchCentres]);

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/phc/filters`, {
          headers: { 'X-Role': 'DISTRICT_ADMIN' }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.types?.length) setDbTypes(data.types);
          if (data.districts?.length) setDbDistricts(data.districts);
          if (data.statuses?.length) setDbStatuses(data.statuses);
        }
      } catch (e) {
        console.error("Failed to load filter options", e);
      }
    };
    fetchFilterOptions();
  }, []);

  // Handle register
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/phc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Role': 'DISTRICT_ADMIN'
        },
        body: JSON.stringify({
          ...formData,
          district: formData.location || "North District",
          state: "Maharashtra"
        })
      });
      
      if (res.ok) {
        const created = await res.json();
        if (created.email_sent) {
          toast.success("Health Centre registered and onboarding email sent.");
        } else {
          toast.warning(created.email_detail || "Health Centre registered, but onboarding email was not sent.");
        }
        setIsRegisterOpen(false);
        setFormData({ name: '', type: 'PHC', health_score: 100, location: '', medical_officer: '', status: 'Active', phc_id: '', admin_email: '', admin_mobile: '' });
        fetchCentres();
      } else {
        const errorData = await res.json();
        let errorMsg = "Failed to register Health Centre";
        if (typeof errorData.detail === 'string') {
          errorMsg = errorData.detail;
        } else if (Array.isArray(errorData.detail)) {
          errorMsg = errorData.detail.map((e: any) => `${e.loc?.join('.')} ${e.msg}`).join(', ');
        }
        toast.error(errorMsg);
      }
    } catch (error) {
      toast.error("Network error");
    }
  };

  // Handle edit
  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCentre) return;
    
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/phc/${selectedCentre.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Role': 'DISTRICT_ADMIN'
        },
        body: JSON.stringify({
          name: editFormData.name,
          type: editFormData.type,
          total_beds: editFormData.total_beds,
          available_beds: editFormData.available_beds,
          total_staff: editFormData.total_staff,
          latitude: editFormData.latitude,
          longitude: editFormData.longitude,
          contact_number: editFormData.contact_number,
          email: editFormData.email || null,
          medical_officer: editFormData.medical_officer,
          location: editFormData.location,
          status: editFormData.status,
          district: editFormData.location || "North District",
          state: "Maharashtra"
        })
      });
      
      if (res.ok) {
        toast.success("Health Centre updated successfully!");
        setIsEditOpen(false);
        fetchCentres();
      } else {
        toast.error("Failed to update Health Centre");
      }
    } catch (error) {
      toast.error("Network error");
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!selectedCentre) return;
    
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/phc/${selectedCentre.id}`, {
        method: 'DELETE',
        headers: {
          'X-Role': 'DISTRICT_ADMIN'
        }
      });
      
      if (res.ok) {
        toast.success("Health Centre deleted successfully!");
        setIsDeleteOpen(false);
        fetchCentres();
      } else {
        toast.error("Failed to delete Health Centre");
      }
    } catch (error) {
      toast.error("Network error");
    }
  };


  const totalPages = Math.ceil(totalCount / rowsPerPage);

  return (
    <div className="flex flex-col gap-6">
      {/* Header Section */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Health Centres</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage Primary and Community Health Centres</p>
        </div>
        
        {/* Register Dialog */}
        <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
          <DialogTrigger render={
            <Button className="flex items-center gap-2 shadow-sm cursor-pointer">
              <Plus className="w-4 h-4" />
              Register New PHC
            </Button>
          } />
          <DialogContent className="sm:max-w-[425px] rounded-xl border-border bg-card/95 backdrop-blur-md shadow-2xl">
            <DialogHeader>
              <DialogTitle>Register New Health Centre</DialogTitle>
              <DialogDescription>
                Enter the details of the new Primary or Community Health Centre. Click save when you're done.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleRegister}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="name" className="text-right text-sm font-medium">Name</label>
                  <Input 
                    id="name" 
                    placeholder="e.g. City Central Clinic" 
                    className="col-span-3 bg-background"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right text-sm font-medium">Type</label>
                  <div className="col-span-3">
                    <Select value={formData.type} onValueChange={(val) => setFormData({...formData, type: val || ''})}>
                      <SelectTrigger className="w-full bg-background text-foreground hover:border-primary/50">
                        <SelectValue placeholder="Select Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PHC" className="cursor-pointer text-foreground">PHC (Primary Health Centre)</SelectItem>
                        <SelectItem value="CHC" className="cursor-pointer text-foreground">CHC (Community Health Centre)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="district" className="text-right text-sm font-medium">District</label>
                  <Input 
                    id="district" 
                    placeholder="e.g. North District" 
                    className="col-span-3 bg-background"
                    value={formData.location}
                    onChange={e => setFormData({...formData, location: e.target.value})}
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="officer" className="text-right text-sm font-medium">Officer</label>
                  <Input 
                    id="officer" 
                    placeholder="Medical Officer Name" 
                    className="col-span-3 bg-background"
                    value={formData.medical_officer}
                    onChange={e => setFormData({...formData, medical_officer: e.target.value})}
                    required
                  />
                </div>

                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="phc_id" className="text-right text-sm font-medium">PHC ID</label>
                  <Input 
                    id="phc_id" 
                    placeholder="e.g. CITY_01" 
                    className="col-span-3 bg-background"
                    value={formData.phc_id}
                    onChange={e => setFormData({...formData, phc_id: e.target.value})}
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="admin_email" className="text-right text-sm font-medium">Admin Email</label>
                  <Input 
                    id="admin_email" 
                    type="email"
                    className="col-span-3 bg-background"
                    value={formData.admin_email}
                    onChange={e => setFormData({...formData, admin_email: e.target.value})}
                    required
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label htmlFor="admin_mobile" className="text-right text-sm font-medium">Mobile</label>
                  <Input 
                    id="admin_mobile" 
                    className="col-span-3 bg-background"
                    value={formData.admin_mobile}
                    onChange={e => setFormData({...formData, admin_mobile: e.target.value})}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit">Save Centre</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-4">
        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search centre, district or medical officer..." 
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
            className="pl-9 h-10 bg-card border-border shadow-sm"
          />
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <Select value={filterType} onValueChange={v => { setFilterType(v || "All Types"); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-9 bg-card text-xs font-medium">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Types">Type</SelectItem>
                {dbTypes.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterDistrict} onValueChange={v => { setFilterDistrict(v || "All Districts"); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-9 bg-card text-xs font-medium">
                <SelectValue placeholder="District" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Districts">District</SelectItem>
                {dbDistricts.map(d => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={v => { setFilterStatus(v || "All Statuses"); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-9 bg-card text-xs font-medium">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Statuses">Status</SelectItem>
                {dbStatuses.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterScore} onValueChange={v => { setFilterScore(v || "All Scores"); setPage(0); }}>
              <SelectTrigger className="w-[140px] h-9 bg-card text-xs font-medium">
                <SelectValue placeholder="Health Score" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All Scores">Health Score</SelectItem>
                <SelectItem value="Healthy">Healthy (90-100)</SelectItem>
                <SelectItem value="Monitor">Monitor (70-89)</SelectItem>
                <SelectItem value="Attention">Attention (40-69)</SelectItem>
                <SelectItem value="Critical">Critical (0-39)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {totalCount} Health Centres
            </span>
            <Select value={`${sortBy}-${sortDesc}`} onValueChange={v => { 
                const [by, desc] = (v || "id-false").split('-');
                setSortBy(by);
                setSortDesc(desc === 'true');
                setPage(0);
            }}>
              <SelectTrigger className="w-[150px] h-9 bg-card text-xs font-medium border-slate-200">
                <SelectValue>
                   {sortBy === 'id' ? 'Default (ID)' : 
                    sortBy === 'name' ? (sortDesc ? 'Name (Z-A)' : 'Name (A-Z)') : 
                    sortBy === 'health_score' ? (sortDesc ? 'Score (High-Low)' : 'Score (Low-High)') : 'Sort by'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="id-false">Default (ID)</SelectItem>
                <SelectItem value="name-false">Name (A-Z)</SelectItem>
                <SelectItem value="name-true">Name (Z-A)</SelectItem>
                <SelectItem value="health_score-true">Score (High-Low)</SelectItem>
                <SelectItem value="health_score-false">Score (Low-High)</SelectItem>
              </SelectContent>
            </Select>

      </Card>

      {/* Data Table Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-semibold text-foreground whitespace-nowrap">Centre</TableHead>
                <TableHead className="font-semibold text-foreground whitespace-nowrap">Health Score</TableHead>
                <TableHead className="font-semibold text-foreground whitespace-nowrap">Location</TableHead>
                <TableHead className="font-semibold text-foreground whitespace-nowrap">Medical Officer</TableHead>
                <TableHead className="font-semibold text-foreground whitespace-nowrap">Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <div className="flex flex-col justify-center items-center gap-3 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" /> 
                      <span>Loading centres...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : centres.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="h-8 w-8 opacity-20 mb-2" />
                      <span className="font-medium">No health centres found</span>
                      <span className="text-sm">Try changing your search or filters.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                centres.map(centre => (
                  <HealthCentreRow 
                    key={centre.id} 
                    centre={centre}
                    onSelect={handleSelect}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination Footer */}
        {!loading && centres.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Rows per page:</span>
              <Select value={rowsPerPage.toString()} onValueChange={v => { setRowsPerPage(Number(v)); setPage(0); }}>
                <SelectTrigger className="h-8 w-[70px] bg-transparent border-0 shadow-none text-sm font-medium focus:ring-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                Showing {page * rowsPerPage + 1}–{Math.min((page + 1) * rowsPerPage, totalCount)} of {totalCount}
              </span>
              <div className="flex items-center gap-1">
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8" 
                  disabled={page === 0}
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => {
                    let pageNum = i;
                    if (totalPages > 5 && page > 2) {
                      pageNum = page - 2 + i;
                      if (pageNum >= totalPages) pageNum = totalPages - (5 - i);
                    }
                    if (pageNum >= totalPages) return null;
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={page === pageNum ? "default" : "ghost"}
                        size="icon"
                        className={`h-8 w-8 text-sm ${page === pageNum ? '' : 'text-muted-foreground'}`}
                        onClick={() => setPage(pageNum)}
                      >
                        {pageNum + 1}
                      </Button>
                    );
                  })}
                </div>
                <Button 
                  variant="outline" 
                  size="icon" 
                  className="h-8 w-8" 
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* View Details Sheet (Drawer) */}
      <Sheet open={isViewOpen} onOpenChange={setIsViewOpen}>
        <SheetContent className="w-full sm:max-w-[550px] overflow-y-auto border-l border-border bg-[#f0f8fa] p-6 shadow-2xl">
          <SheetHeader className="text-left mb-2">
            <div className="flex items-center gap-3">
              <SheetTitle className="text-2xl font-bold text-slate-900 tracking-tight">{selectedCentre?.name}</SheetTitle>
              {selectedCentre && getStatusBadge(selectedCentre.status)}
            </div>
            <SheetDescription className="text-sm font-medium text-slate-500">
              {selectedCentre?.type} &middot; {selectedCentre?.location}
            </SheetDescription>
          </SheetHeader>
          
          {selectedCentre && (
            <div className="space-y-4">
              {/* COMBINED HEALTH SCORE AND CENTRE INFO */}
              <div className="flex flex-col gap-5 bg-[#fafafa] p-5 rounded-2xl border border-slate-200/60 shadow-sm">
                {/* Health Score Section */}
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">
                    Health Score
                    <AlertCircle className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-baseline gap-1">
                      <span className={`text-4xl font-extrabold ${selectedCentre.health_score >= 90 ? 'text-green-600' : selectedCentre.health_score >= 70 ? 'text-yellow-600' : selectedCentre.health_score >= 40 ? 'text-orange-600' : 'text-red-600'}`}>
                        {selectedCentre.health_score}
                      </span>
                      <span className="text-sm font-semibold text-slate-400">/ 100</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className={`w-8 h-8 ${selectedCentre.health_score >= 90 ? 'text-green-600' : selectedCentre.health_score >= 70 ? 'text-yellow-600' : selectedCentre.health_score >= 40 ? 'text-orange-600' : 'text-red-600'}`} />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-slate-800">
                          {selectedCentre.health_score >= 90 ? 'Healthy' : selectedCentre.health_score >= 70 ? 'Monitor' : selectedCentre.health_score >= 40 ? 'Attention' : 'Critical'}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {selectedCentre.health_score >= 90 ? 'Excellent performance' : selectedCentre.health_score >= 70 ? 'Needs slight attention' : selectedCentre.health_score >= 40 ? 'Action required soon' : 'Immediate action needed'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-slate-200/50 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 ease-out ${selectedCentre.health_score >= 90 ? 'bg-green-600' : selectedCentre.health_score >= 70 ? 'bg-yellow-500' : selectedCentre.health_score >= 40 ? 'bg-orange-500' : 'bg-red-500'}`} style={{ width: `${selectedCentre.health_score}%` }}></div>
                  </div>
                </div>

                {/* Centre Information Section */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-100 bg-white shadow-sm">
                    <div className="p-1.5 bg-slate-50 rounded-md text-slate-500">
                      <MapPin className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium text-slate-400">Location</span>
                      <span className="text-xs font-semibold text-slate-700">{selectedCentre.location}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-100 bg-white shadow-sm">
                    <div className="p-1.5 bg-slate-50 rounded-md text-slate-500">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium text-slate-400">Medical Officer</span>
                      <span className="text-xs font-semibold text-slate-700">{selectedCentre.medical_officer}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-100 bg-white shadow-sm">
                    <div className="p-1.5 bg-blue-50 text-blue-500 rounded-md">
                      <Building2 className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium text-slate-400">Type</span>
                      <span className="text-xs font-semibold text-slate-700">{selectedCentre.type}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 p-2 rounded-lg border border-slate-100 bg-white shadow-sm">
                    <div className="p-1.5 bg-slate-50 rounded-md text-slate-500">
                      <Circle className={`w-3.5 h-3.5 ${selectedCentre.status === 'Active' ? 'fill-green-500 text-green-500' : 'fill-yellow-500 text-yellow-500'}`} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium text-slate-400">Status</span>
                      <span className="text-xs font-semibold text-slate-700">{selectedCentre.status}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* QUICK ACCESS */}
              <div className="space-y-3">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quick Access</h4>
                <div className="grid grid-cols-2 gap-2">
                  <Link href={`/patients?centre=${selectedCentre?.id}`} className="w-full" onClick={() => selectedCentre && setSelectedHospitalId(selectedCentre.id)}>
                    <Card className="border-slate-200 shadow-sm hover:border-blue-300 hover:bg-[#fafafa] transition-colors cursor-pointer group p-3 h-[76px] flex flex-col justify-center">
                      <CardContent className="p-0 flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-blue-100 text-blue-600 rounded-md">
                            <Users className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-semibold text-slate-800 leading-tight">Patients</span>
                            <span className="text-[9px] text-slate-500 leading-tight line-clamp-1">View patient records</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                      </CardContent>
                    </Card>
                  </Link>
                  <Link href={`/attendance?centre=${selectedCentre?.id}`} className="w-full" onClick={() => selectedCentre && setSelectedHospitalId(selectedCentre.id)}>
                    <Card className="border-slate-200 shadow-sm hover:border-blue-300 hover:bg-[#fafafa] transition-colors cursor-pointer group p-3 h-[76px] flex flex-col justify-center">
                      <CardContent className="p-0 flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-md">
                            <Stethoscope className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-semibold text-slate-800 leading-tight">Doctors</span>
                            <span className="text-[9px] text-slate-500 leading-tight line-clamp-1">View doctor details</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      </CardContent>
                    </Card>
                  </Link>
                  <Link href={`/inventory?centre=${selectedCentre?.id}`} className="w-full" onClick={() => selectedCentre && setSelectedHospitalId(selectedCentre.id)}>
                    <Card className="border-slate-200 shadow-sm hover:border-blue-300 hover:bg-[#fafafa] transition-colors cursor-pointer group p-3 h-[76px] flex flex-col justify-center">
                      <CardContent className="p-0 flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-blue-100 text-blue-600 rounded-md">
                            <Package className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-semibold text-slate-800 leading-tight">Inventory</span>
                            <span className="text-[9px] text-slate-500 leading-tight line-clamp-1">View medicine stock</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                      </CardContent>
                    </Card>
                  </Link>
                  <Link href={`/beds?centre=${selectedCentre?.id}`} className="w-full" onClick={() => selectedCentre && setSelectedHospitalId(selectedCentre.id)}>
                    <Card className="border-slate-200 shadow-sm hover:border-blue-300 hover:bg-[#fafafa] transition-colors cursor-pointer group p-3 h-[76px] flex flex-col justify-center">
                      <CardContent className="p-0 flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-blue-100 text-blue-600 rounded-md">
                            <BedDouble className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-semibold text-slate-800 leading-tight">Beds</span>
                            <span className="text-[9px] text-slate-500 leading-tight line-clamp-1">View bed availability</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                      </CardContent>
                    </Card>
                  </Link>
                  <Link href={`/analytics?centre=${selectedCentre?.id}`} className="w-full" onClick={() => selectedCentre && setSelectedHospitalId(selectedCentre.id)}>
                    <Card className="border-slate-200 shadow-sm hover:border-blue-300 hover:bg-[#fafafa] transition-colors cursor-pointer group p-3 h-[76px] flex flex-col justify-center">
                      <CardContent className="p-0 flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 bg-blue-100 text-blue-600 rounded-md">
                            <Activity className="w-3.5 h-3.5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-semibold text-slate-800 leading-tight">Analytics</span>
                            <span className="text-[9px] text-slate-500 leading-tight line-clamp-1">View performance metrics</span>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-500 transition-colors" />
                      </CardContent>
                    </Card>
                  </Link>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="space-y-3 pb-6">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Actions</h4>
                <div className="flex flex-col gap-3">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-11 px-4 border-none text-slate-700 bg-white hover:bg-slate-50 cursor-pointer shadow-sm"
                    onClick={() => {
                      setEditFormData(selectedCentre);
                      setIsEditOpen(true);
                      setIsViewOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Edit className="w-4 h-4 text-slate-500" />
                      <span className="font-semibold text-sm">Edit Centre Information</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between h-11 px-4 border-none text-red-700 bg-white hover:bg-red-50 hover:text-red-800 cursor-pointer shadow-sm"
                    onClick={() => {
                      setIsDeleteOpen(true);
                      setIsViewOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <Power className="w-4 h-4" />
                      <span className="font-semibold text-sm">Deactivate Centre</span>
                    </div>
                    <ChevronRight className="w-4 h-4 opacity-50" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Edit Centre Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-xl border-border bg-card/95 backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle>Edit Health Centre</DialogTitle>
            <DialogDescription>
              Make changes to {selectedCentre?.name}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Name</label>
                <Input 
                  className="col-span-3 bg-background"
                  value={editFormData.name || ''}
                  onChange={e => setEditFormData({...editFormData, name: e.target.value})}
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Type</label>
                <div className="col-span-3">
                  <Select value={editFormData.type} onValueChange={(val) => setEditFormData({...editFormData, type: val || ''})}>
                    <SelectTrigger className="w-full bg-background text-foreground cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PHC" className="cursor-pointer text-foreground">PHC</SelectItem>
                      <SelectItem value="CHC" className="cursor-pointer text-foreground">CHC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Location</label>
                <Input 
                  className="col-span-3 bg-background"
                  value={editFormData.location || ''}
                  onChange={e => setEditFormData({...editFormData, location: e.target.value})}
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Officer</label>
                <Input 
                  className="col-span-3 bg-background"
                  value={editFormData.medical_officer || ''}
                  onChange={e => setEditFormData({...editFormData, medical_officer: e.target.value})}
                  required
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Status</label>
                <div className="col-span-3">
                  <Select value={editFormData.status} onValueChange={(val) => setEditFormData({...editFormData, status: val || ''})}>
                    <SelectTrigger className="w-full bg-background text-foreground cursor-pointer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active" className="cursor-pointer text-foreground">Active</SelectItem>
                      <SelectItem value="Critical" className="cursor-pointer text-foreground">Critical</SelectItem>
                      <SelectItem value="Maintenance" className="cursor-pointer text-foreground">Maintenance</SelectItem>
                      <SelectItem value="Monitor" className="cursor-pointer text-foreground">Monitor</SelectItem>
                      <SelectItem value="Review" className="cursor-pointer text-foreground">Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={(open) => { setIsDeleteOpen(open); if (!open) setDeleteInput(""); }}>
        <DialogContent className="sm:max-w-[425px] rounded-xl border-border bg-card/95 backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Health Centre</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{selectedCentre?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Please type <strong>{selectedCentre?.name}</strong> to confirm:</label>
              <Input 
                value={deleteInput} 
                onChange={(e) => setDeleteInput(e.target.value)} 
                placeholder="Type name here..." 
              />
            </div>
          </div>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => { setIsDeleteOpen(false); setDeleteInput(""); }}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleteInput !== selectedCentre?.name}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
