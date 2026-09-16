"use client";
import { apiFetch, API_BASE_URL } from '@/lib/api';

import { useState, useEffect, useRef } from 'react';
import { History, Plus, Sparkles, Filter, MoreVertical, Loader2, Minus, Search, Upload, TrendingUp, TrendingDown, Package, Activity, Bot, FileText, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BillingModal } from '@/components/inventory/BillingModal';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import { PeriodSelector } from "@/components/ui/PeriodSelector";
import { PeriodOption, getPeriodRange, DateRange, formatExactTimestamp } from "@/lib/dateUtils";

// Type definitions
interface InventoryItem {
  id: number;
  item_code?: string;
  name: string;
  total_qty: number;
  qty_sold: number;
  min_threshold: number;
  price: number;
  quantity?: number;
  forecast_days?: string;
  status: string;
}

interface InventoryLog {
  id: number;
  inventory_id: number;
  item_name: string;
  change_type: string;   // RESTOCK / DISPENSE / UPDATE
  change_amount: number;
  reason: string | null;
  timestamp: string;
}

interface Analytics {
  most_used: string;
  least_used: string;
  period_consumption: number;
  period_restocking: number;
  fastest_moving: {name: string, sold: number}[];
  slowest_moving: {name: string, sold: number}[];
}

interface DraftRequest {
  item_name: string;
  draft_message: string;
}

interface AIAnalysis {
  insights: string;
  draft_requests: DraftRequest[];
}

interface SelectedMedicine {
  id: number;
  name: string;
  quantity: number;
  price: number;
  maxQty: number;
  originalQtySold: number;
}

