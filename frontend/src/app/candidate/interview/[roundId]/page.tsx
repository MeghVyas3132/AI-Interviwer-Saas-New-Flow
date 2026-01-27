'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore, useMediaPermissionsStore, useConsentStore, useInterviewStore } from '@/store';
import { Button, Modal, Card } from '@/components/ui';
import { roundsApi } from '@/services/api';
import { connectSocket, joinInterviewRoom, leaveInterviewRoom } from '@/services/socket';
import { 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Phone, 
  Camera,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  Monitor,
  MonitorOff,
  Wifi,
  WifiOff
} from 'lucide-react';

type InterviewStage = 'permission_check' | 'consent' | 'waiting' | 'in_call' | 'ended';

export default function CandidateInterviewPage() {
  const router = useRouter();
  const params = useParams();
  const roundId = params.roundId as string;
  
  const { user, token } = useAuthStore();
  const { 
    cameraPermission: camera, 
    microphonePermission: microphone, 
    setCameraPermission, 
    setMicrophonePermission,
  } = useMediaPermissionsStore();
  const { 
    hasConsented, 
    setConsent, 
  } = useConsentStore();
  const { setVideoRoom } = useInterviewStore();

  const [stage, setStage] = useState<InterviewStage>('permission_check');
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [isCheckingPermissions, setIsCheckingPermissions] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isSocketConnected, setIsSocketConnected] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const smoothedLevelRef = useRef(0);

  useEffect(() => {
    if (!user || user.role !== 'candidate') {
      router.push('/');
    }
  }, [user, router]);

  // Connect to WebSocket when in call
  useEffect(() => {
    if (stage !== 'in_call') return;

    const authToken = token || localStorage.getItem('authToken');
    if (authToken) {
      try {
        connectSocket({
          token: authToken,
          onConnect: () => {
            setIsSocketConnected(true);
            joinInterviewRoom(roundId);
          },
          onDisconnect: () => {
            setIsSocketConnected(false);
          },
          onError: (error) => {
            console.error('Socket error:', error);
          },
        });
      } catch (error) {
        console.error('Failed to connect socket:', error);
      }
    }

    return () => {
      leaveInterviewRoom(roundId);
    };
  }, [stage, roundId, token]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // Setup audio analyzer for speaking detection
  const setupAudioAnalyzer = (stream: MediaStream) => {
    try {
      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.85; // Higher value = smoother
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      // Start detecting speech
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
    const smoothingFactor = 0.3; // Lower = smoother transitions
    
    const checkAudioLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      
      // Calculate average volume
      const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      
      // Apply exponential smoothing for gradual transitions
      smoothedLevelRef.current = smoothedLevelRef.current * (1 - smoothingFactor) + average * smoothingFactor;
      
      // Threshold for speaking detection
      const speakingThreshold = 12;
      const isSpeakingNow = smoothedLevelRef.current > speakingThreshold && isAudioEnabled;
      
      setIsSpeaking(isSpeakingNow);
      setAudioLevel(Math.min(smoothedLevelRef.current / 50, 1)); // Normalize 0-1
      
      animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
    };
    
    checkAudioLevel();
  };

  // Attach stream to video when in_call stage
  useEffect(() => {
    if (stage === 'in_call' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [stage]);

  const checkPermissions = async () => {
    setIsCheckingPermissions(true);
    
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
      
      setCameraPermission('granted');
      setMicrophonePermission('granted');
      
      // Move to consent stage
      setStage('consent');
      setShowConsentModal(true);
    } catch (error: any) {
      console.error('Permission error:', error);
      
      if (error.name === 'NotAllowedError') {
        setCameraPermission('denied');
        setMicrophonePermission('denied');
      }
    } finally {
      setIsCheckingPermissions(false);
    }
  };

  const handleConsentAccept = async () => {
    setConsent(true);
    setShowConsentModal(false);
    
    // Try to update consent via API
    try {
      await roundsApi.updateConsent(roundId, true);
    } catch (error) {
      console.error('Failed to update consent via API:', error);
      // Continue anyway for demo purposes
    }
    
    setStage('in_call');
    
    // Re-attach stream to video element after stage change
    setTimeout(() => {
      if (videoRef.current && streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
    }, 100);
  };

  const handleConsentDecline = async () => {
    setConsent(false);
    setShowConsentModal(false);
    
    // Try to update consent via API
    try {
      await roundsApi.updateConsent(roundId, false);
    } catch (error) {
      console.error('Failed to update consent via API:', error);
    }
    
    // Stop stream and go back
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    router.push('/candidate/dashboard');
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
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setIsSpeaking(false);
    setStage('ended');
    setCameraPermission('pending');
    setMicrophonePermission('pending');
    setConsent(false);
  };

  const goBack = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    router.push('/candidate/dashboard');
  };

  // Permission Check Stage
  if (stage === 'permission_check') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Camera className="w-8 h-8 text-primary-600" />
            </div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Camera & Microphone Access
            </h1>
            <p className="text-gray-600 mb-6">
              We need access to your camera and microphone to conduct the interview.
            </p>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Video className="w-5 h-5 text-gray-600" />
                  <span>Camera</span>
                </div>
                {camera === 'pending' ? (
                  <span className="text-gray-400">Not checked</span>
                ) : camera === 'granted' ? (
                  <CheckCircle className="w-5 h-5 text-success-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-danger-500" />
                )}
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Mic className="w-5 h-5 text-gray-600" />
                  <span>Microphone</span>
                </div>
                {microphone === 'pending' ? (
                  <span className="text-gray-400">Not checked</span>
                ) : microphone === 'granted' ? (
                  <CheckCircle className="w-5 h-5 text-success-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-danger-500" />
                )}
              </div>
            </div>

            {(camera === 'denied' || microphone === 'denied') && (
              <div className="flex items-start gap-2 p-3 bg-warning-50 rounded-lg mb-4 text-left">
                <AlertTriangle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-warning-700">
                  Please allow camera and microphone access in your browser settings and try again.
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={goBack} className="flex-1">
                Go Back
              </Button>
              <Button 
                onClick={checkPermissions} 
                isLoading={isCheckingPermissions}
                className="flex-1"
              >
                Check Permissions
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Consent Modal
  const ConsentModalContent = (
    <Modal
      isOpen={showConsentModal}
      onClose={() => {}}
      closeOnOverlayClick={false}
      showCloseButton={false}
      size="lg"
    >
      <div className="text-center">
        <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-primary-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Recording & AI Analysis Consent
        </h2>
        <div className="text-sm text-gray-500 mb-4">
          Powered by <span className="font-semibold text-primary-600">Aigenthix</span>
        </div>
        
        <div className="text-left bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-700 mb-3">
            By proceeding, you acknowledge and consent to the following:
          </p>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success-500 flex-shrink-0 mt-0.5" />
              <span>This interview session will be recorded for review purposes.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success-500 flex-shrink-0 mt-0.5" />
              <span>AI-powered analysis will be used to assess communication patterns.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success-500 flex-shrink-0 mt-0.5" />
              <span>Your data will be processed securely and in compliance with applicable privacy laws.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-success-500 flex-shrink-0 mt-0.5" />
              <span>You may request deletion of your data after the hiring process.</span>
            </li>
          </ul>
        </div>

        <div className="flex gap-3">
          <Button variant="secondary" onClick={handleConsentDecline} className="flex-1">
            I Decline
          </Button>
          <Button onClick={handleConsentAccept} className="flex-1">
            I Consent & Continue
          </Button>
        </div>
      </div>
    </Modal>
  );

  // Ended Stage
  if (stage === 'ended') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <Card className="max-w-md w-full p-6 text-center">
          <div className="w-16 h-16 bg-success-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-success-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Interview Ended
          </h1>
          <p className="text-gray-600 mb-6">
            Thank you for attending the interview. You will be notified about the next steps.
          </p>
          <Button onClick={() => router.push('/candidate/dashboard')}>
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  // In Call Stage (Main Video Call UI)
  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {ConsentModalContent}
      
      {/* Video Area */}
      <div className="flex-1 relative flex items-center justify-center p-4">
        {/* Main Video (Interviewer - placeholder) */}
        <div className="w-full max-w-4xl aspect-video bg-gray-800 rounded-xl flex items-center justify-center">
          <div className="text-center text-gray-400">
            <Video className="w-16 h-16 mx-auto mb-2" />
            <p>Waiting for interviewer to join...</p>
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
            <div className="w-full h-full flex items-center justify-center bg-gray-700">
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

        {/* Recording Indicator */}
        <div className="absolute top-4 left-4 flex items-center gap-2 bg-black/50 px-3 py-1.5 rounded-full">
          <span className="recording-indicator w-3 h-3 rounded-full bg-danger-500"></span>
          <span className="text-white text-sm">Recording</span>
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
          >
            <Phone className="w-5 h-5 rotate-[135deg]" />
          </button>
        </div>
      </div>
    </div>
  );
}
