"use client";

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Users, Clock, UserX, UserMinus, Search, Filter, MapPin, QrCode, Calendar as CalendarIcon, Activity, RefreshCw } from 'lucide-react';
import QRGenerator from './QRGenerator';
import { toast } from 'sonner';

export default function MODashboard() {
  const { selectedHospitalId } = useAuth();
  const [stats, setStats] = useState<any>({});
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  
  // Pagination & Date
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;
  const [filterDate, setFilterDate] = useState(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset();
    const localDate = new Date(today.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      const role = localStorage.getItem("role") || "MEDICAL_OFFICER";
      const headers = { 'X-Role': role };
      
      const hospitalQuery = selectedHospitalId ? `hospital_id=${selectedHospitalId}` : '';
      const offset = (page - 1) * limit;
      
      const queryParams = new URLSearchParams();
      if (selectedHospitalId) queryParams.append('hospital_id', selectedHospitalId.toString());
      queryParams.append('status', filterStatus);
      queryParams.append('filter_date', filterDate);
      queryParams.append('limit', limit.toString());
      queryParams.append('offset', offset.toString());

      const [statsRes, recordsRes] = await Promise.all([
        apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/attendance/dashboard?${hospitalQuery}`, { headers }),
        apiFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/attendance/records?${queryParams.toString()}`, { headers })
      ]);
      
      if (statsRes.ok) setStats(await statsRes.json());
      if (recordsRes.ok) {
        const data = await recordsRes.json();
        setRecords(data.data);
        setTotalPages(Math.ceil(data.total / limit) || 1);
      }
    } catch (e) {
      toast.error("Failed to fetch attendance data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedHospitalId) {
      setLoading(false);
      return;
    }
    fetchData();
    
    // Live fetching every 15 seconds
    const interval = setInterval(() => {
      fetchData();
    }, 15000);
    
    return () => clearInterval(interval);
  }, [filterStatus, selectedHospitalId, page, filterDate]);

  const filteredRecords = records.filter(r => 
    r.doctor_name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => {
    // Sort so newest check-ins (latest timestamp) are at the top
    if (!a.timestamp && !b.timestamp) return 0;
    if (!a.timestamp) return 1;
    if (!b.timestamp) return -1;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Present': return 'bg-green-100 text-green-700 border-green-200';
      case 'Late': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'Absent': return 'bg-red-100 text-red-700 border-red-200';
      case 'On Leave': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (!selectedHospitalId) {
    return (
      <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Staff Attendance</h2>
            <p className="text-sm text-muted-foreground mt-1">Real-time monitoring of clinical staff presence and availability.</p>
          </div>
        </div>
        <Card className="border-border shadow-sm flex flex-col items-center justify-center p-12 text-center h-[50vh]">
          <Activity className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">Select a Health Centre</h3>
          <p className="text-muted-foreground max-w-md">
            Please select a specific Primary Health Centre (PHC) from the top dropdown to view and manage its attendance records.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">Staff Attendance</h2>
          <p className="text-sm text-muted-foreground mt-1">Real-time monitoring of clinical staff presence and availability.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={fetchData} className="flex items-center gap-2 cursor-pointer shadow-sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <QRGenerator key={selectedHospitalId} />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-green-600"><Users className="w-4 h-4" /><span className="text-xs font-semibold">Present</span></div>
            <div className="text-2xl font-bold">{stats.present_doctors || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-yellow-600"><Clock className="w-4 h-4" /><span className="text-xs font-semibold">Late</span></div>
            <div className="text-2xl font-bold">{stats.late || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-red-600"><UserX className="w-4 h-4" /><span className="text-xs font-semibold">Absent</span></div>
            <div className="text-2xl font-bold">{stats.absent_doctors || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-blue-600"><UserMinus className="w-4 h-4" /><span className="text-xs font-semibold">On Leave</span></div>
            <div className="text-2xl font-bold">{stats.on_leave || 0}</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-primary"><Activity className="w-4 h-4" /><span className="text-xs font-semibold">Attendance %</span></div>
            <div className="text-2xl font-bold">{stats.attendance_percentage || 0}%</div>
          </CardContent>
        </Card>
        <Card className="border-border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2 text-muted-foreground"><Clock className="w-4 h-4" /><span className="text-xs font-semibold">Avg Check-in</span></div>
            <div className="text-2xl font-bold">{stats.avg_check_in_time || "N/A"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-border shadow-sm overflow-hidden flex flex-col h-full">
        <div className="p-4 border-b border-border flex flex-wrap justify-between items-center bg-muted/20 gap-4">
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative mr-2">
              <CalendarIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="date"
                className="pl-9 h-9 w-40 bg-background text-sm"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setPage(1); // Reset to page 1 on date change
                }}
              />
            </div>
            {['All', 'Present', 'Late', 'Absent', 'On Leave'].map(status => (
              <Badge 
                key={status} 
                variant={filterStatus === status ? "default" : "outline"}
                className={`cursor-pointer ${filterStatus === status ? '' : 'hover:bg-muted/50'}`}
                onClick={() => { setFilterStatus(status); setPage(1); }}
              >
                {status}
              </Badge>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search staff..."
              className="pl-9 h-9 w-full bg-background"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Check-in</TableHead>
                <TableHead>GPS</TableHead>
                <TableHead>QR</TableHead>
                <TableHead>Calendar</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10">Loading...</TableCell></TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">No records found.</TableCell></TableRow>
              ) : (
                filteredRecords.map(record => (
                  <TableRow key={record.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <p className="font-medium">{record.doctor_name}</p>
                      <p className="text-xs text-muted-foreground">{record.specialization}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getStatusColor(record.status)}>{record.status}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {record.timestamp ? new Date(record.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute:'2-digit' }) : '--:--'}
                    </TableCell>
                    <TableCell>
                      {record.scanned_via === "GPS" ? (
                        <div className="flex items-center gap-1 text-xs text-green-600"><MapPin className="w-3 h-3"/> Verified</div>
                      ) : (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3"/> N/A</div>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.scanned_via === "MOBILE_APP" ? (
                        <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200">Success</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-red-50 text-red-600 border-red-200">Failed</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {record.calendar_status ? (
                        <span className="text-xs bg-muted px-2 py-1 rounded">{record.calendar_status}</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unlinked</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Sheet>
                        <SheetTrigger render={<Button variant="ghost" size="sm" className="h-8 text-primary cursor-pointer hover:bg-primary/10" />}>
                          View Details
                        </SheetTrigger>
                        <SheetContent className="w-full sm:max-w-md overflow-y-auto p-6 sm:p-8">
                          <SheetHeader>
                            <SheetTitle>{record.doctor_name}</SheetTitle>
                            <SheetDescription>{record.specialization} • Attendance Profile</SheetDescription>
                          </SheetHeader>
                          
                          <div className="mt-8 space-y-6 text-left">
                            {/* Quick Stats Grid */}
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-gradient-to-br from-muted/50 to-muted/20 p-4 rounded-xl border border-border shadow-sm flex flex-col justify-center items-start">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Today's Status</p>
                                <Badge variant="outline" className={`${getStatusColor(record.status)} px-3 py-1 text-sm font-semibold shadow-sm`}>
                                  {record.status}
                                </Badge>
                              </div>
                              <div className="bg-gradient-to-br from-muted/50 to-muted/20 p-4 rounded-xl border border-border shadow-sm flex flex-col justify-center items-start">
                                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Check-in Time (IST)</p>
                                <p className="font-mono text-xl font-bold text-foreground tracking-tight">
                                  {record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute:'2-digit' }) : '--:--'}
                                </p>
                              </div>
                            </div>
                            
                            {/* Verification Block */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                <MapPin className="w-3.5 h-3.5 text-primary"/> Location Verification
                              </h4>
                              <div className="bg-card border border-border p-4 rounded-xl text-sm shadow-sm space-y-2">
                                <div className="flex justify-between items-center pb-2 border-b border-border/50">
                                  <span className="text-muted-foreground font-medium">Status</span>
                                  <span className={`font-semibold px-2 py-0.5 rounded-md text-xs ${record.scanned_via === "GPS" ? "bg-green-100 text-green-700" : record.scanned_via ? "bg-gray-100 text-gray-700" : "bg-red-100 text-red-700"}`}>
                                    {record.scanned_via === "GPS" ? "Verified" : record.scanned_via ? "N/A" : "Failed"}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center pt-1">
                                  <span className="text-muted-foreground font-medium">Distance from PHC</span>
                                  <span className="font-mono font-medium">Unknown</span>
                                </div>
                                {record.remarks && (
                                  <div className="mt-3 text-xs text-red-700 bg-red-50 p-2.5 rounded-md border border-red-100 font-medium">
                                    {record.remarks}
                                  </div>
                                )}
                              </div>
                              {/* Leaflet Map Placeholder for Map Preview */}
                              <div className="h-36 bg-muted/30 border border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground text-xs relative overflow-hidden group">
                                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                                <MapPin className="w-6 h-6 mb-2 opacity-50 group-hover:scale-110 transition-transform" />
                                <span>Interactive Map Preview</span>
                              </div>
                            </div>

                            {/* Calendar Block */}
                            <div className="space-y-3">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                <CalendarIcon className="w-3.5 h-3.5 text-primary"/> Calendar Integration
                              </h4>
                              <div className="bg-card border border-border p-4 rounded-xl text-sm shadow-sm flex items-center justify-between">
                                <span className="text-muted-foreground font-medium">Today's Schedule</span>
                                {record.calendar_status ? (
                                  <span className="font-semibold bg-secondary px-2.5 py-1 rounded-md">{record.calendar_status}</span>
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">Not linked</span>
                                )}
                              </div>
                            </div>
                          </div>
                        </SheetContent>
                      </Sheet>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination Controls */}
        <div className="p-4 border-t border-border flex justify-between items-center bg-muted/5">
          <div className="text-sm text-muted-foreground">
            Showing page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              Previous
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages || loading}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}



