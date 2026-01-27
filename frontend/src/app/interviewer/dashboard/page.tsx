'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { mockInterviewRounds, mockCandidate } from '@/lib/mock-data';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Calendar, Clock, User, LogOut, Video, FileText, ArrowRight } from 'lucide-react';
import type { InterviewRound } from '@/types';

export default function InterviewerDashboard() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [rounds, setRounds] = useState<InterviewRound[]>([]);

  useEffect(() => {
    if (!user || user.role !== 'employee') {
      router.push('/');
      return;
    }
    // Mock: Get rounds assigned to this interviewer
    setRounds(mockInterviewRounds);
  }, [user, router]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleStartInterview = (roundId: string) => {
    router.push(`/interviewer/interview/${roundId}`);
  };

  const handleViewVerdict = (roundId: string) => {
    router.push(`/interviewer/verdict/${roundId}`);
  };

  const getStatusBadge = (status: InterviewRound['status']) => {
    const variants: Record<InterviewRound['status'], 'info' | 'warning' | 'success' | 'danger'> = {
      scheduled: 'info',
      waiting: 'info',
      in_progress: 'warning',
      completed: 'success',
      cancelled: 'danger',
      no_show: 'danger',
    };
    const labels: Record<InterviewRound['status'], string> = {
      scheduled: 'Scheduled',
      waiting: 'Waiting',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
      no_show: 'No Show',
    };
    return <Badge variant={variants[status]}>{labels[status]}</Badge>;
  };

  const getRoundTypeBadge = (type: InterviewRound['roundType']) => {
    const colors: Record<InterviewRound['roundType'], string> = {
      screening: 'bg-purple-100 text-purple-700',
      hr: 'bg-pink-100 text-pink-700',
      managerial: 'bg-indigo-100 text-indigo-700',
      technical: 'bg-cyan-100 text-cyan-700',
      behavioral: 'bg-orange-100 text-orange-700',
      culture_fit: 'bg-teal-100 text-teal-700',
      final: 'bg-red-100 text-red-700',
      technical_ai: 'bg-blue-100 text-blue-700',
    };
    const labels: Record<InterviewRound['roundType'], string> = {
      screening: 'Screening',
      hr: 'HR Round',
      managerial: 'Managerial',
      technical: 'Technical',
      behavioral: 'Behavioral',
      culture_fit: 'Culture Fit',
      final: 'Final',
      technical_ai: 'Technical AI',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${colors[type]}`}>
        {labels[type]}
      </span>
    );
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const upcomingRounds = rounds.filter(r => r.status === 'scheduled' || r.status === 'in_progress');
  const completedRounds = rounds.filter(r => r.status === 'completed');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Interviewer Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome, {user?.name}</p>
          </div>
          <Button variant="ghost" onClick={handleLogout} leftIcon={<LogOut className="w-4 h-4" />}>
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Upcoming Interviews */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-primary-600" />
              Upcoming Interviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingRounds.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Video className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>No upcoming interviews scheduled.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingRounds.map((round) => (
                  <div
                    key={round.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-primary-200 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-gray-900">
                          {mockCandidate.name}
                        </h3>
                        {getRoundTypeBadge(round.roundType)}
                        {getStatusBadge(round.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(round.scheduledAt)}
                        </span>
                        {round.durationMinutes && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {round.durationMinutes} mins
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          {mockCandidate.resumeJson.experience[0]?.title || 'Candidate'}
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleStartInterview(round.id)}
                      leftIcon={<Video className="w-4 h-4" />}
                    >
                      {round.status === 'in_progress' ? 'Rejoin' : 'Start Interview'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Completed Interviews */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-success-600" />
              Completed Interviews
            </CardTitle>
          </CardHeader>
          <CardContent>
            {completedRounds.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>No completed interviews yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {completedRounds.map((round) => (
                  <div
                    key={round.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-medium text-gray-900">
                          {mockCandidate.name}
                        </h3>
                        {getRoundTypeBadge(round.roundType)}
                        <Badge variant="success">Completed</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {formatDate(round.scheduledAt)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => handleViewVerdict(round.id)}
                      rightIcon={<ArrowRight className="w-4 h-4" />}
                    >
                      View / Edit Verdict
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
