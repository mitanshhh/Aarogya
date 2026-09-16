"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, MapPin, Truck, AlertTriangle, History, Check, X } from "lucide-react";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function RedistributionDashboard() {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"suggested" | "history">("suggested");
  const [processing, setProcessing] = useState<number | null>(null);

  useEffect(() => {
    fetchData();
  }, [user, view]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (view === "suggested") {
        const queryParams = new URLSearchParams();
        if (user?.role === "NATION_ADMIN") {
          const nationId = user.nation_id || 1;
          queryParams.append("nation_id", nationId.toString());
        } else if (user?.role === "DISTRICT_ADMIN" && user.hospital_id) {
          queryParams.append("hospital_id", user.hospital_id.toString());
        }

        const res = await apiFetch(`${API_BASE_URL}/api/v1/redistribution/?${queryParams.toString()}`, {
          headers: { "X-Role": user?.role || "DISTRICT_ADMIN" }
        });
        if (res.ok) {
          const data = await res.json();
          setTransfers(data.transfers || []);
        }
      } else {
        // Fetch history
        const res = await apiFetch(`${API_BASE_URL}/api/v1/district/requests`, {
          headers: { "X-Role": user?.role || "DISTRICT_ADMIN" }
        });
        if (res.ok) {
          const data = await res.json();
          setHistory(data.filter((r: any) => r.admin_note === "AI Recommended Redistribution"));
        }
      }
    } catch (err) {
      console.error("Failed to fetch data", err);
      toast.error("Failed to fetch redistribution data");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (idx: number, t: any) => {
    setProcessing(idx);
    try {
      const payload = {
        target_district: "System",
        resource_type: "Medicine",
        resource_name: t.item_name,
        quantity: t.quantity,
        urgency: "HIGH",
        notes: "Auto-generated redistribution order",
        donor_phc_id: t.from_hospital_id,
        requesting_phc_id: t.to_hospital_id
      };

      const res = await apiFetch(`${API_BASE_URL}/api/v1/district/resource-request/admin-create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Role": user?.role || "DISTRICT_ADMIN"
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        toast.success("Redistribution approved. Donor PHC notified.");
        setTransfers(prev => prev.filter((_, i) => i !== idx));
      } else {
        toast.error("Failed to approve redistribution");
      }
    } catch (err) {
      console.error(err);
      toast.error("An error occurred");
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = (idx: number) => {
    setTransfers(prev => prev.filter((_, i) => i !== idx));
    toast.info("Redistribution suggestion rejected.");
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
            <Truck className="w-6 h-6 text-indigo-500" />
            Cross-District Resource Redistribution
          </h2>
          <p className="text-sm text-muted-foreground mt-1">AI-recommended supply transfers to balance surpluses and prevent stockouts.</p>
        </div>
        <div className="flex bg-muted p-1 rounded-lg">
          <button 
            onClick={() => setView("suggested")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${view === "suggested" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Suggested Transfers
          </button>
          <button 
            onClick={() => setView("history")}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${view === "history" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <History className="w-4 h-4" /> History
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 text-center text-muted-foreground">Loading data...</div>
      ) : view === "suggested" ? (
        transfers.length === 0 ? (
          <Card className="border-border bg-green-50/50">
            <CardContent className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <MapPin className="w-6 h-6 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-green-800">All Nodes Balanced</h3>
              <p className="text-green-700 mt-2">No critical deficits detected. The regional supply chain is healthy.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {transfers.map((t, idx) => (
              <Card key={idx} className={`border-l-4 shadow-sm hover:shadow-md transition-all ${t.is_cross_district ? 'border-l-purple-500' : 'border-l-indigo-500'} flex flex-col`}>
                <CardContent className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
                        {t.item_name}
                        <Badge variant="outline" className="bg-muted text-foreground">
                          {t.quantity} units
                        </Badge>
                      </h3>
                      {t.total_cost > 0 && (
                        <p className="text-sm font-medium text-muted-foreground mt-1">Total Value: ₹{t.total_cost}</p>
                      )}
                    </div>
                    {t.is_cross_district ? (
                      <Badge className="bg-purple-100 text-purple-800 border-purple-200">Cross-District</Badge>
                    ) : (
                      <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200">Intra-District</Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-6 px-2">
                    <div className="flex-1 text-center">
                      <div className="text-sm font-medium text-foreground bg-green-50 border border-green-200 rounded-lg py-2 px-3 inline-block">
                        {t.from_hospital_name}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wide">Surplus Source</p>
                    </div>
                    
                    <div className="flex flex-col items-center px-4">
                      <div className="w-full flex items-center">
                        <div className="h-px bg-border flex-1 w-12 border-dashed"></div>
                        <ArrowRight className="text-muted-foreground w-5 h-5 mx-2" />
                        <div className="h-px bg-border flex-1 w-12 border-dashed"></div>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground mt-2 bg-muted/50 px-2 py-0.5 rounded">
                        {t.distance_km} km
                      </span>
                    </div>

                    <div className="flex-1 text-center">
                      <div className="text-sm font-medium text-foreground bg-red-50 border border-red-200 rounded-lg py-2 px-3 inline-block">
                        {t.to_hospital_name}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 uppercase tracking-wide">Deficit Target</p>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="bg-muted/30 p-4 flex justify-end gap-3 border-t">
                  <Button variant="outline" size="sm" onClick={() => handleReject(idx)} disabled={processing === idx}>
                    <X className="w-4 h-4 mr-1" /> Reject
                  </Button>
                  <Button size="sm" onClick={() => handleApprove(idx, t)} disabled={processing === idx}>
                    <Check className="w-4 h-4 mr-1" /> Approve
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {history.length === 0 ? (
             <div className="text-center text-muted-foreground py-12">No redistribution history found.</div>
          ) : (
            history.map((h, idx) => (
              <Card key={idx} className="overflow-hidden">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">{h.resource_name} <span className="text-muted-foreground font-normal">({h.quantity} units)</span></h4>
                    <p className="text-sm text-muted-foreground mt-1">Status: <Badge variant="outline">{h.status}</Badge></p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</p>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
