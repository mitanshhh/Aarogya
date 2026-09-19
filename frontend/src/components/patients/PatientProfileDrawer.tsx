import React, { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { User, Clock, Phone, Calendar, Search, Edit2, Check, X, Pill, Bed, FileText, ChevronDown, ChevronUp, MoreVertical, Stethoscope, Download } from "lucide-react";
import { apiFetch } from '@/lib/api';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface PatientProfileDrawerProps {
  patientCode: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PatientProfileDrawer({ patientCode, open, onOpenChange }: PatientProfileDrawerProps) {
  const [patient, setPatient] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("All");
  
  // Expanded events state
  const [expandedEvents, setExpandedEvents] = useState<Record<number, boolean>>({});

  // Edit state
  const [editPhone, setEditPhone] = useState("");
  const [editGender, setEditGender] = useState("");
  const [editDob, setEditDob] = useState("");

  useEffect(() => {
    if (open && patientCode) {
      // Clear previous state to prevent flashing old data
      setPatient(null);
      setTimeline([]);
      fetchPatientDetails();
      fetchPatientTimeline();
      setIsEditing(false);
      setSearchQuery("");
      setActivityFilter("All");
      setExpandedEvents({});
    } else if (!open) {
      // Clear state after animation closes
      const timer = setTimeout(() => {
        setPatient(null);
        setTimeline([]);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [open, patientCode]);

  const fetchPatientDetails = async () => {
    setLoading(true);
    try {
      const hospitalId = localStorage.getItem('selectedHospitalId');
      const headers: any = { 'Content-Type': 'application/json' };
      if (hospitalId) headers['X-Hospital-ID'] = hospitalId;
      const hospitalQuery = hospitalId ? `?hospital_id=${hospitalId}` : '';

      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/patients/code/${patientCode}${hospitalQuery}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPatient(data);
        setEditPhone(data.contact || "");
        setEditGender(data.gender || "Other");
        setEditDob(data.dob || "");
      }
    } catch (e) {
      console.error("Failed to fetch patient", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientTimeline = async () => {
    try {
      const hospitalId = localStorage.getItem('selectedHospitalId');
      const headers: any = { 'Content-Type': 'application/json' };
      if (hospitalId) headers['X-Hospital-ID'] = hospitalId;
      const hospitalQuery = hospitalId ? `?hospital_id=${hospitalId}` : '';

      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/patients/code/${patientCode}/timeline${hospitalQuery}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTimeline(data.timeline || []);
      }
    } catch (e) {
      console.error("Failed to fetch timeline", e);
    }
  };

  const handleSave = async () => {
    try {
      const hospitalId = localStorage.getItem('selectedHospitalId');
      const headers: any = { 'Content-Type': 'application/json' };
      if (hospitalId) headers['X-Hospital-ID'] = hospitalId;
      
      const payload: any = {
        contact: editPhone,
        gender: editGender
      };
      if (editDob) payload.dob = editDob;

      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/patients/${patient.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        toast.success("Patient details updated");
        setIsEditing(false);
        fetchPatientDetails(); 
      } else {
        toast.error("Failed to update patient details");
      }
    } catch (e) {
      toast.error("An error occurred while saving");
      console.error(e);
    }
  };

  const generatePDF = () => {
    if (!patient) return;
    const doc = new jsPDF();
    
    doc.setFontSize(20);
    doc.text('Patient Medical History', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);
    
    // Patient Info
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text('Personal Information', 14, 45);
    
    autoTable(doc, {
      startY: 50,
      head: [['Attribute', 'Details']],
      body: [
        ['Name', patient.name],
        ['Patient ID', patient.patient_code],
        ['Age', `${patient.age} years`],
        ['Gender', patient.gender],
        ['Contact', patient.contact || 'N/A'],
        ['DOB', patient.dob ? new Date(patient.dob).toLocaleDateString('en-IN') : 'N/A'],
      ],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] }
    });

    // Medical History
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.text('Activity & Medical History', 14, finalY);

    const historyData = timeline.map(event => [
      new Date(event.timestamp).toLocaleString('en-IN'),
      event.title,
      event.type.toUpperCase(),
      event.description
    ]);

    autoTable(doc, {
      startY: finalY + 5,
      head: [['Date & Time', 'Event', 'Type', 'Description']],
      body: historyData.length > 0 ? historyData : [['No history found', '', '', '']],
      theme: 'striped',
      headStyles: { fillColor: [52, 73, 94] },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 40 },
        2: { cellWidth: 25 },
        3: { cellWidth: 'auto' }
      }
    });

    doc.save(`${patient.patient_code}_Medical_History.pdf`);
  };

  const toggleEventExpansion = (idx: number) => {
    setExpandedEvents(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const getFilteredTimeline = (filterOverride?: string) => {
    const query = searchQuery.toLowerCase();
    const activeFilter = filterOverride || activityFilter;
    
    return timeline.filter(event => {
      const dateStr = new Date(event.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }).toLowerCase();
      const matchTitle = event.title.toLowerCase().includes(query);
      const matchDesc = event.description.toLowerCase().includes(query);
      const matchDate = dateStr.includes(query);
      
      const matchesSearch = matchTitle || matchDesc || matchDate;
      
      let matchesType = true;
      if (activeFilter === "Medicines") {
        matchesType = event.type === "medicine";
      } else if (activeFilter === "Admissions") {
        matchesType = event.title.toLowerCase().includes("bed") || event.title.toLowerCase().includes("admit");
      } else if (activeFilter === "Visits") {
        matchesType = event.title.toLowerCase().includes("visit") || event.title.toLowerCase().includes("viewed") || event.title.toLowerCase().includes("update");
      }
      
      return matchesSearch && matchesType;
    });
  };

  // Group events by date (newest first, since timeline is newest first)
  const groupEventsByDate = (events: any[]) => {
    const groups: { date: string; titleDate: string; events: (any & { originalIndex: number })[] }[] = [];
    
    events.forEach((event, idx) => {
      const d = new Date(event.timestamp);
      const dateKey = d.toDateString();
      
      let titleDate = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      
      // Check if today or yesterday
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (dateKey === today.toDateString()) {
        titleDate = `TODAY — ${titleDate}`;
      } else if (dateKey === yesterday.toDateString()) {
        titleDate = `YESTERDAY — ${titleDate}`;
      }
      
      let group = groups.find(g => g.date === dateKey);
      if (!group) {
        group = { date: dateKey, titleDate, events: [] };
        groups.push(group);
      }
      group.events.push({ ...event, originalIndex: idx });
    });
    
    return groups;
  };

  const renderTimeline = (filterType?: string) => {
    const events = getFilteredTimeline(filterType);
    if (events.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground bg-muted/20 rounded-lg border border-border/50 border-dashed mt-4">
          <p className="text-sm">No activity found.</p>
        </div>
      );
    }

    const grouped = groupEventsByDate(events);

    return (
      <div className="space-y-8 mt-4">
        {grouped.map((group, groupIdx) => (
          <div key={groupIdx} className="relative">
            <h4 className="text-xs font-bold text-muted-foreground mb-4 sticky top-0 bg-background/95 backdrop-blur py-1 z-10 border-b border-border/40 inline-block pr-4">
              {group.titleDate}
            </h4>
            <div className="space-y-0 relative">
              {/* Subtle vertical line for the date group */}
              <div className="absolute left-[59px] top-2 bottom-2 w-px bg-border/60"></div>
              
              {group.events.map((event, idx) => {
                const eventDate = new Date(event.timestamp);
                const timeStr = eventDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                const isExpanded = expandedEvents[event.originalIndex];
                
                // Determine icon based on title/type
                let IconObj = FileText;
                let iconColor = "text-blue-500";
                const titleLower = event.title.toLowerCase();
                if (event.type === 'medicine') {
                  IconObj = Pill;
                  iconColor = "text-green-500";
                } else if (titleLower.includes('bed')) {
                  IconObj = Bed;
                  iconColor = "text-orange-500";
                } else if (titleLower.includes('visit') || titleLower.includes('view')) {
                  IconObj = Stethoscope;
                  iconColor = "text-purple-500";
                } else if (titleLower.includes('register')) {
                  IconObj = User;
                  iconColor = "text-primary";
                }

                return (
                  <div key={idx} className="relative flex items-start group/row py-3 hover:bg-muted/10 transition-colors -mx-2 px-2 rounded-lg cursor-pointer" onClick={() => toggleEventExpansion(event.originalIndex)}>
                    {/* Time */}
                    <div className="w-12 shrink-0 text-right pt-0.5">
                      <span className="text-xs text-muted-foreground font-medium">{timeStr}</span>
                    </div>

                    {/* Timeline Dot */}
                    <div className="w-6 shrink-0 flex justify-center pt-1.5 relative z-10 mx-2">
                      <div className={`w-2 h-2 rounded-full bg-background border-2 ${iconColor.replace('text-', 'border-')} ring-4 ring-background group-hover/row:scale-125 transition-transform`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-center gap-2">
                        <IconObj className={`w-4 h-4 ${iconColor} shrink-0`} />
                        <span className="text-sm font-semibold text-foreground truncate">{event.title}</span>
                      </div>
                      
                      {!isExpanded ? (
                        <p className="text-sm text-muted-foreground mt-1 truncate pl-6">
                          {event.description}
                        </p>
                      ) : (
                        <div className="mt-2 pl-6">
                          <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md border border-border/50 whitespace-pre-wrap break-words">
                            {event.description}
                            
                            <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <span className="text-muted-foreground/70 block mb-0.5">Patient ID</span>
                                <span className="font-medium text-foreground">{patient.patient_code}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground/70 block mb-0.5">Timestamp</span>
                                <span className="font-medium text-foreground">{eventDate.toLocaleString('en-IN')}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Expand indicator */}
                    <div className="shrink-0 pt-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (!patient) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[80%] lg:max-w-[60%] p-0 bg-background border-l shadow-2xl flex flex-col h-full !duration-300 overflow-y-auto overflow-x-hidden">
        
        {/* Sticky Header Section */}
        <div className="sticky top-0 z-20 bg-background border-b border-border shadow-sm shrink-0">
          <div className="p-4 md:p-6 pb-0">
            <div className="flex justify-between items-start">
              <div className="flex flex-col">
                <SheetTitle className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                  {patient.name}
                </SheetTitle>
                <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1.5 font-medium whitespace-nowrap">
                  <span className="text-foreground">{patient.patient_code}</span>
                  <span className="w-1 h-1 rounded-full bg-border shrink-0" />
                  <span>{patient.age} years</span>
                  <span className="w-1 h-1 rounded-full bg-border shrink-0" />
                  <span>{patient.gender}</span>
                </div>
                {!isEditing ? (
                  <div className="flex flex-col items-start gap-3 mt-4">
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {patient.contact || '—'}</span>
                      <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> DOB: {patient.dob ? new Date(patient.dob).toLocaleDateString('en-IN') : '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(true)} className="h-7 text-xs cursor-pointer">
                        <Edit2 className="w-3 h-3 mr-1.5" /> Edit Details
                      </Button>
                      <Button variant="secondary" size="sm" onClick={generatePDF} className="h-7 text-xs cursor-pointer bg-blue-50 text-blue-700 hover:bg-blue-100 border-blue-200">
                        <Download className="w-3 h-3 mr-1.5" /> Download PDF
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 mt-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5" /> 
                        <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} className="h-7 text-xs w-[120px] bg-background" placeholder="Mobile" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" /> 
                        <Input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} className="h-7 text-xs w-[130px] bg-background" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" />
                        <Select value={editGender} onValueChange={(val) => setEditGender(val || '')}>
                          <SelectTrigger className="h-7 text-xs w-[100px] bg-background">
                            <SelectValue placeholder="Gender" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Male">Male</SelectItem>
                            <SelectItem value="Female">Female</SelectItem>
                            <SelectItem value="Other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="w-full h-px bg-border/60 my-1" />
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} className="h-7 text-xs cursor-pointer px-3">
                        <X className="w-3 h-3 mr-1.5" /> Cancel
                      </Button>
                      <Button variant="default" size="sm" onClick={handleSave} className="h-7 text-xs cursor-pointer px-4">
                        <Check className="w-3 h-3 mr-1.5" /> Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <Tabs defaultValue="overview" className="w-full mt-4">
            <div className="px-4 md:px-6 border-b border-border">
              <TabsList className="bg-transparent h-auto p-0 gap-6 w-full justify-start overflow-x-auto no-scrollbar">
                {["Overview", "Activity", "Visits", "Medicines", "Admissions"].map((tab) => (
                  <TabsTrigger 
                    key={tab}
                    value={tab.toLowerCase()} 
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none data-[state=active]:bg-transparent px-1 py-3 font-semibold text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap cursor-pointer"
                  >
                    {tab}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* Content Area */}
            <div className="bg-muted/10 p-4 md:p-6 min-h-screen pb-12">
              
              {/* Overview Tab */}
              <TabsContent value="overview" className="m-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col gap-8">
                  {/* Status Section */}
                  <div>
                    <h3 className="text-sm font-bold text-foreground mb-4 uppercase tracking-wider">Current Status</h3>
                    <div className="bg-background rounded-xl border border-border/50 shadow-sm p-4 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Status</p>
                          <Badge variant={patient.status === 'Admitted' ? 'destructive' : 'secondary'} className="px-2 py-0.5 text-xs">
                            {patient.status}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Current Bed</p>
                          <p className="text-sm font-medium">{patient.bed ? patient.bed.bed_number : '—'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">Registered On</p>
                          <p className="text-sm font-medium">{new Date(patient.admitted_at).toLocaleDateString('en-IN')}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground mb-1">PHC/CHC</p>
                          <p className="text-sm font-medium truncate">{patient.hospital?.name || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Activity Timeline Tab */}
              <TabsContent value="activity" className="m-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-background rounded-xl border border-border/50 shadow-sm p-4 md:p-6">
                  {/* Search and Filters */}
                  <div className="flex flex-col gap-3 mb-6">
                    <div className="relative w-full">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search activity..." 
                        className="pl-9 h-9 bg-muted/30 w-full"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                      />
                    </div>
                    <Select value={activityFilter} onValueChange={(val) => setActivityFilter(val || '')}>
                      <SelectTrigger className="w-[160px] h-9 bg-muted/30">
                        <SelectValue placeholder="Activity Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="All">All Activity</SelectItem>
                        <SelectItem value="Visits">Visits</SelectItem>
                        <SelectItem value="Medicines">Medicines</SelectItem>
                        <SelectItem value="Beds">Beds</SelectItem>
                        <SelectItem value="Admissions">Admissions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {renderTimeline()}
                </div>
              </TabsContent>

              {/* Visits Tab */}
              <TabsContent value="visits" className="m-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-background rounded-xl border border-border/50 shadow-sm p-4 md:p-6">
                  <h3 className="font-semibold mb-4">Patient Visits</h3>
                  {renderTimeline("Visits")}
                </div>
              </TabsContent>

              {/* Medicines Tab */}
              <TabsContent value="medicines" className="m-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-background rounded-xl border border-border/50 shadow-sm p-4 md:p-6">
                  <h3 className="font-semibold mb-4">Medicines Dispensed</h3>
                  {renderTimeline("Medicines")}
                </div>
              </TabsContent>

              {/* Admissions Tab */}
              <TabsContent value="admissions" className="m-0 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="bg-background rounded-xl border border-border/50 shadow-sm p-4 md:p-6">
                  <h3 className="font-semibold mb-4">Bed Allocations & Admissions</h3>
                  {renderTimeline("Admissions")}
                </div>
              </TabsContent>

            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}
