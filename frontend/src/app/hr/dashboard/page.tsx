'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { mockCandidate, mockInterviewRounds, mockAIMetrics } from '@/lib/mock-data';
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, ProgressBar, Modal } from '@/components/ui';
import { 
  LogOut, 
  Users, 
  Briefcase, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Eye,
  Download,
  Filter,
  Search,
  TrendingUp,
  User,
  Calendar,
  FileText,
  BarChart3,
  ChevronRight
} from 'lucide-react';
import type { InterviewRound } from '@/types';

export default function HRDashboard() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedCandidate, setSelectedCandidate] = useState<typeof mockCandidate | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'hr') {
      router.push('/');
    }
  }, [user, router]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  // Mock data for multiple candidates
  const candidates = [
    { ...mockCandidate, id: 'c1', name: mockCandidate.fullName, status: 'completed' as const },
    { 
      ...mockCandidate, 
      id: 'c2', 
      name: 'Sarah Johnson',
      fullName: 'Sarah Johnson', 
      email: 'sarah.j@email.com',
      status: 'in_progress' as const 
    },
    { 
      ...mockCandidate, 
      id: 'c3', 
      name: 'Michael Chen',
      fullName: 'Michael Chen', 
      email: 'michael.c@email.com',
      status: 'scheduled' as const 
    },
    { 
      ...mockCandidate, 
      id: 'c4', 
      name: 'Emily Davis',
      fullName: 'Emily Davis', 
      email: 'emily.d@email.com',
      status: 'completed' as const 
    },
  ];

  const filteredCandidates = candidates.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          c.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: candidates.length,
    completed: candidates.filter(c => c.status === 'completed').length,
    inProgress: candidates.filter(c => c.status === 'in_progress').length,
    scheduled: candidates.filter(c => c.status === 'scheduled').length,
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: 'success' | 'warning' | 'info'; label: string }> = {
      completed: { variant: 'success', label: 'Completed' },
      in_progress: { variant: 'warning', label: 'In Progress' },
      scheduled: { variant: 'info', label: 'Scheduled' },
    };
    const { variant, label } = config[status] || { variant: 'info', label: status };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const viewCandidateReport = (candidate: typeof mockCandidate) => {
    setSelectedCandidate(candidate);
    setShowReportModal(true);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">HR Dashboard</h1>
            <p className="text-sm text-gray-600">Interview Reports & Analytics</p>
          </div>
          <Button variant="ghost" onClick={handleLogout} leftIcon={<LogOut className="w-4 h-4" />}>
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary-500 to-primary-600 text-white">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-primary-100 text-sm">Total Candidates</p>
                  <p className="text-3xl font-bold mt-1">{stats.total}</p>
                </div>
                <Users className="w-10 h-10 text-primary-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">Completed</p>
                  <p className="text-3xl font-bold text-success-600 mt-1">{stats.completed}</p>
                </div>
                <CheckCircle className="w-10 h-10 text-success-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">In Progress</p>
                  <p className="text-3xl font-bold text-warning-600 mt-1">{stats.inProgress}</p>
                </div>
                <Clock className="w-10 h-10 text-warning-200" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">Scheduled</p>
                  <p className="text-3xl font-bold text-primary-600 mt-1">{stats.scheduled}</p>
                </div>
                <Calendar className="w-10 h-10 text-primary-200" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Candidate List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <CardTitle className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary-600" />
                Candidate Interviews
              </CardTitle>
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search candidates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                {/* Filter */}
                <div className="relative">
                  <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 appearance-none bg-white"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="in_progress">In Progress</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredCandidates.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>No candidates found matching your criteria.</p>
                </div>
              ) : (
                filteredCandidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-primary-200 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-primary-600" />
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">{candidate.name}</h3>
                        <p className="text-sm text-gray-600">{candidate.email}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {candidate.resumeJson.skills.slice(0, 3).map((skill, i) => (
                            <Badge key={i} variant="default" size="sm">{skill}</Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {getStatusBadge(candidate.status)}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => viewCandidateReport(candidate)}
                        rightIcon={<ChevronRight className="w-4 h-4" />}
                        disabled={candidate.status !== 'completed'}
                      >
                        {candidate.status === 'completed' ? 'View Report' : 'Pending'}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Report Modal */}
      <Modal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        title={`Interview Report: ${selectedCandidate?.name}`}
        size="xl"
      >
        {selectedCandidate && (
          <div className="space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar pr-2">
            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-primary-600" />
                Overall Summary
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-success-600">Pass</p>
                  <p className="text-xs text-gray-500">Final Decision</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary-600">4.2</p>
                  <p className="text-xs text-gray-500">Avg Score</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-700">3</p>
                  <p className="text-xs text-gray-500">Rounds Completed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-700">0</p>
                  <p className="text-xs text-gray-500">Fraud Alerts</p>
                </div>
              </div>
            </div>

            {/* AI Metrics */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary-600" />
                AI Analysis (Aggregated)
              </h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Speech Confidence</span>
                    <span className="font-medium">{mockAIMetrics.speechConfidence}%</span>
                  </div>
                  <ProgressBar value={mockAIMetrics.speechConfidence} size="sm" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Engagement Score</span>
                    <span className="font-medium">{mockAIMetrics.engagementScore}%</span>
                  </div>
                  <ProgressBar value={mockAIMetrics.engagementScore} size="sm" />
                </div>
                <div className="grid grid-cols-3 gap-4 mt-4">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-lg font-semibold text-gray-700">{mockAIMetrics.hesitationsCount}</p>
                    <p className="text-xs text-gray-500">Total Hesitations</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-lg font-semibold text-gray-700">{mockAIMetrics.avgResponseTime}s</p>
                    <p className="text-xs text-gray-500">Avg Response Time</p>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <Badge variant="success" size="md">Verified</Badge>
                    <p className="text-xs text-gray-500 mt-1">Authenticity</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Interviewer Verdicts */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />
                Interviewer Verdicts
              </h3>
              <div className="space-y-4">
                {/* Round 1 */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Screening</Badge>
                      <span className="text-sm text-gray-500">John Interviewer</span>
                    </div>
                    <Badge variant="success">Pass</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">4/5</p>
                      <p className="text-xs text-gray-500">Technical</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">5/5</p>
                      <p className="text-xs text-gray-500">Communication</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">4/5</p>
                      <p className="text-xs text-gray-500">Culture Fit</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 italic">
                    "Strong candidate with excellent communication skills. Good technical foundation."
                  </p>
                </div>

                {/* Round 2 */}
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">HR Round</Badge>
                      <span className="text-sm text-gray-500">Sarah HR Manager</span>
                    </div>
                    <Badge variant="success">Pass</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 mb-3">
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">4/5</p>
                      <p className="text-xs text-gray-500">Technical</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">4/5</p>
                      <p className="text-xs text-gray-500">Communication</p>
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-gray-700">5/5</p>
                      <p className="text-xs text-gray-500">Culture Fit</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 italic">
                    "Great cultural fit. Aligned with company values and shows strong growth mindset."
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-gray-200">
              <Button variant="outline" leftIcon={<Download className="w-4 h-4" />}>
                Export PDF
              </Button>
              <Button variant="outline" leftIcon={<Eye className="w-4 h-4" />}>
                View Recording
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
