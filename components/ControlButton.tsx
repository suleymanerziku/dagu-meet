
import React from 'react';

interface ControlButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  title: string;
}

export const ControlButton: React.FC<ControlButtonProps> = ({ onClick, children, className = '', disabled = false, title }) => {
  const baseClasses = 'w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-blue-500/50';
  const disabledClasses = 'bg-gray-400 cursor-not-allowed';
  
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${baseClasses} ${disabled ? disabledClasses : className}`}
    >
      {children}
    </button>
  );
};
