"use client";
import { apiFetch } from '@/lib/api';
import { useEffect, useState } from 'react';
import { Download, Hospital, Building2, Stethoscope, BedDouble, AlertTriangle, AlertOctagon, Sparkles, MapPin, CheckCircle, X, Bot, Search, Calendar, Phone, Activity } from 'lucide-react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import dynamic from 'next/dynamic';
import { PatientProfileDrawer } from '@/components/patients/PatientProfileDrawer';



export default function DistrictAdminDashboard() {
  const [overview, setOverview] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [mapData, setMapData] = useState<any[]>([]);
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [customReply, setCustomReply] = useState("");
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [newPhc, setNewPhc] = useState({
    name: "", type: "PHC", phc_id: "", admin_email: "", admin_mobile: "", location: "", latitude: "", longitude: ""
  });
  
  // Patient Search State
  const [patientSearchQuery, setPatientSearchQuery] = useState("");
  const [patientSearchResults, setPatientSearchResults] = useState<any[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [selectedPatientSearch, setSelectedPatientSearch] = useState<any>(null);
  const [patientSearchPage, setPatientSearchPage] = useState(0);
  const [totalPatients, setTotalPatients] = useState(0);
  
  // History request state
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [selectedHistoryReq, setSelectedHistoryReq] = useState<any>(null);

  const fetchData = async () => {
    try {
      const [resOverview, resReq, resMap] = await Promise.all([
        apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/district/overview`),
        apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/district/requests`),
        apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/district/map-data`)
      ]);
      
      if(resOverview.ok) setOverview(await resOverview.json());
      if(resReq.ok) setRequests(await resReq.json());
      if(resMap.ok) setMapData(await resMap.json());
    } catch (e) {
      console.error(e);
      toast.error("Failed to load district data");
    }
  };

  useEffect(() => {
    fetchData();
    handleSearchPatients(0);
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async () => {
    if(!selectedReq) return;
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/district/resource-request/${selectedReq.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "APPROVED", admin_note: customReply })
      });
      if(res.ok) {
        toast.success("Request approved! AI letter sent to PHC.");
        setSelectedReq(null);
        setCustomReply("");
        fetchData();
      } else {
        toast.error("Approval failed.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Network error");
    }
  };

  const handleReject = async () => {
    if(!selectedReq) return;
    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/district/resource-request/${selectedReq.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "REJECTED", admin_note: customReply })
      });
      if(res.ok) {
        toast.success("Request rejected.");
        setSelectedReq(null);
        setCustomReply("");
        fetchData();
      } else {
        toast.error("Rejection failed.");
      }
    } catch (e) {
      console.error(e);
      toast.error("Network error");
    }
  };

  const handleRegisterPhc = async () => {
    if (!newPhc.phc_id || !newPhc.admin_email) {
      toast.error("PHC ID and Admin Email are required");
      return;
    }
    
    // Geocode location to get lat/lng if not manually provided
    let lat = parseFloat(newPhc.latitude) || 0.0;
    let lng = parseFloat(newPhc.longitude) || 0.0;
    if (newPhc.location && window.google && !lat && !lng) {
      try {
        const geocoder = new window.google.maps.Geocoder();
        const results = await geocoder.geocode({ address: newPhc.location });
        if (results.results && results.results.length > 0) {
          lat = results.results[0].geometry.location.lat();
          lng = results.results[0].geometry.location.lng();
        }
      } catch (e) {
        console.warn("Geocoding failed", e);
      }
    }

    try {
      const res = await apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/phc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newPhc,
          district: newPhc.location || "North District",
          state: "Maharashtra",
          health_score: 100,
          status: "Active",
          latitude: lat,
          longitude: lng
        })
      });
      if (res.ok) {
        const created = await res.json();
        if (created.email_sent) {
          toast.success("PHC registered and onboarding email sent.");
        } else {
          toast.warning(created.email_detail || "PHC registered, but onboarding email was not sent.", { duration: 15000 });
        }
        setIsRegisterOpen(false);
        setNewPhc({ name: "", type: "PHC", phc_id: "", admin_email: "", admin_mobile: "", location: "", latitude: "", longitude: "" });
        fetchData();
      } else {
        const err = await res.json();
        let errorMsg = "Registration failed";
        if (typeof err.detail === 'string') {
          errorMsg = err.detail;
        } else if (Array.isArray(err.detail)) {
          errorMsg = err.detail.map((e: any) => `${e.loc?.join('.')} ${e.msg}`).join(', ');
        }
        toast.error(errorMsg);
      }
    } catch (e) {
      toast.error("Network error");
    }
  };

  const handleSearchPatients = async (page = 0, query = patientSearchQuery) => {
    setIsSearchingPatients(true);
    try {
      const limit = 50;
      const offset = page * limit;
      let url = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/district/patients/search?limit=${limit}&offset=${offset}`;
      if (query.trim()) {
        url += `&q=${encodeURIComponent(query)}`;
      }
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setPatientSearchResults(data.data);
        setTotalPatients(data.total);
        setPatientSearchPage(page);
      } else {
        toast.error("Failed to search patients");
      }
    } catch (e) {
      console.error(e);
      toast.error("Network error");
    } finally {
      setIsSearchingPatients(false);
    }
  };

  const urgencyWeight: Record<string, number> = { "CRITICAL": 3, "HIGH": 2, "MEDIUM": 1, "LOW": 0 };
  const pendingRequests = requests.filter(r => r.status === "PENDING").sort((a, b) => (urgencyWeight[b.urgency] || 0) - (urgencyWeight[a.urgency] || 0));
  const historyRequests = requests.filter(r => r.status !== "PENDING").reverse();

  const getUrgencyClasses = (urgency: string) => {
    if (urgency === "CRITICAL") return "bg-red-50/50 border-red-200 hover:border-red-400 hover:bg-red-50 dark:bg-red-950/20 dark:border-red-900";
    if (urgency === "HIGH" || urgency === "MEDIUM") return "bg-orange-50/50 border-orange-200 hover:border-orange-400 hover:bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900";
    return "bg-muted/30 border-border hover:border-primary/50 hover:bg-muted/50";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-end mb-2">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Health Centre Overview</h2>
          <p className="text-sm text-muted-foreground mt-1">Live operational status and resource allocation.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" className="flex items-center gap-2 cursor-pointer" onClick={() => setIsRegisterOpen(true)}>
            <Building2 className="w-4 h-4" /> Register New PHC
          </Button>
          <Button className="flex items-center gap-2 cursor-pointer">
            <Download className="w-4 h-4" /> Export Report
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* KPI Grid */}
        <div className="col-span-12 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="border-border shadow-none hover:shadow-md transition-shadow"><CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary"><Hospital className="w-4 h-4" /></div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total PHCs</h3></div>
            <div className="text-2xl font-bold text-foreground">{overview?.total_phcs || 0}</div>
          </CardContent></Card>
          
          <Card className="border-border shadow-none hover:shadow-md transition-shadow"><CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center text-primary"><Building2 className="w-4 h-4" /></div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total CHCs</h3></div>
            <div className="text-2xl font-bold text-foreground">{overview?.total_chcs || 0}</div>
          </CardContent></Card>
          
          <Card className="border-border shadow-none hover:shadow-md transition-shadow"><CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded bg-green-100 flex items-center justify-center text-green-700"><Stethoscope className="w-4 h-4" /></div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Doctors</h3></div>
            <div className="text-2xl font-bold text-foreground">{overview?.doctor_presence_rate || 0}%</div>
          </CardContent></Card>
          
          <Card className="border-border shadow-none hover:shadow-md transition-shadow"><CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded bg-secondary flex items-center justify-center text-secondary-foreground"><BedDouble className="w-4 h-4" /></div><h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Beds</h3></div>
            <div className="text-2xl font-bold text-foreground">{overview?.bed_occupancy_rate || 0}%</div>
            <div className="w-full bg-secondary h-1 rounded-full mt-2 overflow-hidden"><div className="bg-primary h-full rounded-full" style={{ width: `${overview?.bed_occupancy_rate || 0}%` }}></div></div>
          </CardContent></Card>

          <Card className="border-border shadow-none hover:shadow-md transition-shadow"><CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded bg-yellow-100 flex items-center justify-center text-yellow-600"><AlertTriangle className="w-4 h-4" /></div><h3 className="text-xs font-semibold text-yellow-600 uppercase tracking-wider">Meds</h3></div>
            <div className="text-2xl font-bold text-yellow-600">{overview?.medicine_alerts || 0}</div>
          </CardContent></Card>

          <Card className="border-border shadow-none hover:shadow-md transition-shadow"><CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2"><div className="w-8 h-8 rounded bg-red-100 flex items-center justify-center text-red-600"><AlertOctagon className="w-4 h-4" /></div><h3 className="text-xs font-semibold text-red-600 uppercase tracking-wider">Critical</h3></div>
            <div className="text-2xl font-bold text-red-600">{overview?.critical_centres || 0}</div>
          </CardContent></Card>
        </div>

        {/* Unified Request and Patient Panel */}
        <div className="col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Column: Resource Requests */}
          <Card className="border-border shadow-sm flex flex-col h-[600px] hover:shadow-md transition-shadow">
            <CardContent className="p-6 flex flex-col h-full overflow-hidden">
              <div className="flex flex-col gap-2 mb-4">
                <div className="flex items-center gap-2 text-foreground">
                  <AlertTriangle className="w-5 h-5 text-muted-foreground" />
                  <h3 className="text-sm font-bold">Pending Resource Requests</h3>
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {pendingRequests.length} Pending
                  </span>
                </div>
                <Button variant="outline" size="sm" className="w-full flex items-center justify-center gap-2 mt-1" onClick={() => setIsHistoryOpen(true)}>
                  <CheckCircle className="w-4 h-4" /> View Request History
                </Button>
              </div>
              
              <div className="flex-1 overflow-y-auto pr-2 space-y-3 mt-2 border-t border-border pt-4">
                {pendingRequests.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground text-sm">No pending requests</div>
                ) : (
                  pendingRequests.map((req) => (
                    <div key={req.id} onClick={() => setSelectedReq(req)} className={`rounded-lg p-3 border cursor-pointer transition-colors ${getUrgencyClasses(req.urgency)}`}>
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-sm font-semibold text-foreground">
                          {req.urgency === 'CRITICAL' && <AlertOctagon className="inline w-3 h-3 text-red-600 mr-1" />}
                          Request: {req.resource_name}
                        </h4>
                        <span className="text-[10px] text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded border border-border">{new Date(req.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">From PHC ID: {req.requesting_phc_id}</p>
                      <p className="text-xs text-foreground/80 line-clamp-2">{req.message}</p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right Column: Global Patient Directory */}
          <Card className="border-border shadow-sm flex flex-col h-[600px] hover:shadow-md transition-shadow">
            <CardContent className="p-6 flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-2 mb-4 text-foreground">
                <Search className="w-5 h-5 text-muted-foreground" />
                <h3 className="text-sm font-bold">Global Patient Directory</h3>
              </div>
              <div className="flex gap-3 mb-4 shrink-0">
                <Input 
                  placeholder="Search by Patient Name or ID..." 
                  value={patientSearchQuery}
                  onChange={(e) => setPatientSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSearchPatients(0);
                  }}
                  className="flex-1 bg-muted/20"
                />
                <Button onClick={() => handleSearchPatients(0)} disabled={isSearchingPatients}>
                  {isSearchingPatients ? "Searching..." : "Search"}
                </Button>
              </div>
              
              <div className="flex-1 overflow-y-auto border border-border rounded-lg relative">
                {patientSearchResults.length === 0 && !isSearchingPatients ? (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">No patients found.</div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground bg-muted/50 uppercase sticky top-0 z-10 backdrop-blur-sm">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Patient ID</th>
                        <th className="px-4 py-3 font-semibold">Name</th>
                        <th className="px-4 py-3 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {patientSearchResults.map((p) => (
                        <tr key={p.id} onClick={() => setSelectedPatientSearch(p)} className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors">
                          <td className="px-4 py-3 font-medium text-primary">{p.patient_code || 'N/A'}</td>
                          <td className="px-4 py-3 text-foreground">{p.name}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${p.status === 'Admitted' ? 'bg-red-50 text-red-600 border border-red-200' : p.status === 'Discharged' ? 'bg-green-50 text-green-600 border border-green-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                              {p.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Pagination Controls */}
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-border shrink-0">
                <span className="text-sm text-muted-foreground">
                  Showing {totalPatients === 0 ? 0 : patientSearchPage * 50 + 1} to {Math.min((patientSearchPage + 1) * 50, totalPatients)} of {totalPatients}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={patientSearchPage === 0 || isSearchingPatients} onClick={() => handleSearchPatients(patientSearchPage - 1)}>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={(patientSearchPage + 1) * 50 >= totalPatients || isSearchingPatients} onClick={() => handleSearchPatients(patientSearchPage + 1)}>
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!selectedReq} onOpenChange={() => setSelectedReq(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Evaluate Resource Request</DialogTitle>
            <DialogDescription>
              Review the request for <strong>{selectedReq?.resource_name}</strong> from PHC ID <strong>{selectedReq?.requesting_phc_id}</strong>
              {selectedReq?.requested_by_user_id ? (
                <span> (User ID: <strong>{selectedReq.requested_by_user_id}</strong>)</span>
              ) : null}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="bg-muted/30 p-3 rounded-lg border border-border text-sm mb-4">
              <span className="font-semibold text-foreground block mb-1">PHC Notes:</span>
              <span className="text-muted-foreground">{selectedReq?.notes || "No additional notes provided."}</span>
            </div>
            
            <h4 className="font-semibold text-sm mb-1">Admin Reply (Optional):</h4>
            <Textarea 
              placeholder="Add a custom note to the AI-generated approval letter..." 
              value={customReply}
              onChange={(e) => setCustomReply(e.target.value)}
              className="resize-none h-20"
            />
            <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> An AI approval letter will be sent automatically.
            </p>
          </div>
          <DialogFooter className="gap-3 sm:gap-3 sm:justify-end">
            <Button variant="outline" onClick={() => setSelectedReq(null)} className="cursor-pointer">Cancel</Button>
            <Button onClick={handleReject} className="bg-red-100 text-red-600 hover:bg-red-600 hover:text-white cursor-pointer transition-colors border-none"><X className="w-4 h-4 mr-2" /> Reject</Button>
            <Button onClick={handleApprove} className="flex items-center gap-2 cursor-pointer hover:shadow-md transition-shadow"><CheckCircle className="w-4 h-4" /> Approve & Notify</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRegisterOpen} onOpenChange={setIsRegisterOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Register New PHC / CHC</DialogTitle>
            <DialogDescription>Add a new health centre and automatically invite its admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Centre Name</Label>
              <Input 
                placeholder="Enter centre name" 
                value={newPhc.name} 
                onChange={e => setNewPhc({...newPhc, name: e.target.value})} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <select 
                  className="w-full flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={newPhc.type}
                  onChange={e => setNewPhc({...newPhc, type: e.target.value})}
                >
                  <option value="PHC">PHC</option>
                  <option value="CHC">CHC</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Unique ID (PHC_ID)</Label>
                <Input 
                  placeholder="Enter unique ID" 
                  value={newPhc.phc_id} 
                  onChange={e => setNewPhc({...newPhc, phc_id: e.target.value})} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location / Address</Label>
              <Input 
                placeholder="Enter location" 
                value={newPhc.location} 
                onChange={e => setNewPhc({...newPhc, location: e.target.value})} 
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Latitude</Label>
                <Input 
                  type="number"
                  step="any"
                  placeholder="e.g. 19.0760" 
                  value={newPhc.latitude} 
                  onChange={e => setNewPhc({...newPhc, latitude: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <Label>Longitude</Label>
                <Input 
                  type="number"
                  step="any"
                  placeholder="e.g. 72.8777" 
                  value={newPhc.longitude} 
                  onChange={e => setNewPhc({...newPhc, longitude: e.target.value})} 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Admin Email ID</Label>
                <Input 
                  type="email"
                  value={newPhc.admin_email} 
                  onChange={e => setNewPhc({...newPhc, admin_email: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <Label>Admin Mobile (Optional)</Label>
                <Input 
                  value={newPhc.admin_mobile} 
                  onChange={e => setNewPhc({...newPhc, admin_mobile: e.target.value})} 
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRegisterOpen(false)}>Cancel</Button>
            <Button onClick={handleRegisterPhc} className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4" /> Register Centre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isHistoryOpen} onOpenChange={(open) => {
        setIsHistoryOpen(open);
        if (!open) setTimeout(() => setSelectedHistoryReq(null), 300); // clear after animation
      }}>
        <DialogContent className={`transition-all duration-300 ease-in-out ${selectedHistoryReq ? 'sm:max-w-[750px]' : 'sm:max-w-[400px]'}`}>
          <DialogHeader>
            <DialogTitle>Request History</DialogTitle>
            <DialogDescription>Recent approved and rejected resource requests.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-4 max-h-[500px] overflow-hidden mt-2">
            {/* Left side: List of history requests */}
            <div className={`flex flex-col gap-3 overflow-y-auto pr-2 transition-all duration-300 ${selectedHistoryReq ? 'w-1/2' : 'w-full'}`}>
              {historyRequests.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">No history available</div>
              ) : (
                historyRequests.map((req) => (
                  <div key={req.id} onClick={() => setSelectedHistoryReq(req)} className={`rounded-lg p-3 border transition-colors cursor-pointer hover:bg-muted/50 ${selectedHistoryReq?.id === req.id ? 'border-primary bg-primary/5' : 'bg-muted/30 border-border'}`}>
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="text-sm font-semibold text-foreground line-clamp-1">{req.resource_name}</h4>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ml-2 ${req.status === 'APPROVED' ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
                        {req.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">From PHC ID: {req.requesting_phc_id}</p>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(req.created_at).toLocaleDateString()}</p>
                  </div>
                ))
              )}
            </div>

            {/* Right side: Detailed View (Slide-in) */}
            <div className={`overflow-y-auto transition-all duration-300 ease-in-out ${selectedHistoryReq ? 'w-1/2 opacity-100 translate-x-0' : 'w-0 opacity-0 translate-x-8'}`}>
              {selectedHistoryReq ? (
                <div className="flex flex-col gap-4 border-l border-border pl-4 h-full min-w-[400px]">
                  <h4 className="font-bold text-lg border-b border-border pb-2">{selectedHistoryReq.resource_name} Details</h4>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <span className={`text-xs font-bold px-2 py-1 rounded border ${selectedHistoryReq.status === 'APPROVED' ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200'}`}>
                      {selectedHistoryReq.status}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Actioned On</span>
                    <span className="text-sm font-medium">{selectedHistoryReq.updated_at ? new Date(selectedHistoryReq.updated_at).toLocaleString('en-IN') : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">PHC ID</span>
                    <span className="text-sm font-medium">{selectedHistoryReq.requesting_phc_id}</span>
                  </div>
                  
                  <div className="bg-muted/30 p-3 rounded-lg border border-border text-sm mt-2">
                    <span className="font-semibold text-foreground block mb-1">Original Demand / Note:</span>
                    <span className="text-muted-foreground">{selectedHistoryReq.notes || "No notes provided by PHC."}</span>
                  </div>
                  
                  <div className="bg-primary/5 p-3 rounded-lg border border-primary/20 text-sm mt-2">
                    <span className="font-semibold text-foreground block mb-1">Admin Reply Sent:</span>
                    <span className="text-muted-foreground">{selectedHistoryReq.admin_note || "No specific reply was attached."}</span>
                  </div>
                </div>
              ) : (
                <div className="w-[400px]"></div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => { setIsHistoryOpen(false); setTimeout(() => setSelectedHistoryReq(null), 300); }}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PatientProfileDrawer
        patientCode={selectedPatientSearch?.patient_code || null}
        open={!!selectedPatientSearch}
        onOpenChange={(open) => {
          if (!open) setSelectedPatientSearch(null);
        }}
      />
    </div>
  );
}


