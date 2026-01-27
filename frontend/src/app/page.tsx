'use client';

import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store';
import { Users, Briefcase, User } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { login } = useAuthStore();

  const handleRoleSelect = (role: 'hr' | 'employee' | 'candidate') => {
    login(role);
    
    switch (role) {
      case 'hr':
        router.push('/hr/dashboard');
        break;
      case 'employee':
        router.push('/interviewer/dashboard');
        break;
      case 'candidate':
        router.push('/candidate/dashboard');
        break;
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            AI Interview Assistant
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Real-time AI-powered interview metrics for better hiring decisions.
            Select your role to continue.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Powered by <span className="font-semibold text-primary-600">Aigenthix</span>
          </p>
        </div>

        {/* Role Selection */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* HR */}
          <button
            onClick={() => handleRoleSelect('hr')}
            className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 text-left group"
          >
            <div className="w-14 h-14 bg-purple-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-200 transition-colors">
              <Users className="w-7 h-7 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">HR Manager</h2>
            <p className="text-gray-600 text-sm">
              View interview reports, candidate assessments, and AI-generated summaries.
            </p>
            <div className="mt-4 text-purple-600 font-medium text-sm group-hover:underline">
              Login as HR →
            </div>
          </button>

          {/* Interviewer */}
          <button
            onClick={() => handleRoleSelect('employee')}
            className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 text-left group"
          >
            <div className="w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 transition-colors">
              <Briefcase className="w-7 h-7 text-blue-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Interviewer</h2>
            <p className="text-gray-600 text-sm">
              Conduct interviews with real-time AI insights, transcript, and fraud detection.
            </p>
            <div className="mt-4 text-blue-600 font-medium text-sm group-hover:underline">
              Login as Interviewer →
            </div>
          </button>

          {/* Candidate */}
          <button
            onClick={() => handleRoleSelect('candidate')}
            className="bg-white rounded-xl p-8 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 text-left group"
          >
            <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
              <User className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Candidate</h2>
            <p className="text-gray-600 text-sm">
              Join scheduled interviews with a simple video call experience.
            </p>
            <div className="mt-4 text-green-600 font-medium text-sm group-hover:underline">
              Login as Candidate →
            </div>
          </button>
        </div>

        {/* Footer Note */}
        <div className="text-center mt-12 text-sm text-gray-500">
          <p>This is an alpha testing environment for internal use only.</p>
        </div>
      </div>
    </main>
  );
}
