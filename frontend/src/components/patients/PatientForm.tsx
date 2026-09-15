"use client";
import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Search, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { toast } from "sonner";

export function PatientForm({ onSubmit, onClose, doctors = [] }: any) {
  const [formData, setFormData] = useState({
    patient_code: "",
    full_name: "",
    age: "",
    gender: "",
    phone: "",
    village: "",
    visit_type: "",
    department: "",
    symptoms: "",
    priority: "Normal",
    doctor_id: "none",
    blood_group: "",
    weight: "",
    height: "",
    pregnancy_status: "none",
    remarks: ""
  });
  const [isChecking, setIsChecking] = useState(false);
  const [checkStatus, setCheckStatus] = useState<'idle' | 'found' | 'available' | 'error'>('idle');

  const handleCheckPatient = async () => {
    if (!formData.patient_code.trim()) {
      toast.error("Please enter a Patient ID first");
      return;
    }

    setIsChecking(true);
    setCheckStatus('idle');

    try {
      const res = await apiFetch(`/api/v1/patients/code/${formData.patient_code.trim()}`);

      if (!res.ok) {
        if (res.status === 404) {
          setCheckStatus('available'); // Mark green so they know it's available
          toast.success('ID is available for new registration.');
          return;
        }
        throw new Error('Failed to fetch patient');
      }

      const data = await res.json();
      setCheckStatus('found');
      toast.success('Patient found! Details autofilled.');
      setFormData(prev => ({
        ...prev,
        full_name: data.name || "",
        age: data.age?.toString() || "",
        gender: data.gender || "",
        phone: data.contact || "",
        village: data.address || "",
        blood_group: data.blood_group || prev.blood_group
      }));
    } catch (err) {
      console.error(err);
      setCheckStatus('error');
      toast.error('Network error or invalid ID.');
    } finally {
      setIsChecking(false);
    }
  };

  const handleChange = (e: any) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelect = (name: string, value: string | null) => {
    setFormData(prev => ({ ...prev, [name]: value ?? "" }));
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();
    
    // Process form data before submission
    const payload = {
      name: formData.full_name,
      patient_code: formData.patient_code.trim() || null,
      age: parseInt(formData.age),
      gender: formData.gender,
      contact: formData.phone || null,
      address: formData.village || null,
      medical_history: [
        formData.symptoms ? `Symptoms: ${formData.symptoms}` : null,
        formData.visit_type ? `Visit Type: ${formData.visit_type}` : null,
        formData.department ? `Department: ${formData.department}` : null,
        formData.remarks ? `Remarks: ${formData.remarks}` : null
      ].filter(Boolean).join(" | "),
      weight: formData.weight ? parseFloat(formData.weight) : null,
      height: formData.height ? parseFloat(formData.height) : null,
      doctor_id: formData.doctor_id !== "none" ? parseInt(formData.doctor_id) : null,
      pregnancy_status: formData.pregnancy_status !== "none" ? formData.pregnancy_status : null
    };
    
    onSubmit(payload);
  };

  return (
    <div className="flex flex-col h-full bg-background rounded-xl border border-border overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <h2 className="text-xl font-bold text-foreground">
          New Patient Registration
        </h2>
        <p className="text-sm text-muted-foreground mt-1">Register a new patient visit and assign unique Patient ID.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <form id="patient-registration" onSubmit={handleSubmit} className="space-y-6">
          
          {/* Required Details Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              Primary Details
            </h3>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2 col-span-2">
                <label className="text-sm font-medium flex items-center justify-between">
                  <span>Patient ID / ABHA ID <span className="text-xs text-muted-foreground font-normal">(Optional — enter to autofill details)</span></span>
                </label>
                <div className="flex gap-2 items-center">
                  <div className="relative flex-1">
                    <Input
                      name="patient_code"
                      placeholder="e.g. ABHA-1234-5678 or PT-0001"
                      value={formData.patient_code}
                      onChange={(e) => {
                        handleChange(e);
                        setCheckStatus('idle');
                      }}
                      disabled={isChecking}
                      className={`pr-10 ${
                        (checkStatus === 'found' || checkStatus === 'available')
                          ? 'border-green-500 focus-visible:ring-green-500'
                          : checkStatus === 'error'
                          ? 'border-red-500 focus-visible:ring-red-500'
                          : ''
                      }`}
                    />
                    {(checkStatus === 'found' || checkStatus === 'available') && (
                      <CheckCircle2 className="absolute right-3 top-2.5 h-5 w-5 text-green-500" />
                    )}
                    {checkStatus === 'error' && (
                      <AlertCircle className="absolute right-3 top-2.5 h-5 w-5 text-red-500" />
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCheckPatient}
                    disabled={isChecking || !formData.patient_code.trim()}
                    className="shrink-0 cursor-pointer"
                  >
                    {isChecking ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
                    Check
                  </Button>
                </div>
                {checkStatus === 'found' && (
                  <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> Patient found — fields autofilled below.
                  </p>
                )}
                {checkStatus === 'available' && (
                  <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                    <CheckCircle2 className="w-3 h-3" /> ID is available for new registration.
                  </p>
                )}
              </div>

              <div className="space-y-2 col-span-2">
                <label className="text-sm font-medium">Full Name <span className="text-red-500">*</span></label>
                <Input required name="full_name" value={formData.full_name} onChange={handleChange} />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Age <span className="text-red-500">*</span></label>
                <Input required type="number" min="0" max="150" name="age" value={formData.age} onChange={handleChange} />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Gender <span className="text-red-500">*</span></label>
                <Select required value={formData.gender} onValueChange={(val) => handleSelect("gender", val)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Mobile Number</label>
                <Input type="tel" name="phone" value={formData.phone} onChange={handleChange} />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Village/Locality</label>
                <Input name="village" value={formData.village} onChange={handleChange} />
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-border"></div>

          {/* Visit Details Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Visit Details
            </h3>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Visit Type <span className="text-red-500">*</span></label>
                <Select required value={formData.visit_type} onValueChange={(val) => handleSelect("visit_type", val)}>
                  <SelectTrigger><SelectValue placeholder="Select Visit Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OPD">OPD</SelectItem>
                    <SelectItem value="Emergency">Emergency</SelectItem>
                    <SelectItem value="Follow-up">Follow-up</SelectItem>
                    <SelectItem value="Vaccination">Vaccination</SelectItem>
                    <SelectItem value="Maternal Care">Maternal Care</SelectItem>
                    <SelectItem value="Child Care">Child Care</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Department <span className="text-red-500">*</span></label>
                <Select required value={formData.department} onValueChange={(val) => handleSelect("department", val)}>
                  <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="General Medicine">General Medicine</SelectItem>
                    <SelectItem value="Pediatrics">Pediatrics</SelectItem>
                    <SelectItem value="Gynecology">Gynecology</SelectItem>
                    <SelectItem value="Emergency">Emergency</SelectItem>
                    <SelectItem value="Dental">Dental</SelectItem>
                    <SelectItem value="Orthopedics">Orthopedics</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Priority <span className="text-red-500">*</span></label>
                <Select required value={formData.priority} onValueChange={(val) => handleSelect("priority", val)}>
                  <SelectTrigger><SelectValue placeholder="Select Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Assign Doctor</label>
                <Select value={formData.doctor_id} onValueChange={(val) => handleSelect("doctor_id", val)}>
                  <SelectTrigger><SelectValue placeholder="Select Doctor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Auto-assign</SelectItem>
                    {doctors.map((doc: any) => (
                      <SelectItem key={doc.id} value={doc.id.toString()}>Dr. {doc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2 col-span-2">
                <label className="text-sm font-medium">Symptoms / Chief Complaint</label>
                <Textarea name="symptoms" value={formData.symptoms} onChange={handleChange} className="resize-none" rows={3} />
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-border"></div>

          {/* Optional Clinical Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
              Optional Clinical Data
            </h3>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Blood Group</label>
                <Select value={formData.blood_group} onValueChange={(val) => handleSelect("blood_group", val)}>
                  <SelectTrigger><SelectValue placeholder="Select Blood Group" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A+">A+</SelectItem>
                    <SelectItem value="A-">A-</SelectItem>
                    <SelectItem value="B+">B+</SelectItem>
                    <SelectItem value="B-">B-</SelectItem>
                    <SelectItem value="AB+">AB+</SelectItem>
                    <SelectItem value="AB-">AB-</SelectItem>
                    <SelectItem value="O+">O+</SelectItem>
                    <SelectItem value="O-">O-</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.gender === "Female" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Pregnancy Status</label>
                  <Select value={formData.pregnancy_status} onValueChange={(val) => handleSelect("pregnancy_status", val)}>
                    <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not Pregnant</SelectItem>
                      <SelectItem value="Pregnant">Pregnant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Weight (kg)</label>
                <Input type="number" step="0.1" name="weight" value={formData.weight} onChange={handleChange} />
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">Height (cm)</label>
                <Input type="number" step="0.1" name="height" value={formData.height} onChange={handleChange} />
              </div>

              <div className="space-y-2 col-span-2">
                <label className="text-sm font-medium">Remarks</label>
                <Input name="remarks" value={formData.remarks} onChange={handleChange} />
              </div>
            </div>
          </div>
          
        </form>
      </div>

      <div className="p-4 border-t border-border flex justify-start gap-3 bg-muted/10">
        <Button type="submit" form="patient-registration" className="bg-primary hover:bg-primary/90 hover:scale-105 transition-all shadow-md">
          Register Patient
        </Button>
        <Button variant="outline" type="button" onClick={onClose} className="hover:scale-105 transition-all shadow-sm">Cancel</Button>
      </div>
    </div>
  );
}

