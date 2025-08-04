
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AppState } from './types';
import { VideoPlayer } from './components/VideoPlayer';
import { ControlButton } from './components/ControlButton';
import { MicIcon, MicOffIcon, VideoIcon, VideoOffIcon, HangUpIcon, CopyIcon } from './components/Icons';

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

/**
 * Safely encodes a UTF-8 string to a Base64 string, correctly handling Unicode characters.
 * This method is a widely used workaround for the limitations of the native `btoa` function.
 * @param str The string to encode.
 * @returns The Base64 encoded string.
 */
const safeB64Encode = (str: string): string => {
  // First, we use encodeURIComponent to get percent-encoded UTF-8,
  // then we convert the percent encodings into raw bytes which can be fed to btoa.
  // Note: unescape is deprecated but is the necessary counterpart to the deprecated escape function used in decode.
  return btoa(unescape(encodeURIComponent(str)));
};

/**
 * Safely decodes a Base64 string to a UTF-8 string that was encoded with `safeB64Encode`.
 * @param b64 The Base64 string to decode.
 * @returns The decoded UTF-8 string.
 */
const safeB64Decode = (b64: string): string => {
  // Going backwards: from bytestream, to percent-encoding, to original string.
  // Note: escape is deprecated but is the necessary counterpart to the deprecated unescape used in encode.
  return decodeURIComponent(escape(atob(b64)));
};


