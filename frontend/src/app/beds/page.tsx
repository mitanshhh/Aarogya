"use client";
import { apiFetch } from '@/lib/api';

import { useState, useEffect } from "react";
import { useAuth } from '@/contexts/AuthContext';
import { BedTable } from "@/components/beds/BedTable";
import { AnalyticsCards } from "@/components/beds/AnalyticsCards";

import { toast } from "sonner";
import { RefreshCw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function BedManagement() {
  const { user, selectedHospitalId } = useAuth();
  const [beds, setBeds] = useState([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Add Bed Dialog States
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedEditBed, setSelectedEditBed] = useState<any>(null);
  
  // Bed Form State
  const [bedNumber, setBedNumber] = useState("");
  const [ward, setWard] = useState("");
  const [bedType, setBedType] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Check if role is allowed to manage beds
  const allowedRoles = ["MEDICAL_OFFICER", "PHC_STAFF", "RECEPTIONIST", "DATA_ENTRY", "DEVELOPER"];
  const canManage = user?.role && allowedRoles.includes(user.role);

  const fetchBeds = async () => {
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/beds?limit=100`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody?.detail;
        const msg = Array.isArray(detail) ? JSON.stringify(detail) : (detail || `HTTP ${res.status}`);
        console.error("Failed to fetch beds:", msg);
        if (res.status === 401) {
          toast.error("Session expired. Please log in again.");
        } else if (res.status === 403) {
          toast.error("You are not assigned to a health centre. Contact your admin.");
        } else {
          toast.error(`Could not load beds: ${msg}`);
        }
        return;
      }
      const data = await res.json();
      setBeds(data.data || []);
    } catch (error) {
      console.error("Could not fetch beds data.", error);
      toast.error("Could not connect to the server. Please refresh.");
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/beds/analytics`);
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const detail = errBody?.detail;
        console.error("Failed to fetch analytics:", Array.isArray(detail) ? JSON.stringify(detail) : detail || res.status);
        return;
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (error) {
      console.error(error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await Promise.all([fetchBeds(), fetchAnalytics()]);
    setLoading(false);
  };

  useEffect(() => {
    if (selectedHospitalId) {
      loadData();
    }
  }, [selectedHospitalId]);

  const handleAdmit = async (bedId: number, patientName: string, patientPhone: string, admissionReason: string, days: number, action: string, patientCode?: string) => {
    try {
      const expectedDischarge = new Date();
      expectedDischarge.setDate(expectedDischarge.getDate() + days);
      
      // Default to Doctor ID 1 for prototype
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/beds/${bedId}/admit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          patient_name: patientName,
          patient_code: patientCode || null,
          patient_phone: patientPhone || null,
          admission_reason: admissionReason || null,
          doctor_id: 1,
          expected_discharge: expectedDischarge.toISOString()
        })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || `Failed to ${action.toLowerCase()}`);
      }
      
      toast.success(`Patient ${action.toLowerCase()}ed successfully!`);
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleDischarge = async (bedId: number) => {
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/beds/${bedId}/discharge`, {
        method: 'POST'
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to discharge");
      }
      
      toast.success("Patient discharged. Bed marked for cleaning.");
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleStatusChange = async (bedId: number, status: string) => {
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/beds/${bedId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to update status");
      }
      
      toast.success(`Bed status updated to ${status}`);
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleCreateBed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bedNumber.trim() || !ward.trim() || !bedType.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/beds/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hospital_id: selectedHospitalId,
          bed_number: bedNumber,
          ward,
          bed_type: bedType
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create bed");
      }

      toast.success(`Bed ${bedNumber} created successfully!`);
      setIsAddDialogOpen(false);
      setBedNumber("");
      setWard("");
      setBedType("");
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditBed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEditBed || !bedNumber.trim() || !ward.trim() || !bedType.trim()) {
      toast.error("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/beds/${selectedEditBed.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bed_number: bedNumber,
          ward,
          bed_type: bedType
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to update bed");
      }

      toast.success(`Bed ${bedNumber} updated successfully!`);
      setIsEditDialogOpen(false);
      setSelectedEditBed(null);
      setBedNumber("");
      setWard("");
      setBedType("");
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditDialog = (bed: any) => {
    setSelectedEditBed(bed);
    setBedNumber(bed.bed_number);
    setWard(bed.ward);
    setBedType(bed.bed_type || "General");
    setIsEditDialogOpen(true);
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Bed Management</h2>
          <p className="text-sm text-muted-foreground mt-1">Monitor bed availability, occupancy and upcoming capacity demand.</p>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <Button size="sm" onClick={() => setIsAddDialogOpen(true)} className="gap-2 cursor-pointer">
              <Plus className="w-4 h-4" /> Add Bed
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-2 cursor-pointer">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Add Bed Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add New Bed</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateBed} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="bedNumber">Bed Number / Name</Label>
              <Input
                id="bedNumber"
                placeholder="e.g. Bed 15, Bed-A"
                value={bedNumber}
                onChange={(e) => setBedNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ward">Ward</Label>
              <Select value={ward} onValueChange={(v) => setWard(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General Ward">General Ward</SelectItem>
                  <SelectItem value="ICU">ICU</SelectItem>
                  <SelectItem value="Emergency">Emergency</SelectItem>
                  <SelectItem value="Maternity">Maternity</SelectItem>
                  <SelectItem value="Pediatric">Pediatric</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bedType">Bed Type</Label>
              <Select value={bedType} onValueChange={(v) => setBedType(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bed type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="ICU">ICU</SelectItem>
                  <SelectItem value="Oxygen Bed">Oxygen Bed</SelectItem>
                  <SelectItem value="Ventilator Bed">Ventilator Bed</SelectItem>
                  <SelectItem value="Pediatric">Pediatric</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Adding..." : "Add Bed"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>



      {!loading && analytics && (
        <AnalyticsCards kpis={analytics.kpis} forecast={analytics.forecast} />
      )}

      {loading ? (
        <div className="h-64 flex items-center justify-center border border-border/50 rounded-xl bg-white">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <BedTable 
          beds={beds} 
          onAdmit={handleAdmit} 
          onDischarge={handleDischarge} 
          onStatusChange={handleStatusChange}
          onEdit={canManage ? openEditDialog : undefined}
        />
      )}

      {/* Edit Bed Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Bed</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditBed} className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="editBedNumber">Bed Number / Name</Label>
              <Input
                id="editBedNumber"
                placeholder="e.g. Bed 15, Bed-A"
                value={bedNumber}
                onChange={(e) => setBedNumber(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editWard">Ward</Label>
              <Select value={ward} onValueChange={(v) => setWard(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ward" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General Ward">General Ward</SelectItem>
                  <SelectItem value="ICU">ICU</SelectItem>
                  <SelectItem value="Emergency">Emergency</SelectItem>
                  <SelectItem value="Maternity">Maternity</SelectItem>
                  <SelectItem value="Pediatric">Pediatric</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="editBedType">Bed Type</Label>
              <Select value={bedType} onValueChange={(v) => setBedType(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Select bed type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="General">General</SelectItem>
                  <SelectItem value="ICU">ICU</SelectItem>
                  <SelectItem value="Oxygen Bed">Oxygen Bed</SelectItem>
                  <SelectItem value="Ventilator Bed">Ventilator Bed</SelectItem>
                  <SelectItem value="Pediatric">Pediatric</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
