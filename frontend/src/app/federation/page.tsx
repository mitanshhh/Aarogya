"use client";
import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Globe, Database, Network } from "lucide-react";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function FederationDashboard() {
  const { user } = useAuth();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/v1/federation/status`, {
          headers: { "X-Role": user?.role || "NATION_ADMIN" }
        });
        if (res.ok) {
          const data = await res.json();
          setStatus(data);
        }
      } catch (err) {
        console.error("Failed to fetch federation status", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStatus();
  }, [user]);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Loading Federation Status...</div>;
  }

  const agg = status?.aggregator || {};
  const models = status?.models || [];
  
  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <Globe className="w-6 h-6 text-indigo-500" />
          BRICS Federated Health Resilience Platform
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Cross-nation predictive modelling & real-time resource visibility.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Network className="w-4 h-4 text-primary" /> Active Nodes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {agg.total_nations_active || 0} / 5
            </div>
            <p className="text-xs text-muted-foreground mt-1">Nations contributing to global model</p>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-500" /> Categories Trained
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">
              {agg.categories?.length || 0}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Inventory categories utilizing FedAvg</p>
          </CardContent>
        </Card>
        
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-500" /> Aggregator Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mt-2">
              {agg.error ? (
                <Badge variant="destructive">Offline</Badge>
              ) : (
                <Badge className="bg-green-100 text-green-800 border-green-200">Online & Syncing</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader className="pb-4 bg-muted/10 border-b border-border">
          <CardTitle className="text-base font-medium">Local Node Activity Logs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>Local MAE</TableHead>
                <TableHead>Global MAE</TableHead>
                <TableHead>Improvement</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                    No federated models synced yet.
                  </TableCell>
                </TableRow>
              ) : (
                models.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.category}</TableCell>
                    <TableCell className="font-mono text-xs">{m.local_mae?.toFixed(4) || '-'}</TableCell>
                    <TableCell className="font-mono text-xs text-indigo-600">{m.global_mae?.toFixed(4) || '-'}</TableCell>
                    <TableCell>
                      {m.improvement > 0 ? (
                        <span className="text-green-600 text-xs font-semibold">+{m.improvement.toFixed(4)}</span>
                      ) : m.improvement < 0 ? (
                        <span className="text-red-600 text-xs font-semibold">{m.improvement.toFixed(4)}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(m.created_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
