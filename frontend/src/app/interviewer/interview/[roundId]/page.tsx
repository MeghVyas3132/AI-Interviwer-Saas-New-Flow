'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore, useAIMetricsStore, useSocketStore } from '@/store';
import { mockCandidate, mockAIMetrics, mockTranscript, getSimulatedMetrics } from '@/lib/mock-data';
import { Button, Badge, Card, ProgressBar, Modal } from '@/components/ui';
import { useInsights, useStreamPublisher, useSocket } from '@/hooks';
import { 
  connectSocket, 
  joinInterviewRoom, 
  leaveInterviewRoom,
  onInsightAggregated,
  onInsightAlert,
  onTranscriptUpdate,
  onMetricsSummary,
} from '@/services/socket';
import { roundsApi } from '@/services/api';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Phone, 
  Activity,
  AlertTriangle,
  FileText,
  User,
  Clock,
  TrendingUp,
  Eye,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Shield,
  Zap,
  Volume2,
  Monitor,
  MonitorOff,
  Wifi,
  WifiOff
} from 'lucide-react';
import type { AIMetrics, TranscriptSegment, FraudAlert, LiveInsight, Recommendation } from '@/types';

export default function InterviewerInterviewPage() {
  const router = useRouter();
  const params = useParams();
  const roundId = params.roundId as string;
  
  const { user, token } = useAuthStore();
  const { metrics, updateMetrics, addTranscriptSegment, addFraudAlert, setInsights, setRecommendations } = useAIMetricsStore();
  const { isConnected: socketConnected, setConnected } = useSocketStore();

  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    analysis: true,
    fraud: true,
    transcript: true,
  });
  const [localMetrics, setLocalMetrics] = useState<AIMetrics>(mockAIMetrics);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>(mockTranscript);
  const [fraudAlerts, setFraudAlerts] = useState<FraudAlert[]>([]);
  const [liveInsights, setLiveInsights] = useState<LiveInsight[]>([]);
  const [recommendations, setLocalRecommendations] = useState<Recommendation[]>([]);
  const [callDuration, setCallDuration] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isPublishing, setIsPublishing] = useState(false);
  const [useMockData, setUseMockData] = useState(true); // Toggle for mock vs real data
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef(0);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Connect to WebSocket when component mounts
  useEffect(() => {
    if (!user || user.role !== 'employee') {
      router.push('/');
      return;
    }

    // Try to connect to WebSocket if token exists
    const authToken = token || localStorage.getItem('authToken');
    if (authToken && !useMockData) {
      try {
        connectSocket({
          token: authToken,
          onConnect: () => {
            setConnected(true);
            joinInterviewRoom(roundId);
          },
          onDisconnect: () => {
            setConnected(false);
          },
          onError: (error) => {
            console.error('Socket error:', error);
            setUseMockData(true); // Fall back to mock data
          },
        });
      } catch (error) {
        console.error('Failed to connect socket:', error);
        setUseMockData(true);
      }
    }

    return () => {
      leaveInterviewRoom(roundId);
    };
  }, [user, router, roundId, token, useMockData, setConnected]);

  // Listen for real-time insights from WebSocket
  useEffect(() => {
    if (useMockData || !socketConnected) return;

    const unsubInsights = onInsightAggregated((data) => {
      // Transform insights to ensure timestampMs is always present
      const transformedInsights: LiveInsight[] = data.insights.map(i => ({
        ...i,
        timestampMs: i.timestampMs ?? Date.now(),
        metrics: i.metrics ?? {},
      }));
      setLiveInsights(prev => [...transformedInsights, ...prev].slice(0, 50));
      setInsights(transformedInsights);
      
      if (data.recommendations) {
        setLocalRecommendations(data.recommendations);
        setRecommendations(data.recommendations);
      }

      // Convert insights to fraud alerts
      data.insights
        .filter(i => i.category === 'fraud' && i.isAlert)
        .forEach(insight => {
          const alert: FraudAlert = {
            id: insight.id,
            type: insight.insightType as any,
            message: insight.description,
            timestampMs: Date.now(),
            severity: insight.severity === 'high' ? 'alert' : 'warning',
          };
          setFraudAlerts(prev => [alert, ...prev].slice(0, 10));
        });
    });

    const unsubAlerts = onInsightAlert((alert) => {
      const transformedAlert: LiveInsight = {
        ...alert,
        timestampMs: alert.timestampMs ?? Date.now(),
        metrics: alert.metrics ?? {},
      };
      setLiveInsights(prev => [transformedAlert, ...prev].slice(0, 50));
      if (alert.category === 'fraud') {
        const fraudAlert: FraudAlert = {
          id: alert.id,
          type: alert.insightType as any,
          message: alert.description,
          timestampMs: Date.now(),
          severity: alert.severity === 'high' ? 'alert' : 'warning',
        };
        setFraudAlerts(prev => [fraudAlert, ...prev].slice(0, 10));
      }
    });

    const unsubTranscript = onTranscriptUpdate((data) => {
      if (data.isFinal) {
        const segment: TranscriptSegment = {
          id: `ts-${data.timestamp}`,
          speaker: data.speaker,
          text: data.text,
          startMs: data.timestamp,
          endMs: data.timestamp,
          confidence: data.confidence,
        };
        setTranscript(prev => [...prev, segment].slice(-100));
      }
    });

    const unsubMetrics = onMetricsSummary((data) => {
      setLocalMetrics({
        speechConfidence: data.speechConfidence,
        engagementScore: data.engagementScore ?? Math.floor(75 + Math.random() * 20),
        hesitationsCount: data.hesitationCount,
        avgResponseTime: data.avgResponseTime,
        headMovement: data.headMovementScore > 0.7 ? 'stable' : data.headMovementScore > 0.4 ? 'moderate' : 'unstable',
        videoQuality: data.videoQualityScore > 0.7 ? 'good' : data.videoQualityScore > 0.4 ? 'fair' : 'poor',
        authenticity: data.authenticityScore > 0.8 ? 'verified' : data.authenticityScore > 0.5 ? 'suspicious' : 'alert',
      });
    });

    return () => {
      unsubInsights();
      unsubAlerts();
      unsubTranscript();
      unsubMetrics();
    };
  }, [useMockData, socketConnected, setInsights, setRecommendations]);

  // Mock data simulation (when not connected to backend)
  useEffect(() => {
    if (!useMockData) return;
    if (!user || user.role !== 'employee') {
      router.push('/');
      return;
    }

    // Initialize stream
    initializeMedia();

    // Simulate real-time metrics updates
    const metricsInterval = setInterval(() => {
      const simulated = getSimulatedMetrics();
      setLocalMetrics(simulated);
      
      // Randomly add fraud alerts (for demo)
      if (Math.random() < 0.05 && fraudAlerts.length < 3) {
        const alerts: FraudAlert[] = [
          { id: `fa-${Date.now()}`, type: 'tab_switch', message: 'Tab switch detected', severity: 'warning', timestamp: new Date().toISOString() },
          { id: `fa-${Date.now()}`, type: 'face_mismatch', message: 'Face verification failed', severity: 'alert', timestamp: new Date().toISOString() },
          { id: `fa-${Date.now()}`, type: 'multiple_faces', message: 'Multiple faces detected', severity: 'alert', timestamp: new Date().toISOString() },
        ];
        const randomAlert = alerts[Math.floor(Math.random() * alerts.length)];
        setFraudAlerts(prev => [...prev, randomAlert]);
      }
    }, 2000);

    // Simulate transcript updates
    const transcriptInterval = setInterval(() => {
      if (Math.random() < 0.3) {
        const speakers = ['interviewer', 'candidate'] as const;
        const sampleTexts = {
          interviewer: [
            "Can you tell me about your experience with React?",
            "How do you handle state management in large applications?",
            "What's your approach to testing?",
            "Tell me about a challenging project you worked on.",
          ],
          candidate: [
            "I've been working with React for about 3 years now...",
            "For state management, I typically use Redux or Zustand...",
            "I believe in writing unit tests for critical business logic...",
            "One challenging project was when we had to migrate...",
          ],
        };
        const speaker = speakers[Math.floor(Math.random() * speakers.length)];
        const texts = sampleTexts[speaker];
        const text = texts[Math.floor(Math.random() * texts.length)];
        
        const newSegment: TranscriptSegment = {
          id: `ts-${Date.now()}`,
          speaker,
          text,
          timestamp: new Date().toISOString(),
          confidence: 0.85 + Math.random() * 0.15,
        };
        setTranscript(prev => [...prev, newSegment]);
      }
    }, 4000);

    // Call duration timer
    const durationInterval = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(metricsInterval);
      clearInterval(transcriptInterval);
      clearInterval(durationInterval);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    };
  }, [user, router, useMockData]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Setup audio analyzer for speaking detection
  const setupAudioAnalyzer = (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      detectSpeech();
    } catch (error) {
      console.error('Error setting up audio analyzer:', error);
    }
  };

  // Detect speech from audio levels with smoothing
  const detectSpeech = () => {
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const smoothingFactor = 0.3;
    
    const checkAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      
      smoothedLevelRef.current = smoothedLevelRef.current * (1 - smoothingFactor) + average * smoothingFactor;
      
      const speakingThreshold = 12;
      const isSpeakingNow = smoothedLevelRef.current > speakingThreshold && isAudioEnabled;
      
      setIsSpeaking(isSpeakingNow);
      setAudioLevel(Math.min(smoothedLevelRef.current / 50, 1));
      
      animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
    };
    
    checkAudioLevel();
  };

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: true, 
        audio: true 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Setup audio analyzer for speaking detection
      setupAudioAnalyzer(stream);
    } catch (error) {
      console.error('Media error:', error);
    }
  };

  const toggleVideo = () => {
    if (streamRef.current) {
      const videoTrack = streamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (streamRef.current) {
      const audioTrack = streamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
        screenStreamRef.current = null;
      }
      setIsScreenSharing(false);
    } else {
      // Start screen sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
        
        screenStreamRef.current = screenStream;
        setIsScreenSharing(true);
        
        // Handle when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          setIsScreenSharing(false);
          screenStreamRef.current = null;
        };
      } catch (error) {
        console.error('Screen share error:', error);
      }
    }
  };

  const endCall = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }
    router.push(`/interviewer/verdict/${roundId}`);
  };

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIndicator = (status: string) => {
    const colorMap: Record<string, string> = {
      good: 'bg-success-500',
      stable: 'bg-success-500',
      verified: 'bg-success-500',
      fair: 'bg-warning-500',
      moderate: 'bg-warning-500',
      suspicious: 'bg-warning-500',
      warning: 'bg-warning-500',
      poor: 'bg-danger-500',
      unstable: 'bg-danger-500',
      alert: 'bg-danger-500',
      critical: 'bg-danger-500',
    };
    return <span className={`w-2 h-2 rounded-full ${colorMap[status] || 'bg-gray-500'}`} />;
  };

  const getFraudSeverityColor = (severity: string) => {
    const colors: Record<string, string> = {
      low: 'bg-warning-100 border-warning-300 text-warning-800',
      medium: 'bg-orange-100 border-orange-300 text-orange-800',
      high: 'bg-danger-100 border-danger-300 text-danger-800',
      warning: 'bg-warning-100 border-warning-300 text-warning-800',
      alert: 'bg-danger-100 border-danger-300 text-danger-800',
    };
    return colors[severity] || colors['warning'];
  };

  return (
    <div className="h-screen bg-gray-900 flex overflow-hidden">
      {/* Hidden canvas for video frame capture */}
      <canvas ref={canvasRef} className="hidden" />
      {/* Main Video Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="recording-indicator w-3 h-3 rounded-full bg-danger-500" />
              <span className="text-white text-sm font-medium">Recording</span>
            </div>
            <div className="flex items-center gap-2 text-gray-400">
              <Clock className="w-4 h-4" />
              <span className="text-sm">{formatDuration(callDuration)}</span>
            </div>
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              {socketConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-success-500" />
                  <span className="text-success-500 text-sm">Live</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-warning-500" />
                  <span className="text-warning-500 text-sm">Mock Data</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Interviewing:</span>
            <span className="text-white font-medium">{mockCandidate.name}</span>
          </div>
        </div>

        {/* Video Grid */}
        <div className="flex-1 relative p-4">
          {/* Candidate Video (Large) */}
          <div className="w-full h-full bg-gray-800 rounded-xl flex items-center justify-center overflow-hidden">
            <div className="text-center text-gray-400">
              <User className="w-20 h-20 mx-auto mb-2 opacity-50" />
              <p className="text-lg">Candidate Video</p>
              <p className="text-sm opacity-75">{mockCandidate.name}</p>
            </div>
          </div>

          {/* Self Video (Small) */}
          <div 
            className="absolute bottom-8 right-8 w-48 aspect-video bg-gray-700 rounded-lg overflow-hidden shadow-lg transition-all duration-300 ease-out"
            style={{
              boxShadow: isSpeaking 
                ? `0 0 ${8 + audioLevel * 12}px ${2 + audioLevel * 4}px rgba(56, 189, 248, ${0.2 + audioLevel * 0.3}), 0 0 ${4 + audioLevel * 8}px rgba(56, 189, 248, ${0.15 + audioLevel * 0.2})` 
                : '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover ${!isVideoEnabled ? 'hidden' : ''}`}
            />
            {!isVideoEnabled && (
              <div className="w-full h-full flex items-center justify-center">
                <VideoOff className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div className="absolute bottom-2 left-2 text-xs text-white bg-black/50 px-2 py-1 rounded flex items-center gap-1">
              <span 
                className="w-2 h-2 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: isSpeaking ? `rgba(56, 189, 248, ${0.7 + audioLevel * 0.3})` : 'rgba(255, 255, 255, 0.3)',
                  transform: isSpeaking ? `scale(${1 + audioLevel * 0.3})` : 'scale(1)',
                }}
              />
              You
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-gray-800 p-4">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={toggleAudio}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isAudioEnabled 
                  ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                  : 'bg-danger-600 hover:bg-danger-700 text-white'
              }`}
              title={isAudioEnabled ? 'Mute' : 'Unmute'}
            >
              {isAudioEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
            
            <button
              onClick={toggleVideo}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isVideoEnabled 
                  ? 'bg-gray-700 hover:bg-gray-600 text-white' 
                  : 'bg-danger-600 hover:bg-danger-700 text-white'
              }`}
              title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
            
            <button
              onClick={toggleScreenShare}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                isScreenSharing 
                  ? 'bg-primary-600 hover:bg-primary-700 text-white' 
                  : 'bg-gray-700 hover:bg-gray-600 text-white'
              }`}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
            </button>
            
            <button
              onClick={endCall}
              className="w-12 h-12 rounded-full bg-danger-600 hover:bg-danger-700 text-white flex items-center justify-center transition-colors"
              title="End Interview"
            >
              <Phone className="w-5 h-5 rotate-[135deg]" />
            </button>
          </div>
        </div>
      </div>

      {/* AI Insights Panel */}
      <div className="w-96 bg-gray-800 border-l border-gray-700 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary-400" />
            AI Insights
          </h2>
          <p className="text-xs text-gray-400 mt-1">Real-time candidate analysis</p>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Candidate Analysis Section */}
          <div className="border-b border-gray-700">
            <button
              onClick={() => toggleSection('analysis')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-750 transition-colors"
            >
              <span className="text-white font-medium flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary-400" />
                Candidate Analysis
              </span>
              {expandedSections.analysis ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            
            {expandedSections.analysis && (
              <div className="px-4 pb-4 space-y-4">
                {/* Speech Confidence */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5" />
                      Speech Confidence
                    </span>
                    <span className="text-white font-medium">{localMetrics.speechConfidence}%</span>
                  </div>
                  <ProgressBar value={localMetrics.speechConfidence} size="sm" />
                </div>

                {/* Hesitation Count */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Hesitations Detected</span>
                  <span className={`font-medium ${localMetrics.hesitationsCount > 5 ? 'text-warning-400' : 'text-white'}`}>
                    {localMetrics.hesitationsCount}
                  </span>
                </div>

                {/* Average Response Time */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Avg Response Time
                  </span>
                  <span className="text-white font-medium">{localMetrics.avgResponseTime}s</span>
                </div>

                {/* Head Movement */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Head Movement
                  </span>
                  <div className="flex items-center gap-2">
                    {getStatusIndicator(localMetrics.headMovement)}
                    <span className="text-white text-sm capitalize">{localMetrics.headMovement}</span>
                  </div>
                </div>

                {/* Video Quality */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Video Quality</span>
                  <div className="flex items-center gap-2">
                    {getStatusIndicator(localMetrics.videoQuality)}
                    <span className="text-white text-sm capitalize">{localMetrics.videoQuality}</span>
                  </div>
                </div>

                {/* Authenticity */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5" />
                    Authenticity
                  </span>
                  <div className="flex items-center gap-2">
                    {getStatusIndicator(localMetrics.authenticity)}
                    <span className="text-white text-sm capitalize">{localMetrics.authenticity}</span>
                  </div>
                </div>

                {/* Engagement Score */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5" />
                      Engagement Score
                    </span>
                    <span className="text-white font-medium">{localMetrics.engagementScore}%</span>
                  </div>
                  <ProgressBar value={localMetrics.engagementScore} size="sm" />
                </div>
              </div>
            )}
          </div>

          {/* Fraud Alerts Section */}
          <div className="border-b border-gray-700">
            <button
              onClick={() => toggleSection('fraud')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-750 transition-colors"
            >
              <span className="text-white font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-danger-400" />
                Fraud Alerts
                {fraudAlerts.length > 0 && (
                  <Badge variant="danger" size="sm">{fraudAlerts.length}</Badge>
                )}
              </span>
              {expandedSections.fraud ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            
            {expandedSections.fraud && (
              <div className="px-4 pb-4">
                {fraudAlerts.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    <Shield className="w-8 h-8 mx-auto mb-2 text-success-500" />
                    No fraud alerts detected
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fraudAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={`p-3 rounded-lg border ${getFraudSeverityColor(alert.severity)}`}
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-sm font-medium">{alert.message}</p>
                            <p className="text-xs opacity-75">
                              {new Date(alert.timestamp || alert.timestampMs || Date.now()).toLocaleTimeString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Live Transcript Section */}
          <div className="border-b border-gray-700">
            <button
              onClick={() => toggleSection('transcript')}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-gray-750 transition-colors"
            >
              <span className="text-white font-medium flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-success-400" />
                Live Transcript
              </span>
              {expandedSections.transcript ? (
                <ChevronUp className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              )}
            </button>
            
            {expandedSections.transcript && (
              <div className="px-4 pb-4">
                <div className="bg-gray-900 rounded-lg p-3 max-h-48 overflow-y-auto custom-scrollbar">
                  {transcript.map((segment) => (
                    <div key={segment.id} className="mb-3 last:mb-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${
                          segment.speaker === 'interviewer' 
                            ? 'text-primary-400' 
                            : 'text-success-400'
                        }`}>
                          {segment.speaker === 'interviewer' ? 'You' : 'Candidate'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(segment.timestamp || segment.startMs || Date.now()).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm text-gray-300">{segment.text}</p>
                    </div>
                  ))}
                  <div ref={transcriptEndRef} />
                </div>
              </div>
            )}
          </div>

          {/* Resume Quick View */}
          <div className="p-4">
            <Button
              variant="outline"
              className="w-full"
              leftIcon={<FileText className="w-4 h-4" />}
              onClick={() => setShowResumeModal(true)}
            >
              View Candidate Resume
            </Button>
          </div>
        </div>
      </div>

      {/* Resume Modal */}
      <Modal
        isOpen={showResumeModal}
        onClose={() => setShowResumeModal(false)}
        title={`${mockCandidate.name}'s Resume`}
        size="xl"
      >
        <div className="space-y-6 max-h-[60vh] overflow-y-auto custom-scrollbar pr-2">
          {/* Contact */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Contact</h3>
            <p className="text-sm text-gray-600">{mockCandidate.email}</p>
            <p className="text-sm text-gray-600">{mockCandidate.resumeJson.contact?.phone || mockCandidate.resumeJson.phone}</p>
            <p className="text-sm text-gray-600">{mockCandidate.resumeJson.contact?.location || mockCandidate.resumeJson.location}</p>
          </div>

          {/* Summary */}
          {mockCandidate.resumeJson.summary && (
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Summary</h3>
              <p className="text-sm text-gray-600">{mockCandidate.resumeJson.summary}</p>
            </div>
          )}

          {/* Skills */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Skills</h3>
            <div className="flex flex-wrap gap-2">
              {mockCandidate.resumeJson.skills.map((skill, i) => (
                <Badge key={i} variant="info">{skill}</Badge>
              ))}
            </div>
          </div>

          {/* Experience */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Experience</h3>
            <div className="space-y-4">
              {mockCandidate.resumeJson.experience.map((exp, i) => (
                <div key={i} className="border-l-2 border-primary-500 pl-4">
                  <h4 className="font-medium text-gray-900">{exp.title}</h4>
                  <p className="text-sm text-gray-600">{exp.company}</p>
                  <p className="text-xs text-gray-500">{exp.duration}</p>
                  {exp.highlights && exp.highlights.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {exp.highlights.map((highlight, j) => (
                        <li key={j} className="text-sm text-gray-600">• {highlight}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Education */}
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Education</h3>
            <div className="space-y-2">
              {mockCandidate.resumeJson.education.map((edu, i) => (
                <div key={i}>
                  <h4 className="font-medium text-gray-900">{edu.degree}</h4>
                  <p className="text-sm text-gray-600">{edu.institution}</p>
                  <p className="text-xs text-gray-500">{edu.year}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
