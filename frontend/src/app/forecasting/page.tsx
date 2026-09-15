"use client";
import { apiFetch } from '@/lib/api';
import { useState, useEffect } from 'react';
import { Activity, AlertTriangle, CheckCircle, Package, RefreshCw, Search, Calendar, Database } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAuth } from '@/contexts/AuthContext';
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export default function ForecastingPage() {
  const { selectedHospitalId } = useAuth();
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  const fetchForecast = async () => {
    if (!selectedHospitalId) return;
    try {
      setLoading(true);
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/demand-forecast/${selectedHospitalId}`);
      if (res.ok) {
        const data = await res.json();
        setForecasts(data.forecasts || []);
        setLastUpdated(new Date());
      } else {
        toast.error("Failed to load forecast data");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error loading predictions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchForecast();
  }, [selectedHospitalId]);

  const handleManualTrigger = async () => {
    if (!selectedHospitalId) return;
    try {
      setTriggering(true);
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/ml/demand-forecast/${selectedHospitalId}/trigger`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        setForecasts(data.forecasts || []);
        setLastUpdated(new Date());
        toast.success("Forecast generated and cached successfully");
      } else {
        toast.error("Failed to trigger ML pipeline");
      }
    } catch (err) {
      console.error(err);
      toast.error("Error generating forecasts");
    } finally {
      setTriggering(false);
    }
  };

  if (loading && forecasts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Activity className="w-12 h-12 text-primary animate-pulse mb-4" />
        <h2 className="text-xl font-semibold text-foreground/80">Loading ML Forecasts...</h2>
        <p className="text-muted-foreground mt-2">Fetching cached predictions from the database.</p>
      </div>
    );
  }

  if (!selectedHospitalId) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <h2 className="text-xl text-muted-foreground">Please select a Health Centre from the top dropdown.</h2>
      </div>
    );
  }

  const criticalItems = forecasts.filter(f => f.risk_level.includes('Critical'));
  const highRiskItems = forecasts.filter(f => f.risk_level === 'High');

  // Filter based on Search Term (Item Name or ID)
  const filteredForecasts = forecasts.filter(f => 
    f.item_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.inventory_id.toString().includes(searchTerm)
  );

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 gap-1.5">
              <Activity className="w-3.5 h-3.5" /> AI Powered Prediction
            </Badge>
            {lastUpdated && (
              <Badge variant="secondary" className="bg-muted text-muted-foreground gap-1.5 border-none">
                <Database className="w-3 h-3" /> Updated {lastUpdated.toLocaleTimeString()}
              </Badge>
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Demand Forecasting</h1>
          <p className="text-slate-500 mt-1">Predictive analysis of medicine consumption for the next 7 days.</p>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by name or ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-full"
            />
          </div>
          <Button 
            onClick={handleManualTrigger} 
            disabled={triggering}
            className="w-full sm:w-auto shadow-md hover:shadow-lg transition-all"
          >
            {triggering ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Calendar className="w-4 h-4 mr-2" />
            )}
            {triggering ? "Generating Forecasts..." : "Trigger Manual Forecast"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-red-50/50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-100 dark:bg-red-900/40 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-600/80 dark:text-red-400/80">Critical Stockouts Predicted</p>
                <h3 className="text-2xl font-bold text-red-700 dark:text-red-300">{criticalItems.length} Items</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-orange-50/50 dark:bg-orange-950/20 border-orange-100 dark:border-orange-900/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 dark:bg-orange-900/40 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-orange-600/80 dark:text-orange-400/80">High Risk of Depletion</p>
                <h3 className="text-2xl font-bold text-orange-700 dark:text-orange-300">{highRiskItems.length} Items</h3>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-green-50/50 dark:bg-green-950/20 border-green-100 dark:border-green-900/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 dark:bg-green-900/40 rounded-xl">
                <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-green-600/80 dark:text-green-400/80">Stable Inventory</p>
                <h3 className="text-2xl font-bold text-green-700 dark:text-green-300">{forecasts.length - criticalItems.length - highRiskItems.length} Items</h3>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid of Predictions */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredForecasts.map(item => (
          <Card key={item.inventory_id} className="flex flex-col h-full overflow-hidden border-slate-200/60 dark:border-slate-800/60 hover:shadow-lg transition-all bg-card/50 backdrop-blur-sm">
            <CardHeader className="bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-800 p-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                      <Package className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold line-clamp-1" title={item.item_name}>
                        {item.item_name}
                      </CardTitle>
                      <p className="text-xs text-slate-500 font-medium">ID: #{item.inventory_id} • {item.category}</p>
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="bg-background rounded-lg p-2 border border-border shadow-sm flex flex-col items-center justify-center">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-0.5">Current Stock</span>
                    <span className="text-lg font-bold">{item.current_stock}</span>
                  </div>
                  <div className={`rounded-lg p-2 border shadow-sm flex flex-col items-center justify-center
                    ${item.risk_level.includes('Critical') ? 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-900 text-red-700 dark:text-red-400' :
                      item.risk_level === 'High' ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900 text-orange-700 dark:text-orange-400' :
                      'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400'
                    }`}
                  >
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-80 mb-0.5">Expected Demand</span>
                    <span className="text-lg font-bold">{Math.ceil(item.total_predicted_demand)} units</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 min-h-[140px] relative">
              <div className="absolute inset-0 pt-4 pb-2 pr-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={item.timeline} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'narrow'})} 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      dy={5}
                    />
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--card))', fontSize: '12px', padding: '8px' }}
                      labelFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric'})}
                      formatter={(val: number) => [Math.ceil(val), "Units"]}
                    />
                    <Bar 
                      dataKey="predicted_demand" 
                      name="Predicted Demand"
                      radius={[4, 4, 0, 0]}
                    >
                      {item.timeline.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={
                          item.risk_level.includes('Critical') ? 'hsl(var(--destructive))' :
                          item.risk_level === 'High' ? '#f97316' :
                          '#10b981'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredForecasts.length === 0 && forecasts.length > 0 && (
        <div className="text-center p-12 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-200 dark:border-slate-800 mt-6">
          <Search className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No matching medicines found</h3>
          <p className="text-slate-500 mt-2">Try adjusting your search criteria.</p>
        </div>
      )}

      {forecasts.length === 0 && !loading && (
        <div className="text-center p-12 bg-slate-50 dark:bg-slate-900/20 rounded-xl border border-slate-200 dark:border-slate-800">
          <Activity className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-slate-700 dark:text-slate-300">No Forecast Data Available</h3>
          <p className="text-slate-500 mt-2">Click "Trigger Manual Forecast" to generate predictions for this health centre.</p>
        </div>
      )}
    </div>
  );
}
