'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { mockInterviewRounds } from '@/lib/mock-data';
import { Card, CardHeader, CardTitle, CardContent, Badge, Button } from '@/components/ui';
import { Calendar, Clock, User, LogOut, Video } from 'lucide-react';
import type { InterviewRound } from '@/types';

export default function CandidateDashboard() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [rounds, setRounds] = useState<InterviewRound[]>([]);

  useEffect(() => {
    if (!user || user.role !== 'candidate') {
      router.push('/');
      return;
    }
    // Mock: Get rounds for this candidate
    setRounds(mockInterviewRounds);
  }, [user, router]);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const handleJoinInterview = (roundId: string) => {
    router.push(`/candidate/interview/${roundId}`);
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
    return <Badge variant="default">{labels[type]}</Badge>;
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

  const canJoin = (round: InterviewRound) => {
    return round.status === 'scheduled' || round.status === 'in_progress';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Interview Dashboard</h1>
            <p className="text-sm text-gray-600">Welcome back, {user?.name}</p>
          </div>
          <Button variant="ghost" onClick={handleLogout} leftIcon={<LogOut className="w-4 h-4" />}>
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Your Scheduled Interviews</CardTitle>
          </CardHeader>
          <CardContent>
            {rounds.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Video className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>No interviews scheduled yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rounds.map((round) => (
                  <div
                    key={round.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
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
                          <User className="w-4 h-4" />
                          Interviewer: {round.interviewerId}
                        </span>
                      </div>
                    </div>
                    <div>
                      {canJoin(round) ? (
                        <Button
                          onClick={() => handleJoinInterview(round.id)}
                          leftIcon={<Video className="w-4 h-4" />}
                        >
                          Join Interview
                        </Button>
                      ) : (
                        <Button disabled variant="secondary">
                          {round.status === 'completed' ? 'Completed' : 'Unavailable'}
                        </Button>
                      )}
                    </div>
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