export default function App() {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const [isMicOn, setIsMicOn] = useState(true);
  const [isCameraOn, setIsCameraOn] = useState(true);
  
  const [meetingId, setMeetingId] = useState('');
  const [joinMeetingCodeInput, setJoinMeetingCodeInput] = useState('');
  
  const [offerCode, setOfferCode] = useState(''); // Guest's generated offer
  const [guestOfferInput, setGuestOfferInput] = useState(''); // Host's input for the offer
  
  const [answerCode, setAnswerCode] = useState(''); // Host's generated answer
  const [hostAnswerInput, setHostAnswerInput] = useState(''); // Guest's input for the answer

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const setupMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setLocalStream(stream);
      setAppState(AppState.LOBBY);
      return true;
    } catch (error) {
      console.error('Error accessing media devices.', error);
      alert('Could not access camera and microphone. Please allow permissions and try again.');
      setAppState(AppState.ERROR);
      return false;
    }
  };

  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
      
    const pc = new RTCPeerConnection(servers);

    pc.onicecandidate = event => {
      if (event.candidate) {
        // In this manual signaling flow, we send all candidates at once with the SDP.
        // This handler is here for potential future trickle ICE implementations.
        console.log('ICE candidate generated:', event.candidate.candidate);
      }
    };

    pc.ontrack = event => {
      console.log('Received remote track:', event.streams[0]);
      setRemoteStream(event.streams[0]);
      setAppState(AppState.CONNECTED);
    };
    
    if(localStream) {
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [localStream]);

  // Host Flow: Step 1
  const handleCreateMeeting = async () => {
    const newId = generateMeetingId();
    setMeetingId(newId);
    setAppState(AppState.AWAITING_GUEST_OFFER);
  };

  // Guest Flow: Step 1
  const handleJoinPrompt = async () => {
    if (!joinMeetingCodeInput.trim()) {
        alert("Please enter a meeting code.");
        return;
    }
    setMeetingId(joinMeetingCodeInput.trim());
    await handleGenerateGuestOffer();
  };
  
  // Guest Flow: Step 2
  const handleGenerateGuestOffer = async () => {
    try {
        const pc = createPeerConnection();
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        const encodedOffer = safeB64Encode(JSON.stringify(offer));
        setOfferCode(encodedOffer);
        setAppState(AppState.AWAITING_HOST_ANSWER);
    } catch (error) {
        console.error("Error creating offer:", error);
        alert("Could not generate an offer code. Please try again.");
        handleHangUp();
    }
  };

  // Host Flow: Step 2
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
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        const encodedAnswer = safeB64Encode(JSON.stringify(answer));
        setAnswerCode(encodedAnswer);
    } catch (error) {
        console.error("Error creating answer:", error);
        alert("Invalid offer code. Please ask your guest to generate a new one.");
        setGuestOfferInput('');
    }
  };

  // Guest Flow: Step 3
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
  
  const handleHangUp = () => {
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
      <h3 className="font-semibold text-white">{title}</h3>
      <div className="relative">
        <textarea
          readOnly
          value={code}
          className="w-full h-28 p-2 bg-gray-900 text-gray-300 rounded-md text-xs font-mono break-all"
          aria-label={title}
        />
        <button onClick={() => copyToClipboard(code)} className="absolute top-2 right-2 p-1 bg-gray-600 rounded-md hover:bg-gray-500" title="Copy code">
          <CopyIcon className="w-5 h-5"/>
        </button>
      </div>
      {instruction && <p className="text-sm text-gray-400">{instruction}</p>}
    </div>
  );
  
  const renderContent = () => {
    switch(appState) {
        case AppState.IDLE:
        case AppState.ERROR:
            return (
                 <div className="text-center">
                    <p className="mb-4">Click the button below to start your camera and microphone.</p>
                    <button onClick={setupMedia} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-bold text-lg">
                        Start Camera & Mic
                    </button>
                    {appState === AppState.ERROR && <p className="text-red-500 mt-4">Failed to access media devices. Please check permissions and refresh.</p>}
                </div>
            );
        
        case AppState.LOBBY:
             return (
                <div className="w-full max-w-lg mx-auto p-6 bg-gray-800 rounded-lg shadow-xl space-y-6">
                    <div className="w-full aspect-video bg-black rounded-md overflow-hidden">
                       <VideoPlayer stream={localStream} muted isLocal />
                    </div>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                        <button onClick={handleCreateMeeting} className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold text-lg">
                            Create New Meeting
                        </button>
                         <button onClick={() => setAppState(AppState.PROMPT_FOR_MEETING_CODE)} className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold text-lg">
                            Join a Meeting
                        </button>
                    </div>
                </div>
            );
        
        case AppState.PROMPT_FOR_MEETING_CODE:
            return (
                <div className="w-full max-w-lg mx-auto p-6 bg-gray-800 rounded-lg shadow-xl space-y-6">
                    <h2 className="text-2xl font-bold text-white text-center">Join a Meeting</h2>
                    <div className="space-y-2 text-left">
                        <label className="font-semibold text-white block">Enter meeting code from host:</label>
                        <input 
                            value={joinMeetingCodeInput}
                            onChange={(e) => setJoinMeetingCodeInput(e.target.value)}
                            placeholder="e.g. a1b2c3d4e5" 
                            className="w-full p-3 bg-gray-900 text-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono tracking-widest" />
                    </div>
                    <div className="flex gap-4">
                         <button onClick={() => setAppState(AppState.LOBBY)} className="w-full px-4 py-3 bg-gray-600 hover:bg-gray-700 rounded-md font-semibold">Back</button>
                         <button onClick={handleJoinPrompt} className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-md font-semibold">Join</button>
                    </div>
                </div>
            );

        case AppState.AWAITING_GUEST_OFFER: // Host's view
            return (
                <div className="w-full max-w-2xl mx-auto p-6 bg-gray-800 rounded-lg shadow-xl space-y-6 text-center">
                    <h2 className="text-2xl font-bold text-white">Meeting Ready</h2>
                    <div className="space-y-4 text-left">
                        <div className="space-y-2">
                            <h3 className="font-semibold text-white">Step 1: Share Meeting Code</h3>
                            <p className="text-sm text-gray-400">Share this code with your guest so they can generate their Offer Code.</p>
                            <div className="relative">
                                <input readOnly value={meetingId} className="w-full p-3 pr-12 bg-gray-900 text-gray-300 rounded-lg text-lg font-mono tracking-widest text-center"/>
                                <button onClick={() => copyToClipboard(meetingId)} className="absolute top-1/2 right-2 -translate-y-1/2 p-2 bg-gray-700 rounded-md hover:bg-gray-600" title="Copy code">
                                    <CopyIcon className="w-5 h-5"/>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <h3 className="font-semibold text-white">Step 2: Get Guest's Offer Code</h3>
                            <textarea value={guestOfferInput} onChange={(e) => setGuestOfferInput(e.target.value)} placeholder="Paste the guest's offer code here." className="w-full h-28 p-2 bg-gray-900 text-gray-300 rounded-md text-xs font-mono"/>
                            <button onClick={handleHostReceivesOffer} disabled={!!answerCode} className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-md font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed">Create Answer Code</button>
                        </div>
                        
                        {answerCode && (
                            <div className="space-y-2 animate-fade-in">
                                <h3 className="font-semibold text-white">Step 3: Send Your Answer Code</h3>
                                <CodeCard title="" code={answerCode} instruction="Send this code back to your guest. Waiting for them to connect..." />
                            </div>
                        )}
                    </div>
                </div>
            );
        
        case AppState.AWAITING_HOST_ANSWER: // Guest's view
             return (
                <div className="w-full max-w-2xl mx-auto p-6 bg-gray-800 rounded-lg shadow-xl space-y-4 text-center">
                    <h2 className="text-xl font-bold text-white">
                        Joining Meeting: <span className="font-mono bg-gray-700 py-1 px-2 rounded-md tracking-widest">{meetingId}</span>
                    </h2>
                    <div className="space-y-4 text-left">
                        <div className="space-y-2">
                            <h3 className="font-semibold text-white">Step 1: Send your Offer Code to the host</h3>
                            <CodeCard title="" code={offerCode} />
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-semibold text-white">Step 2: Paste the host's Answer Code</h3>
                            <textarea value={hostAnswerInput} onChange={(e) => setHostAnswerInput(e.target.value)} placeholder="Paste the host's answer code here." className="w-full h-28 p-2 bg-gray-900 text-gray-300 rounded-md text-xs font-mono"/>
                        </div>
                    </div>
                    <button onClick={handleGuestReceivesAnswer} className="w-full mt-4 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-md font-semibold text-lg">Connect</button>
                </div>
            );
        
        case AppState.CONNECTED:
            return (
                <div className="w-full h-full flex flex-col items-center justify-center gap-4 relative">
                    <div className="relative w-full flex-grow grid place-items-center max-h-[calc(100vh-150px)]">
                        <VideoPlayer stream={remoteStream} />
                    </div>
                    <div className="absolute w-1/4 max-w-[250px] aspect-video bottom-20 sm:bottom-4 right-4 border-2 border-gray-600 rounded-lg overflow-hidden shadow-lg">
                        <VideoPlayer stream={localStream} muted isLocal />
                    </div>
                </div>
            );
        default:
            return <p>Something went wrong.</p>
    }
  }

  return (
    <div className="min-h-screen bg-gray-800 text-white flex flex-col items-center justify-between p-4 selection:bg-indigo-500/50">
        <header className="w-full flex-shrink-0">
            <h1 className="text-3xl font-bold text-center">Dagu Meet</h1>
        </header>

        <main className="flex-grow w-full flex flex-col items-center justify-center p-4">
            {renderContent()}
        </main>
        
        {appState !== AppState.IDLE && appState !== AppState.ERROR && (
             <footer className="w-full p-4 bg-gray-900/50 rounded-t-xl flex justify-center flex-shrink-0 fixed bottom-0 left-0 right-0">
                <div className="flex items-center space-x-4">
                    <ControlButton onClick={toggleMic} className={isMicOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'} title={isMicOn ? "Mute" : "Unmute"} disabled={!localStream}>
                        {isMicOn ? <MicIcon className="w-6 h-6"/> : <MicOffIcon className="w-6 h-6"/>}
                    </ControlButton>
                    <ControlButton onClick={toggleCamera} className={isCameraOn ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'} title={isCameraOn ? "Turn off camera" : "Turn on camera"} disabled={!localStream}>
                        {isCameraOn ? <VideoIcon className="w-6 h-6"/> : <VideoOffIcon className="w-6 h-6"/>}
                    </ControlButton>
                    <ControlButton onClick={handleHangUp} className="bg-red-600 hover:bg-red-700" title="Leave Call">
                        <HangUpIcon className="w-6 h-6"/>
                    </ControlButton>
                </div>
            </footer>
        )}
    </div>
  );
}