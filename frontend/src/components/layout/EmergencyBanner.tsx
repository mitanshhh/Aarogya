"use client";
import { useEffect, useState } from "react";
import { apiFetch, API_BASE_URL } from "@/lib/api";
import { AlertTriangle, Activity } from "lucide-react";

export function EmergencyBanner() {
  const [resilience, setResilience] = useState<any>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await apiFetch(`${API_BASE_URL}/api/v1/resilience/status`);
        if (res.ok) {
          const data = await res.json();
          setResilience(data);
        }
      } catch (err) {
        // Ignore
      }
    };
    
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (!resilience) return null;

  return (
    <>
      {resilience.is_emergency_mode && (
        <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 animate-pulse shadow-md z-50">
          <AlertTriangle className="w-5 h-5" />
          <span className="font-bold tracking-wide">NATIONAL HEALTH EMERGENCY PROTOCOL ACTIVE</span>
          <AlertTriangle className="w-5 h-5" />
        </div>
      )}
      
      {/* Small floating widget for Resilience Index (or we can just show it if emergency) */}
      {!resilience.is_emergency_mode && resilience.resilience_index < 50 && (
        <div className="bg-yellow-500 text-white px-4 py-1.5 flex items-center justify-center gap-2 shadow-sm z-50 text-sm">
          <Activity className="w-4 h-4" />
          <span className="font-medium">Warning: National Resilience Index is critically low ({resilience.resilience_index})</span>
        </div>
      )}
    </>
  );
}
