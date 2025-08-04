
import React, { useEffect, useRef } from 'react';

interface VideoPlayerProps {
  stream: MediaStream | null;
  muted?: boolean;
  isLocal?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ stream, muted = false, isLocal = false }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative w-full h-full bg-gray-900 rounded-lg overflow-hidden shadow-lg">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${isLocal ? 'transform -scale-x-100' : ''}`}
      ></video>
      {!stream && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-gray-400">Waiting for video...</p>
        </div>
      )}
    </div>
  );
};
