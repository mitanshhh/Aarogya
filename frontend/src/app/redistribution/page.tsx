"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, MapPin, Truck, AlertTriangle } from "lucide-react";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function RedistributionDashboard() {
  const { user } = useAuth();
  const [transfers, setTransfers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTransfers = async () => {
      try {
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
      } catch (err) {
        console.error("Failed to fetch redistribution data", err);
      } finally {
        setLoading(false);
      }
    };
    fetchTransfers();
  }, [user]);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Calculating optimal routes...</div>;
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Truck className="w-6 h-6 text-indigo-500" />
          Cross-District Resource Redistribution
        </h2>
        <p className="text-sm text-muted-foreground mt-1">AI-recommended supply transfers to balance surpluses and prevent stockouts.</p>
      </div>

      {transfers.length === 0 ? (
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
            <Card key={idx} className={`border-l-4 shadow-sm hover:shadow-md transition-all ${t.is_cross_district ? 'border-l-purple-500' : 'border-l-indigo-500'}`}>
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
                      {t.item_name}
                      <Badge variant="outline" className="bg-muted text-foreground">
                        {t.quantity} units
                      </Badge>
                    </h3>
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
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