export default function InventoryManagement() {
  const { user, token, selectedHospitalId } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const [period, setPeriod] = useState<PeriodOption>('This Month');
  const [dateRange, setDateRange] = useState<DateRange>(getPeriodRange('This Month'));
  const [alertTab, setAlertTab] = useState<'pending' | 'reviewed'>('pending');
  const [restockSearch, setRestockSearch] = useState("");

  // Modals state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isBillingOpen, setIsBillingOpen] = useState(false);
  const [hospitalName, setHospitalName] = useState("");

  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Billing State
  const [currentBillItems, setCurrentBillItems] = useState<SelectedMedicine[]>([]);

  // Form states
  const [formData, setFormData] = useState({
    item_code: '',
    name: '',
    total_qty: 0,
    min_threshold: 0,
    price: 0,
    status: 'Stable'
  });
  const [editFormData, setEditFormData] = useState<Partial<InventoryItem>>({});
  const [expandedNotes, setExpandedNotes] = useState<Record<string, boolean>>({});
  const [selectedRequestDetails, setSelectedRequestDetails] = useState<any>(null);

  const fetchAllData = async () => {
    try {
      setLoading(true);
      const headers: any = { 'X-Role': user?.role || 'DISTRICT_ADMIN' };
      if (selectedHospitalId) headers['X-Hospital-ID'] = selectedHospitalId.toString();
      
      const hospitalQuery = selectedHospitalId ? `&hospital_id=${selectedHospitalId}` : '';
      
      const fetchOpts: RequestInit = { headers, cache: 'no-store' };
      
      const [itemsRes, logsRes, requestsRes, forecastsRaw] = await Promise.all([
        apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/inventory/?limit=100${hospitalQuery}`, fetchOpts),
        apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/inventory/logs?limit=50${hospitalQuery}`, fetchOpts),
        apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/inventory/requests?limit=100${hospitalQuery}`, fetchOpts),
        selectedHospitalId ? apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/forecast/${selectedHospitalId}`, fetchOpts) : Promise.resolve({ ok: false } as { ok: boolean })
      ]);
      const forecastsRes = forecastsRaw as Response | { ok: boolean };

      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        const logsData = logsRes.ok ? await logsRes.json() : { data: [] };
        
        const forecastsData = forecastsRes.ok ? await (forecastsRes as Response).json() : [];
        setForecasts(forecastsData);
        
        const mappedItems = (itemsData.data || []).map((item: any) => {
          const forecast = forecastsData.find((f: any) => f.item_id === item.id);
          let forecastDays = undefined;
          if (forecast && forecast.projected_stockout_date) {
             const diff = new Date(forecast.projected_stockout_date).getTime() - new Date().getTime();
             forecastDays = Math.max(0, Math.ceil(diff / (1000 * 3600 * 24))).toString();
          }
          return {
            ...item,
            backend_qty: item.quantity || 0,
            total_qty: item.quantity || 0,
            qty_sold: 0,
            price: item.price || 0,
            status: item.status || 'Stable',
            forecast_days: forecastDays
          };
        });
        
        setItems(mappedItems);
        setLogs(logsData.data || []);
        
        const actualLogs = logsData.data || [];
        
        const itemDispenseCounts: Record<string, number> = {};
        let periodConsumption = 0;
        let periodRestocking = 0;
        const periodStart = dateRange.start;
        const periodEnd = dateRange.end;

        mappedItems.forEach((item: any) => {
          itemDispenseCounts[item.name] = 0;
        });

        actualLogs.forEach((log: any) => {
          const logDate = new Date(log.timestamp);
          
          if (logDate >= periodStart && logDate <= periodEnd) {
            if (log.change_type === 'DISPENSE') {
              itemDispenseCounts[log.item_name] = (itemDispenseCounts[log.item_name] || 0) + log.change_amount;
              periodConsumption += log.change_amount;
            } else if (log.change_type === 'RESTOCK') {
              periodRestocking += log.change_amount;
            }
          } else if (log.change_type === 'DISPENSE') {
            // Still count it towards all-time most used if needed? 
            // Wait, maybe we only want period-specific top movers? Let's make it period specific.
            // So we only count if it's within the period!
            // Which means the above block correctly adds to itemDispenseCounts only if within period.
          }
        });
        
        const sortedItems = Object.entries(itemDispenseCounts).sort((a: any, b: any) => b[1] - a[1]);
        const mostUsed = sortedItems.length > 0 ? sortedItems[0][0] : "N/A";
        const leastUsed = sortedItems.length > 0 ? sortedItems[sortedItems.length - 1][0] : "N/A";
        
        const fastestMoving = sortedItems.slice(0, 3).map((i: any) => ({ name: i[0], sold: i[1] }));
        const slowestMoving = sortedItems.slice(-3).reverse().map((i: any) => ({ name: i[0], sold: i[1] }));
        
        setAnalytics({
          most_used: mostUsed,
          least_used: leastUsed,
          period_consumption: periodConsumption,
          period_restocking: periodRestocking,
          fastest_moving: fastestMoving,
          slowest_moving: slowestMoving
        });

        if(requestsRes.ok) setRequests(await requestsRes.json());
        
        const phcRes = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/phc`);
        if (phcRes.ok) {
          const phcs = await phcRes.json();
          const currentPhc = phcs.find((p: any) => p.id === selectedHospitalId);
          if (currentPhc) setHospitalName(currentPhc.name);
          else if (phcs.length > 0) setHospitalName(phcs[0].name);
        }
      } else {
        console.error("Failed to fetch inventory data");
      }
    } catch (error) {
      console.error("Network error: Could not reach backend", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'DISTRICT_ADMIN' || user?.role === 'DEVELOPER') {
      if (selectedHospitalId) fetchAllData();
    } else {
      fetchAllData();
    }
    const savedAi = localStorage.getItem('inventoryAiAnalysis');
    if (savedAi) {
      try {
        setAiAnalysis(JSON.parse(savedAi));
      } catch (e) {
        console.error("Failed to parse saved AI analysis");
      }
    }
  }, [user, selectedHospitalId, dateRange]);

  useEffect(() => {
    setItems(current => current.map(item => {
      const billItem = currentBillItems.find(b => b.id === item.id);
      const qtyInBill = billItem ? billItem.quantity : 0;
      return {
        ...item,
        qty_sold: qtyInBill,
        total_qty: ((item as any).backend_qty || 0) - qtyInBill
      };
    }));
  }, [currentBillItems]);

  const generateAIAnalysis = async () => {
    try {
      setAiLoading(true);
      const hospitalQuery = selectedHospitalId ? `?hospital_id=${selectedHospitalId}` : '';
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/inventory/analyze-ai${hospitalQuery}`, {
        method: 'POST',
        headers: { 'X-Role': 'DISTRICT_ADMIN' }
      });
      if (res.ok) {
        const data = await res.json();
        setAiAnalysis(data);
        localStorage.setItem('inventoryAiAnalysis', JSON.stringify(data));
        toast.success("AI Analysis complete!");
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast.error(errorData.detail || "Failed to generate AI analysis");
      }
    } catch (error) {
      toast.error("Network error: Could not reach AI service");
    } finally {
      setAiLoading(false);
    }
  };

  const generateForecast = async () => {
    try {
      setForecastLoading(true);
      const hospitalQuery = selectedHospitalId ? `?hospital_id=${selectedHospitalId}` : '';
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/forecast/trigger${hospitalQuery}`, {
        method: 'POST',
        headers: { 'X-Role': 'DISTRICT_ADMIN' }
      });
      if (res.ok) {
        toast.success("Forecast generated successfully!");
        fetchAllData();
      } else {
        toast.error("Failed to generate forecast");
      }
    } catch (error) {
      toast.error("Network error: Could not reach forecasting service");
    } finally {
      setForecastLoading(false);
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sendRequest = async (draft: DraftRequest) => {
    try {
      const hospitalQuery = selectedHospitalId ? `?hospital_id=${selectedHospitalId}` : '';
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/inventory/requests${hospitalQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_name: draft.item_name, message: draft.draft_message })
      });
      if (res.ok) {
        toast.success("Request sent to District Admin");
        fetchAllData(); 
      } else {
        toast.error("Failed to send request");
      }
    } catch (e) {
      toast.error("Network error");
    }
  };

  // Handlers
  const handleItemCodeLookup = async (code: string) => {
    if (!code) return;
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/inventory/lookup?item_code=${code}`);
      if (res.ok) {
        const data = await res.json();
        setFormData(prev => ({
          ...prev,
          name: data.name || prev.name
        }));
        toast.success("Medicine details autofilled from ID!");
      }
    } catch (e) {
      // Ignore if not found
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const hospitalQuery = selectedHospitalId ? `?hospital_id=${selectedHospitalId}` : '';
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/inventory/${hospitalQuery}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Role': 'DISTRICT_ADMIN'
        },
        body: JSON.stringify({
          item_code: formData.item_code,
          name: formData.name,
          category: 'Medicine',
          quantity: formData.total_qty,
          unit: 'units',
          price: formData.price,
          min_threshold: formData.min_threshold,
          status: formData.status
        })
      });
      if (res.ok) {
        toast.success("Medicine added successfully!");
        setIsAddOpen(false);
        setFormData({ item_code: '', name: '', total_qty: 0, min_threshold: 0, price: 0, status: 'Stable' });
        fetchAllData();
      } else {
        toast.error("Failed to add medicine");
      }
    } catch (error) {
      toast.error("Network error");
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    try {
      const hospitalQuery = selectedHospitalId ? `?hospital_id=${selectedHospitalId}` : '';
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/inventory/${selectedItem.id}${hospitalQuery}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-Role': 'DISTRICT_ADMIN'
        },
        body: JSON.stringify({
          item_code: editFormData.item_code,
          name: editFormData.name,
          quantity: editFormData.total_qty,
          price: editFormData.price,
          min_threshold: editFormData.min_threshold
        })
      });
      if (res.ok) {
        toast.success("Medicine updated successfully!");
        setIsEditOpen(false);
        fetchAllData();
      } else {
        toast.error("Failed to update medicine");
      }
    } catch (error) {
      toast.error("Network error");
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    try {
      const hospitalQuery = selectedHospitalId ? `?hospital_id=${selectedHospitalId}` : '';
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/inventory/${selectedItem.id}${hospitalQuery}`, {
        method: 'DELETE',
        headers: { 'X-Role': 'DISTRICT_ADMIN' }
      });
      if (res.ok) {
        toast.success("Medicine deleted successfully!");
        setIsDeleteOpen(false);
        fetchAllData();
      } else {
        toast.error("Failed to delete medicine");
      }
    } catch (error) {
      toast.error("Network error");
    }
  };

  const updateQuantitySold = (item: InventoryItem, delta: number) => {
    const billItem = currentBillItems.find(b => b.id === item.id);
    if (!billItem) {
      if (delta > 0) addToBill(item);
      return;
    }
    
    if (billItem.quantity + delta <= 0) {
      removeFromBill(item.id);
    } else {
      updateBillQty(item.id, delta);
    }
  };

  const handleQuantityClick = (item: InventoryItem, delta: number) => {
    if (user?.role === 'DISTRICT_ADMIN') {
      toast.error("Access Denied: District Admins cannot modify bills or dispense medicines.", {
        description: "Your role is view-only for operational data."
      });
      return;
    }
    updateQuantitySold(item, delta);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);
    
    const loadingToast = toast.loading("Uploading CSV...");
    try {
      const hospitalQuery = selectedHospitalId ? `?hospital_id=${selectedHospitalId}` : '';
      const res = await apiFetch(`${API_BASE_URL}/api/v1/inventory/upload-csv${hospitalQuery}`, {
        method: 'POST',
        headers: { 'X-Role': 'DISTRICT_ADMIN' },
        body: formData
      });
      
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message, { id: loadingToast });
        fetchAllData();
      } else {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.detail || "Bulk upload failed", { id: loadingToast });
      }
    } catch (err) {
      toast.error("Network error during upload", { id: loadingToast });
    }
    
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getStatusBadge = (item: InventoryItem) => {
    const available = item.total_qty || item.quantity || 0;
    const qty_sold = item.qty_sold || 0;
    const min_thresh = item.min_threshold || 0;
    const currentStock = available - qty_sold;
    
    if (currentStock < min_thresh) {
      return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">Critical</Badge>;
    }
    if (currentStock < min_thresh * 1.5) {
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-700 border-yellow-200">Low Stock</Badge>;
    }
    if (currentStock <= min_thresh + 50) {
      return <Badge variant="outline" className="bg-blue-100 text-blue-700 border-blue-200">Sufficient</Badge>;
    }
    return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Optimal</Badge>;
  };

  const criticalMeds = items.filter(item => {
    const available = item.total_qty || item.quantity || 0;
    const qty_sold = item.qty_sold || 0;
    const min_thresh = item.min_threshold || 0;
    return (available - qty_sold) <= min_thresh;
  });

  const lowStockMeds = items.filter(item => {
    const available = item.total_qty || item.quantity || 0;
    const qty_sold = item.qty_sold || 0;
    const min_thresh = item.min_threshold || 0;
    const currentStock = available - qty_sold;
    return currentStock > min_thresh && currentStock <= (min_thresh * 1.5);
  });

  const sufficientMeds = items.filter(item => {
    const available = item.total_qty || item.quantity || 0;
    const qty_sold = item.qty_sold || 0;
    const min_thresh = item.min_threshold || 0;
    const currentStock = available - qty_sold;
    return currentStock > (min_thresh * 1.5) && currentStock <= (min_thresh + 50);
  });

  const localRequests = [
    ...criticalMeds.map(m => {
      const available = m.total_qty || m.quantity || 0;
      const qty_sold = m.qty_sold || 0;
      const min_thresh = m.min_threshold || 0;
      return { 
        item_name: m.name, 
        draft_message: `Urgent: Stock for ${m.name} is critically low (Available: ${available - qty_sold}, Min: ${min_thresh}). Please approve an emergency restock.`,
        alert_type: 'critical'
      }
    }),
    ...lowStockMeds.map(m => {
      const available = m.total_qty || m.quantity || 0;
      const qty_sold = m.qty_sold || 0;
      const min_thresh = m.min_threshold || 0;
      return { 
        item_name: m.name, 
        draft_message: `Low Stock: Stock for ${m.name} is approaching the minimum threshold (Available: ${available - qty_sold}, Min: ${min_thresh}). Please consider restocking.`,
        alert_type: 'low'
      }
    }),
    ...sufficientMeds.map(m => {
      const available = m.total_qty || m.quantity || 0;
      const qty_sold = m.qty_sold || 0;
      const min_thresh = m.min_threshold || 0;
      return { 
        item_name: m.name, 
        draft_message: `Sufficient Stock: ${m.name} currently has sufficient levels (Available: ${available - qty_sold}, Min: ${min_thresh}). Monitor closely.`,
        alert_type: 'sufficient'
      }
    })
  ];

  // Add proactive alerts for high moving stock and forecasts
  if (analytics?.fastest_moving) {
    analytics.fastest_moving.forEach(fast => {
      if (!localRequests.some(r => r.item_name === fast.name) && fast.sold > 0) {
        localRequests.push({
          item_name: fast.name,
          draft_message: `Proactive Alert: High Demand for ${fast.name} (${fast.sold} units dispensed recently). Consider restocking to prevent future shortages.`,
          alert_type: 'proactive'
        });
      }
    });
  }

  items.forEach(item => {
    if (item.forecast_days && parseInt(item.forecast_days) <= 14) {
      if (!localRequests.some(r => r.item_name === item.name)) {
        localRequests.push({
          item_name: item.name,
          draft_message: `AI Forecast Alert: Our demand forecasting model predicts that ${item.name} will run out of stock in ${item.forecast_days} days. Please consider restocking soon.`,
          alert_type: 'proactive'
        });
      }
    }
  });

  // Billing Handlers
  const addToBill = (item: InventoryItem) => {
    setCurrentBillItems(current => {
      // Use original backend quantity logic if possible to avoid state timing issues
      const backendQty = (item as any).backend_qty !== undefined ? (item as any).backend_qty : item.total_qty;
      const alreadyInBill = current.find(m => m.id === item.id);
      
      if (alreadyInBill) {
        setTimeout(() => toast.error(`${item.name} is already in the bill`), 0);
        return current;
      }
      
      if (backendQty <= 0) {
        setTimeout(() => toast.error(`${item.name} is out of stock`), 0);
        return current;
      }

      setTimeout(() => toast.success(`Added ${item.name} to bill`), 0);
      return [
        ...current,
        {
          id: item.id,
          name: item.name,
          price: item.price,
          quantity: 1,
          maxQty: backendQty,
          originalQtySold: item.qty_sold
        }
      ];
    });
  };

  const updateBillQty = (id: number, delta: number) => {
    setCurrentBillItems(current => {
      let maxQtyError = false;
      let errorMsg = '';
      
      const newItems = current.map(med => {
        if (med.id === id) {
          const newQty = med.quantity + delta;
          if (newQty > med.maxQty) {
            maxQtyError = true;
            errorMsg = `Only ${med.maxQty} units of ${med.name} are available.`;
            return med;
          }
          if (newQty < 1) return med;
          return { ...med, quantity: newQty };
        }
        return med;
      });
      
      if (maxQtyError) {
        setTimeout(() => toast.error(errorMsg), 0);
      }
      
      return newItems;
    });
  };

  const removeFromBill = (id: number) => {
    setCurrentBillItems(current => current.filter(m => m.id !== id));
  };
  
  const billTotal = currentBillItems.reduce((sum, med) => sum + (med.quantity * med.price), 0);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div className="flex flex-col gap-2">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Inventory & Supplies</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage stock, track distribution history, and view analytics.</p>
          </div>
          <div>
             <PeriodSelector 
                value={period} 
                onChange={(p, r) => { setPeriod(p); setDateRange(r); }} 
                options={['This Week', 'Previous Week', 'This Month', 'Previous Month', 'This Year', 'Custom Range']} 
              />
          </div>
        </div>
        <div className="flex flex-wrap gap-3 w-full md:w-auto mt-4 md:mt-0">
          <Button variant="outline" onClick={() => setIsHistoryOpen(true)} className="flex-1 md:flex-none flex items-center gap-2 shadow-sm cursor-pointer">
            <History className="w-4 h-4" />
            View History
          </Button>

          {user?.role !== "DISTRICT_ADMIN" && (
            <>
              <input type="file" accept=".csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} className="flex-1 md:flex-none flex items-center gap-2 shadow-sm border-primary/50 text-primary cursor-pointer">
                <Upload className="w-4 h-4" />
                Upload Bulk CSV
              </Button>
            </>
          )}
          
          {user?.role !== "DISTRICT_ADMIN" && (
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger render={<Button className="flex-1 md:flex-none flex items-center gap-2 shadow-sm cursor-pointer" />}>
                <Plus className="w-4 h-4" />
                Add Medicine
              </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-xl border-border bg-card/95 backdrop-blur-md shadow-2xl">
              <DialogHeader>
                <DialogTitle>Add New Medicine</DialogTitle>
                <DialogDescription>
                  Enter medicine details to track in the inventory.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleAdd}>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm font-medium">Item ID</label>
                    <Input className="col-span-3 bg-card" placeholder="Enter code" value={formData.item_code} onChange={e => setFormData({...formData, item_code: e.target.value})} onBlur={e => handleItemCodeLookup(e.target.value)} required />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm font-medium">Name</label>
                    <Input className="col-span-3 bg-card" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm font-medium">Total Qty</label>
                    <Input type="number" className="col-span-3 bg-card" value={formData.total_qty} onChange={e => setFormData({...formData, total_qty: parseInt(e.target.value) || 0})} required />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm font-medium">Min Thresh</label>
                    <Input type="number" className="col-span-3 bg-card" value={formData.min_threshold} onChange={e => setFormData({...formData, min_threshold: parseInt(e.target.value) || 0})} required />
                  </div>
                  <div className="grid grid-cols-4 items-center gap-4">
                    <label className="text-right text-sm font-medium">Price (₹)</label>
                    <Input type="number" step="0.01" className="col-span-3 bg-card" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})} required />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit">Save Item</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </div>

      {/* Inventory Analytics Widget (Moved to top full-width) */}
      <Card className="border-border shadow-sm hover:shadow-md transition-shadow relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
            <Activity className="w-5 h-5 text-primary" />
            Inventory Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-muted/30 p-3 rounded-lg border border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Most Used</p>
              <p className="text-sm font-semibold truncate text-primary">{analytics?.most_used || '-'}</p>
            </div>
            <div className="bg-muted/30 p-3 rounded-lg border border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Least Used</p>
              <p className="text-sm font-semibold truncate">{analytics?.least_used || '-'}</p>
            </div>
            <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
              <p className="text-[10px] uppercase tracking-wider text-blue-700 font-semibold mb-1">Consumed ({period})</p>
              <p className="text-lg font-bold text-blue-900">{analytics?.period_consumption.toLocaleString('en-IN') || '0'}</p>
            </div>
            <div className="bg-green-50/50 p-3 rounded-lg border border-green-100">
              <p className="text-[10px] uppercase tracking-wider text-green-700 font-semibold mb-1">Restocked ({period})</p>
              <p className="text-lg font-bold text-green-900">{analytics?.period_restocking.toLocaleString('en-IN') || '0'}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1 mb-2">
                <TrendingUp className="w-3 h-3 text-green-600" /> Top Fast-Moving
              </h4>
              <div className="flex flex-wrap gap-2">
                {analytics?.fastest_moving.slice(0, 4).map((item, idx) => (
                  <Badge key={idx} variant="secondary" className="bg-green-50 text-green-700 hover:bg-green-50">
                    {item.name} <span className="ml-1 opacity-70">({item.sold})</span>
                  </Badge>
                ))}
                {!analytics?.fastest_moving.length && <p className="text-xs text-muted-foreground">No data available.</p>}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1 mb-2">
                <TrendingDown className="w-3 h-3 text-red-600" /> Top Slow-Moving
              </h4>
              <div className="flex flex-wrap gap-2">
                {analytics?.slowest_moving.slice(0, 4).map((item, idx) => (
                  <Badge key={idx} variant="secondary" className="bg-red-50 text-red-700 hover:bg-red-50">
                    {item.name} <span className="ml-1 opacity-70">({item.sold})</span>
                  </Badge>
                ))}
                {!analytics?.slowest_moving.length && <p className="text-xs text-muted-foreground">No data available.</p>}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Data Table */}
        <div className="lg:col-span-8">
          <Card className="border-border shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md transition-shadow">
            <div className="p-4 border-b border-border flex flex-wrap justify-between items-center bg-muted/20 gap-4">
              <h3 className="text-base font-medium text-foreground whitespace-nowrap">Live Inventory Status</h3>
              
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search medicines..."
                  className="pl-9 h-9 w-full bg-card"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div className="overflow-x-auto h-[530px] custom-scrollbar">
              <Table>
                <TableHeader className="bg-muted/10 sticky top-0 z-10 backdrop-blur-md">
                  <TableRow>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Med Name</TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">Cart Qty</TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Total Qty</TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Price</TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-right">Min Threshold</TableHead>
                    <TableHead className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider text-center">Status</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10">
                        <div className="flex justify-center items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin" /> Loading stock data...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        No medicines found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map(item => {
                      const isOutOfStock = (item.total_qty - item.qty_sold) <= 0;
                      const inBill = currentBillItems.some(b => b.id === item.id);
                      return (
                      <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium text-foreground">{item.name}</span>
                            {item.item_code && (
                              <span className="text-xs text-muted-foreground font-mono">ID: {item.item_code}</span>
                            )}
                            {item.forecast_days && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full w-fit">
                                <Bot className="w-3 h-3" />
                                AI Forecast: Predicted stock-out in {item.forecast_days} days
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-2 bg-muted/30 rounded-full px-1 py-1 w-max mx-auto border border-border">
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleQuantityClick(item, -1); }} className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-destructive/10 text-destructive transition-colors cursor-pointer disabled:opacity-50" disabled={item.qty_sold <= 0}>
                              <Minus className="h-3 w-3" />
                            </button>
                            <span className="font-mono font-semibold w-8 text-center text-foreground text-sm">{item.qty_sold}</span>
                            <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleQuantityClick(item, 1); }} className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-primary/10 text-primary transition-colors cursor-pointer">
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{item.total_qty}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">₹{item.price}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{item.min_threshold}</TableCell>
                        <TableCell className="text-center">
                          {getStatusBadge(item)}
                        </TableCell>
                        <TableCell>
                          {user?.role !== "DISTRICT_ADMIN" && (
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-full hover:bg-muted cursor-pointer">
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem className="cursor-pointer" onClick={() => { setSelectedItem(item); setEditFormData(item); setIsEditOpen(true); }}>
                                  Edit Details
                                </DropdownMenuItem>
                                <DropdownMenuItem className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => { setSelectedItem(item); setIsDeleteOpen(true); }}>
                                  Delete Item
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TableCell>
                      </TableRow>
                    )})
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>

        {/* Current Bill Card */}
        <div className="lg:col-span-4 flex flex-col">
          <Card className="border-border shadow-sm flex flex-col h-full hover:shadow-md transition-shadow relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-primary"></div>
            <CardHeader className="pb-4 border-b border-border bg-muted/10">
              <CardTitle className="text-base font-medium flex items-center gap-2 text-foreground">
                <FileText className="w-5 h-5 text-primary" />
                Current Bill
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col p-0 overflow-hidden bg-card h-[465px]">
              {currentBillItems.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-muted-foreground h-full">
                  <Package className="w-8 h-8 mb-3 opacity-20" />
                  <p className="font-medium text-foreground">No medicines added yet</p>
                  <p className="text-sm text-center mt-1">Add medicines from the inventory table to create a bill.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar h-full">
                  {currentBillItems.map(med => (
                    <div key={med.id} className="flex justify-between items-start p-3 bg-muted/30 border border-border rounded-lg shadow-sm">
                      <div className="flex-1">
                        <h4 className="font-medium text-sm text-foreground">{med.name}</h4>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => updateBillQty(med.id, -1)} className="w-6 h-6 rounded bg-card border border-border flex items-center justify-center hover:bg-muted cursor-pointer" disabled={med.quantity <= 1}>
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="text-sm font-medium w-4 text-center">{med.quantity}</span>
                          <button onClick={() => updateBillQty(med.id, 1)} className="w-6 h-6 rounded bg-card border border-border flex items-center justify-center hover:bg-muted cursor-pointer" disabled={med.quantity >= med.maxQty}>
                            <Plus className="w-3 h-3" />
                          </button>
                          <span className="text-xs text-muted-foreground ml-2">₹{med.price.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end justify-between h-full gap-2">
                        <button onClick={() => removeFromBill(med.id)} className="text-destructive hover:bg-destructive/10 p-1 rounded transition-colors cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <span className="font-medium text-sm mt-1 text-foreground">₹{(med.quantity * med.price).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Footer / Total */}
              <div className="p-4 border-t border-border bg-muted/10 mt-auto shrink-0">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex flex-col">
                    <span className="text-sm text-muted-foreground font-medium">{currentBillItems.length} {currentBillItems.length === 1 ? 'item' : 'items'}</span>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <span className="text-sm text-muted-foreground font-medium uppercase">Total</span>
                    <span className="text-xl font-bold text-primary">₹{billTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                  </div>
                </div>
                <Button 
                  className="w-full shadow-sm cursor-pointer" 
                  disabled={currentBillItems.length === 0} 
                  onClick={() => setIsBillingOpen(true)}
                >
                  Create Bill
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* AI & Local Alerts Section */}
      <div className="mt-4">
        <Card className="border-border shadow-sm overflow-hidden">
          <CardHeader className="border-b border-border bg-muted/10 pb-4">
            <div className="flex justify-between items-center">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-500" />
                Intelligent Supply Chain & Alerts
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                  <Bot className="w-3 h-3" />
                  AI Forecast
                </span>
              </CardTitle>
              <div className="flex gap-2">
                <Button onClick={generateForecast} disabled={forecastLoading} variant="outline" className="shadow-sm cursor-pointer border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                  {forecastLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Running...</>
                  ) : (
                    <><Bot className="w-4 h-4 mr-2" /> Run Forecast Now</>
                  )}
                </Button>
                <Button onClick={generateAIAnalysis} disabled={aiLoading} className="shadow-sm cursor-pointer">
                  {aiLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Analyzing Stock...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" /> Generate AI Insights</>
                  )}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Side: Local Critical Alerts (Moved from Right) */}
              <div className="space-y-4 h-[500px] flex flex-col">
                <div className="flex flex-col shrink-0 gap-3 mb-1">
                  <h3 className="font-semibold text-foreground flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-500" />
                    Restock Recommendations & Alerts
                  </h3>
                  <div className="relative w-full">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input 
                      placeholder="Search items..." 
                      value={restockSearch} 
                      onChange={(e) => setRestockSearch(e.target.value)} 
                      className="w-full h-9 pl-9 text-sm bg-background" 
                    />
                  </div>
                  <div className="flex bg-muted/50 p-1 rounded-lg border border-border w-full">
                    <button
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${alertTab === 'pending' ? 'bg-background shadow-sm border border-border text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setAlertTab('pending')}
                    >
                      Pending
                    </button>
                    <button
                      className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer ${alertTab === 'reviewed' ? 'bg-background shadow-sm border border-border text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      onClick={() => setAlertTab('reviewed')}
                    >
                      Reviewed
                    </button>
                  </div>
                </div>

                {(() => {
                  let filteredDrafts = localRequests.filter((draft: any) => {
                    const relatedReqs = requests.filter(r => r.resource_name === draft.item_name);
                    const existingReq = relatedReqs.find(r => r.status === 'APPROVED') || relatedReqs[0];
                    if (alertTab === 'pending') {
                      return !existingReq || existingReq.status === 'PENDING';
                    } else {
                      return existingReq && (existingReq.status === 'APPROVED' || existingReq.status === 'REJECTED' || existingReq.status === 'FULFILLED');
                    }
                  });
                  
                  if (restockSearch) {
                    filteredDrafts = filteredDrafts.filter((d: any) => d.item_name.toLowerCase().includes(restockSearch.toLowerCase()));
                  }

                  if (filteredDrafts.length === 0) {
                    return (
                      <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-lg flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <p className="text-sm font-medium">
                          {restockSearch ? "No items match your search." : alertTab === 'pending' ? "All critical thresholds are met. No pending requests." : "No reviewed requests for current recommendations."}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
                      {filteredDrafts.map((draft: any, idx: number) => {
                        const relatedReqs = requests.filter(r => r.resource_name === draft.item_name);
                        const existingReq = relatedReqs.find(r => r.status === 'APPROVED') || relatedReqs[0];
                        const isLocked = !!existingReq;
                        
                        let borderColor = 'border-destructive/20';
                        let bgColor = 'bg-destructive/50';
                        let badgeVariant: "default" | "destructive" | "outline" | "secondary" | null | undefined = 'destructive';
                        let badgeText = 'Critical';
                        
                        if (draft.alert_type === 'low') {
                          borderColor = 'border-yellow-500/20';
                          bgColor = 'bg-yellow-500/50';
                          badgeVariant = 'secondary';
                          badgeText = 'Low Stock';
                        } else if (draft.alert_type === 'sufficient') {
                          borderColor = 'border-blue-500/20';
                          bgColor = 'bg-blue-500/50';
                          badgeVariant = 'default';
                          badgeText = 'Sufficient';
                        } else if (draft.alert_type === 'proactive') {
                          borderColor = 'border-indigo-500/20';
                          bgColor = 'bg-indigo-500/50';
                          badgeVariant = 'secondary';
                          badgeText = 'High Demand';
                        }
                        
                        return (
                          <div key={idx} className={`bg-card border ${borderColor} rounded-xl p-4 shadow-sm relative overflow-hidden group h-[200px] flex flex-col`}>
                            {isLocked && (
                              <div 
                                className="absolute inset-0 bg-background/20 backdrop-blur-sm z-10 flex flex-col items-center justify-center border border-border cursor-pointer hover:bg-background/30 transition-colors"
                                onClick={() => setSelectedRequestDetails(existingReq)}
                              >
                                <h4 className="text-sm font-bold mb-2 text-foreground">{draft.item_name}</h4>
                                <Badge 
                                  variant="outline" 
                                  className={`uppercase px-4 py-1 text-sm shadow-md text-white border-none ${existingReq.status === 'APPROVED' ? 'bg-green-500' : existingReq.status === 'REJECTED' ? 'bg-red-500' : 'bg-gray-500'}`}
                                >
                                  {existingReq.status}
                                </Badge>
                                <p className="text-xs text-foreground/80 mt-2 font-medium bg-background/50 px-2 py-1 rounded-md shadow-sm border border-border/50">Click here to see more details</p>
                              </div>
                            )}
                            
                            <div className={`absolute top-0 left-0 w-1 h-full ${bgColor} transition-colors`}></div>
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                              <Badge variant={badgeVariant} className={draft.alert_type === 'low' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100' : draft.alert_type === 'sufficient' ? 'bg-blue-100 text-blue-700 hover:bg-blue-100' : draft.alert_type === 'proactive' ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100' : 'px-1.5 py-0'}>{badgeText}</Badge>
                              {draft.item_name}
                            </h4>
                            <div className="bg-muted/30 p-3 rounded-lg text-sm text-foreground/80 mb-3 border border-border/50 font-medium whitespace-pre-wrap flex-1 overflow-y-auto">
                              {draft.draft_message}
                            </div>
                            <div className="flex justify-end shrink-0">
                              <Button disabled={isLocked} onClick={() => sendRequest(draft)} variant="outline" className={`border-${draft.alert_type === 'critical' ? 'destructive' : 'primary'}/30 text-${draft.alert_type === 'critical' ? 'destructive' : 'primary'} hover:bg-${draft.alert_type === 'critical' ? 'destructive' : 'primary'} hover:text-white transition-colors cursor-pointer text-xs h-8`}>
                                Send Request for {draft.item_name}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Right Side: General AI Insights (Moved from Left) */}
              <div className="space-y-4 bg-muted/20 p-5 rounded-xl border border-border h-[500px] overflow-y-auto">
                <h3 className="font-semibold text-foreground flex items-center gap-2 mb-4">
                  <Activity className="w-4 h-4 text-indigo-500" />
                  AI Detailed Medicine Insights
                </h3>
                {!aiAnalysis && !aiLoading && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Sparkles className="w-8 h-8 mx-auto mb-3 text-muted" />
                    <p>Click "Generate AI Insights" to get an automated detailed deep dive into every medicine powered by Gemini.</p>
                  </div>
                )}
                {aiLoading && (
                  <div className="text-center py-12 text-muted-foreground flex flex-col items-center justify-center">
                    <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-indigo-500" />
                    <p>AI is reviewing your database records...</p>
                  </div>
                )}
                {aiAnalysis && !aiLoading && (
                  <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground leading-relaxed">
                    <ReactMarkdown>{Array.isArray(aiAnalysis.insights) ? aiAnalysis.insights.join('\n\n') : aiAnalysis.insights || ''}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Medicine Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-xl">
          <DialogHeader>
            <DialogTitle>Edit Medicine Details</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Item ID</label>
                <Input className="col-span-3 bg-card" value={editFormData.item_code || ''} onChange={e => setEditFormData({...editFormData, item_code: e.target.value})} required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Name</label>
                <Input className="col-span-3 bg-card" value={editFormData.name || ''} onChange={e => setEditFormData({...editFormData, name: e.target.value})} required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Total Qty</label>
                <Input type="number" className="col-span-3 bg-card" value={editFormData.total_qty ?? 0} onChange={e => setEditFormData({...editFormData, total_qty: parseInt(e.target.value) || 0})} required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Min Thresh</label>
                <Input type="number" className="col-span-3 bg-card" value={editFormData.min_threshold ?? 0} onChange={e => setEditFormData({...editFormData, min_threshold: parseInt(e.target.value) || 0})} required />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <label className="text-right text-sm font-medium">Price (₹)</label>
                <Input type="number" step="0.01" className="col-span-3 bg-card" value={editFormData.price ?? 0} onChange={e => setEditFormData({...editFormData, price: parseFloat(e.target.value) || 0})} required />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)} className="cursor-pointer">Cancel</Button>
              <Button type="submit" className="cursor-pointer">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[425px] rounded-xl border-border bg-card/95 backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-destructive">Delete Medicine</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{selectedItem?.name}</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setIsDeleteOpen(false)} className="cursor-pointer">Cancel</Button>
            <Button type="button" variant="destructive" onClick={handleDelete} className="cursor-pointer">Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View History Dialog */}
      <Dialog open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] flex flex-col rounded-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Inventory Distribution & Tracking Logs
            </DialogTitle>
            <DialogDescription>
              Timeline of all additions, distributions, edits, and removals across the inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 pr-2 py-4 space-y-3">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No history logs found.</p>
            ) : (
              logs.map((log) => {
                const isRestock = log.change_type === 'RESTOCK' || log.change_type === 'UPDATE';
                const isDispense = log.change_type === 'DISPENSE';
                const actionLabel = log.change_type === 'RESTOCK' ? 'Restocked'
                  : log.change_type === 'DISPENSE' ? 'Dispensed (Bill)'
                  : log.change_type === 'UPDATE' ? 'Updated'
                  : log.change_type;
                const iconColor = isRestock ? 'text-emerald-600' : isDispense ? 'text-amber-600' : 'text-blue-500';
                const bgColor = isRestock ? 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
                  : isDispense ? 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
                  : 'bg-muted/20 border-border';

                return (
                  <div key={log.id} className={`flex items-start gap-4 p-3 rounded-lg border ${bgColor}`}>
                    <div className="mt-1">
                      {isRestock && <TrendingUp className={`w-4 h-4 ${iconColor}`} />}
                      {isDispense && <TrendingDown className={`w-4 h-4 ${iconColor}`} />}
                      {!isRestock && !isDispense && <Activity className={`w-4 h-4 ${iconColor}`} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        <span className={iconColor}>{actionLabel}</span>
                        {' '}&mdash;{' '}
                        <span className="font-bold">{log.item_name || `Item #${log.inventory_id}`}</span>
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <span className="font-medium">{log.change_amount} units</span>
                        {log.reason && <> &bull; {log.reason}</>}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1">
                        {new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'medium',
                          timeStyle: 'short'
                        })}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setIsHistoryOpen(false)} className="cursor-pointer">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BillingModal 
        isOpen={isBillingOpen} 
        onOpenChange={setIsBillingOpen} 
        selectedMedicines={currentBillItems} 
        hospitalName={hospitalName} 
        onSuccess={() => { setCurrentBillItems([]); fetchAllData(); }}
      />

      <Dialog open={!!selectedRequestDetails} onOpenChange={(open) => !open && setSelectedRequestDetails(null)}>
        <DialogContent className="sm:max-w-[425px] bg-card border border-border">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              Request Details
            </DialogTitle>
            <DialogDescription>
              Information about your emergency restock request.
            </DialogDescription>
          </DialogHeader>
          {selectedRequestDetails && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">Medicine</span>
                <span className="font-semibold text-foreground">{selectedRequestDetails.resource_name}</span>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">Status</span>
                <Badge variant={selectedRequestDetails.status === 'APPROVED' ? 'default' : selectedRequestDetails.status === 'REJECTED' ? 'destructive' : 'secondary'} className="uppercase">
                  {selectedRequestDetails.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm text-muted-foreground">Requested On</span>
                <span className="text-sm text-foreground">
                  {new Date(selectedRequestDetails.created_at).toLocaleString('en-IN', )}
                </span>
              </div>
              {selectedRequestDetails.updated_at && (
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="text-sm text-muted-foreground">Actioned On</span>
                  <span className="text-sm text-foreground">
                    {new Date(selectedRequestDetails.updated_at).toLocaleString('en-IN', )}
                  </span>
                </div>
              )}
              <div className="space-y-1">
                <span className="text-sm text-muted-foreground block">Original Ask</span>
                <p className="text-sm text-foreground bg-muted/30 p-2 rounded-md border border-border">
                  {selectedRequestDetails.notes || 'No notes provided.'}
                </p>
              </div>
              <div className="space-y-1 mt-2">
                <span className="text-sm text-muted-foreground block">Admin Notes</span>
                <p className="text-sm text-foreground bg-muted/30 p-2 rounded-md border border-border whitespace-pre-wrap">
                  {selectedRequestDetails.admin_note || 'No administrative notes yet.'}
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="mt-4">
            <Button onClick={() => setSelectedRequestDetails(null)} className="w-full">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
