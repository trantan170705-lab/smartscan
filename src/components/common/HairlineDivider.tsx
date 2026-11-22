import React from 'react';

interface HairlineDividerProps {
  vertical?: boolean;
  className?: string;
}

export const HairlineDivider: React.FC<HairlineDividerProps> = ({ vertical = false, className = '' }) => {
  if (vertical) {
    return <div className={`w-[1px] h-full bg-[var(--border-hairline)] self-stretch shrink-0 ${className}`} />;
  }
  return <div className={`w-full h-[1px] bg-[var(--border-hairline)] shrink-0 ${className}`} />;
};
