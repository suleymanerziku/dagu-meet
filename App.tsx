
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppState } from './types';
import { VideoPlayer } from './components/VideoPlayer';
import { ControlButton } from './components/ControlButton';
import { MicIcon, MicOffIcon, VideoIcon, VideoOffIcon, HangUpIcon, CopyIcon, NewMeetingIcon, KeyboardIcon } from './components/Icons';

const servers = {
  iceServers: [
    {
      urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Generates a random 10-character alphanumeric string.
const generateMeetingId = (length = 10) => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const safeB64Encode = (str: string): string => {
  return btoa(unescape(encodeURIComponent(str)));
};

const safeB64Decode = (b64: string): string => {
  return decodeURIComponent(escape(atob(b64)));
};


export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [nextAction, setNextAction] = useState<(() => Promise<void>) | null>(null);

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  
  const [meetingId, setMeetingId] = useState('');
  const [joinMeetingCodeInput, setJoinMeetingCodeInput] = useState('');
  
  const [offerCode, setOfferCode] = useState('');
  const [guestOfferInput, setGuestOfferInput] = useState('');
  
  const [answerCode, setAnswerCode] = useState('');
  const [hostAnswerInput, setHostAnswerInput] = useState('');

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const setupMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      return true;
    } catch (error) {
      console.error('Error accessing media devices.', error);
      alert('Could not access camera and microphone. Please allow permissions and try again.');
      setAppState(AppState.ERROR);
      return false;
    }
  };

  useEffect(() => {
      if (localStream && nextAction) {
          const runAction = async () => {
              await nextAction();
          };
          runAction();
          setNextAction(null);
      }
  }, [localStream, nextAction]);

  const handleHangUp = useCallback(() => {
    peerConnectionRef.current?.close();
    localStream?.getTracks().forEach(track => track.stop());
    remoteStream?.getTracks().forEach(track => track.stop());

    setLocalStream(null);
    setRemoteStream(null);
    peerConnectionRef.current = null;
    setAppState(AppState.IDLE);
    setMeetingId('');
    setJoinMeetingCodeInput('');
    setOfferCode('');
    setGuestOfferInput('');
    setAnswerCode('');
    setHostAnswerInput('');
    setIsCameraOn(true);
    setIsMicOn(true);
    window.history.replaceState(null, '', ' ');
  }, [localStream, remoteStream]);

  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
      
    const pc = new RTCPeerConnection(servers);

    pc.onicecandidate = event => {
      if (event.candidate) {
        console.log('ICE candidate generated:', event.candidate.candidate);
      }
    };

    pc.ontrack = event => {
      console.log('Received remote track:', event.streams[0]);
      setRemoteStream(event.streams[0]);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setAppState(AppState.CONNECTED);
      } else if (pc.iceConnectionState === 'failed') {
        alert('Connection failed. Please check your network and try again.');
        handleHangUp();
      }
    };
    
    if(localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [localStream, handleHangUp]);

  const handleCreateMeeting = async () => {
    const newId = generateMeetingId();
    setMeetingId(newId);
    setAppState(AppState.AWAITING_GUEST_OFFER);
  };

  const handleJoinPrompt = async () => {
    if (!joinMeetingCodeInput.trim()) {
        alert("Please enter a meeting code.");
        return;
    }
    setMeetingId(joinMeetingCodeInput.trim());
    await handleGenerateGuestOffer();
  };
  
  const handleGenerateGuestOffer = async () => {
    try {
        const pc = createPeerConnection();

        // Set up promise to wait for ICE gathering *before* triggering it.
        const gatheringComplete = new Promise<void>((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Wait for ICE gathering to complete
        await gatheringComplete;
        
        const encodedOffer = safeB64Encode(JSON.stringify(pc.localDescription));
        setOfferCode(encodedOffer);
        setAppState(AppState.AWAITING_HOST_ANSWER);
    } catch (error) {
        console.error("Error creating offer:", error);
        alert("Could not generate an offer code. Please try again.");
        handleHangUp();
    }
  };
  
  const handleNewMeetingRequest = () => {
    setNextAction(() => handleCreateMeeting);
    setupMedia();
  };

  const handleJoinRequest = () => {
      if (!joinMeetingCodeInput.trim()) {
          return;
      }
      setNextAction(() => handleJoinPrompt);
      setupMedia();
  };

  const handleHostReceivesOffer = async () => {
    if (!guestOfferInput.trim()) {
        alert("Please paste the guest's offer code.");
        return;
    }
    try {
        const pc = createPeerConnection();
        const offerJSON = safeB64Decode(guestOfferInput.trim());
        const offer = JSON.parse(offerJSON);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Set up promise to wait for ICE gathering *before* triggering it.
        const gatheringComplete = new Promise<void>((resolve) => {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                const checkState = () => {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                };
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Wait for ICE gathering to complete
        await gatheringComplete;
        
        const encodedAnswer = safeB64Encode(JSON.stringify(pc.localDescription));
        setAnswerCode(encodedAnswer);
    } catch (error) {
        console.error("Error creating answer:", error);
        alert("Invalid offer code. Please ask your guest to generate a new one.");
        setGuestOfferInput('');
    }
  };

  const handleGuestReceivesAnswer = async () => {
    if (!hostAnswerInput.trim()) {
        alert("Please paste the host's answer code.");
        return;
    }
    const pc = peerConnectionRef.current;
    if (!pc) {
        alert("Peer connection lost. Please restart the process.");
        handleHangUp();
        return;
    }
    try {
        const answerJSON = safeB64Decode(hostAnswerInput.trim());
        const answer = JSON.parse(answerJSON);
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error("Error setting remote description:", error);
        alert("Invalid answer code. Please check the code and try again.");
    }
  };
  
  const toggleMic = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !isMicOn;
      });
      setIsMicOn(!isMicOn);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !isCameraOn;
      });
      setIsCameraOn(!isCameraOn);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!');
    }, (err) => {
      alert('Could not copy text.');
      console.error('Could not copy text: ', err);
    });
  };
  
  const CodeCard = ({ title, code, instruction }: {title: string, code: string, instruction?: string}) => (
    <div className="space-y-2 text-left w-full">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      <div className="relative">
        <textarea
          readOnly
          value={code}
          className="w-full h-28 p-2 bg-gray-100 text-gray-700 rounded-md text-xs font-mono break-all border border-gray-300"
          aria-label={title}
        />
        <button onClick={() => copyToClipboard(code)} className="absolute top-2 right-2 p-1 bg-gray-300 rounded-md hover:bg-gray-400" title="Copy code">
          <CopyIcon className="w-5 h-5 text-gray-700"/>
        </button>
      </div>
      {instruction && <p className="text-sm text-gray-500">{instruction}</p>}
    </div>
  );
  
  const renderContent = () => {
    switch(appState) {
        case AppState.IDLE:
        case AppState.ERROR:
            return (
                 <div className="text-center">
                    <h1 className="text-3xl font-normal text-gray-600 text-center mb-10">Dagu Meet</h1>
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={handleNewMeetingRequest}
                            className="p-2.5 sm:px-4 bg-[#1a73e8] text-white font-medium text-base rounded-full flex items-center sm:gap-3 shadow-sm hover:shadow-md transition-shadow"
                        >
                            <NewMeetingIcon className="w-6 h-6" />
                            <span className="hidden sm:inline">New meeting</span>
                        </button>
                        <div className="flex items-center">
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                                    <KeyboardIcon className="w-6 h-6 text-gray-500" />
                                </span>
                                <input
                                    type="text"
                                    value={joinMeetingCodeInput}
                                    onChange={(e) => setJoinMeetingCodeInput(e.target.value)}
                                    placeholder="Enter a code or link"
                                    className="pl-11 pr-4 py-2.5 bg-white border border-gray-300 rounded-full w-72 focus:ring-2 focus:ring-blue-500 focus:outline-none text-base"
                                />
                            </div>
                            <button
                                onClick={handleJoinRequest}
                                disabled={!joinMeetingCodeInput.trim()}
                                className="ml-4 text-lg text-gray-700 font-semibold disabled:text-gray-400 disabled:cursor-not-allowed"
                            >
                                Join
                            </button>
                        </div>
                    </div>
                    {appState === AppState.ERROR && <p className="text-red-500 mt-4">Failed to access media devices. Please check permissions and refresh.</p>}
                </div>
            );

        case AppState.AWAITING_GUEST_OFFER: // Host's view
            return (
                <div className="w-full max-w-2xl mx-auto p-6 bg-gray-50 rounded-lg shadow-lg border border-gray-200 space-y-6 text-center">
                    <h2 className="text-2xl font-bold text-gray-800">Meeting Ready</h2>
                    <div className="space-y-4 text-left">
                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-800">Step 1: Share Meeting Code</h3>
                            <p className="text-sm text-gray-500">Share this code with your guest so they can generate their Offer Code.</p>
                            <div className="relative">
                                <input readOnly value={meetingId} className="w-full p-3 pr-12 bg-gray-100 text-gray-700 rounded-lg text-lg font-mono tracking-widest text-center border border-gray-300"/>
                                <button onClick={() => copyToClipboard(meetingId)} className="absolute top-1/2 right-2 -translate-y-1/2 p-2 bg-gray-300 rounded-md hover:bg-gray-400" title="Copy code">
                                    <CopyIcon className="w-5 h-5 text-gray-700"/>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-800">Step 2: Paste Guest's Offer Code</h3>
                            <textarea value={guestOfferInput} onChange={(e) => setGuestOfferInput(e.target.value)} placeholder="Paste the guest's offer code here." className="w-full h-28 p-2 bg-gray-100 text-gray-700 rounded-md text-xs font-mono border border-gray-300"/>
                            <button onClick={handleHostReceivesOffer} disabled={!!answerCode} className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed">Generate Answer Code</button>
                        </div>
                        
                        {answerCode && (
                            <div className="space-y-2 animate-fade-in">
                                <h3 className="font-semibold text-gray-800">Step 3: Send Your Answer Code</h3>
                                <CodeCard title="" code={answerCode} instruction="Send this code back to your guest. Waiting for them to connect..." />
                            </div>
                        )}
                    </div>
                </div>
            );
        
        case AppState.AWAITING_HOST_ANSWER: // Guest's view
             return (
                <div className="w-full max-w-2xl mx-auto p-6 bg-gray-50 rounded-lg shadow-lg border border-gray-200 space-y-4 text-center">
                    <h2 className="text-xl font-bold text-gray-800">
                        Joining Meeting: <span className="font-mono bg-gray-100 py-1 px-2 rounded-md tracking-widest">{meetingId}</span>
                    </h2>
                    <div className="space-y-4 text-left">
                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-800">1. Send code to host</h3>
                            <CodeCard title="" code={offerCode} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-semibold text-gray-800">2. Paste host answer.</h3>
                            <textarea value={hostAnswerInput} onChange={(e) => setHostAnswerInput(e.target.value)} placeholder="Paste the host's answer code here." className="w-full h-28 p-2 bg-gray-100 text-gray-700 rounded-md text-xs font-mono border border-gray-300"/>
                        </div>
                    </div>
                    <button onClick={handleGuestReceivesAnswer} className="w-full mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md font-semibold text-lg">Connect</button>
                </div>
            );
        
        case AppState.CONNECTED:
            return (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 relative">
                    <div className="relative w-full flex-grow grid place-items-center max-h-[calc(100vh-150px)]">
                        <VideoPlayer stream={remoteStream} />
                    </div>
                    <div className="absolute w-1/4 max-w-[250px] aspect-video bottom-20 sm:bottom-4 right-4 border-2 border-gray-400 rounded-lg overflow-hidden shadow-lg">
                        <VideoPlayer stream={localStream} muted isLocal />
                    </div>
                </div>
            );
        default:
            return <p>Something went wrong.</p>
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-800 flex flex-col items-center justify-between p-4 selection:bg-blue-200">
        <main className="flex-grow w-full flex flex-col items-center justify-center p-4">
            {renderContent()}
        </main>
        
        {appState !== AppState.IDLE && appState !== AppState.ERROR && (
             <footer className="w-full p-4 bg-white/80 backdrop-blur-md border-t border-gray-200 rounded-t-xl flex justify-center flex-shrink-0 fixed bottom-0 left-0 right-0">
                <div className="flex items-center space-x-4">
                    <ControlButton onClick={toggleMic} className={isMicOn ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-red-600 text-white hover:bg-red-700'} title={isMicOn ? "Mute" : "Unmute"} disabled={!localStream}>
                        {isMicOn ? <MicIcon className="w-6 h-6"/> : <MicOffIcon className="w-6 h-6"/>}
                    </ControlButton>
                    <ControlButton onClick={toggleCamera} className={isCameraOn ? 'bg-gray-200 text-gray-800 hover:bg-gray-300' : 'bg-red-600 text-white hover:bg-red-700'} title={isCameraOn ? "Turn off camera" : "Turn on camera"} disabled={!localStream}>
                        {isCameraOn ? <VideoIcon className="w-6 h-6"/> : <VideoOffIcon className="w-6 h-6"/>}
                    </ControlButton>
                    <ControlButton onClick={handleHangUp} className="bg-red-600 text-white hover:bg-red-700" title="Leave Call">
                        <HangUpIcon className="w-6 h-6"/>
                    </ControlButton>
                </div>
            </footer>
        )}
    </div>
  );
}
