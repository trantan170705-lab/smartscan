import React, { useState, useRef, useEffect } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { ChevronDown } from 'lucide-react';

export const LanguageToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { language, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className={`relative inline-block select-none ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title={t.langToggleTooltip}
        aria-label={t.langToggleTooltip}
        className="h-[22px] px-1.5 rounded-[3px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] hover:border-[var(--border-active)] text-[var(--text-primary)] font-mono text-[10px] font-bold flex items-center gap-0.5 cursor-pointer active:scale-95 transition-transform"
      >
        <span>{language.toUpperCase()}</span>
        <ChevronDown
          size={10}
          strokeWidth={2}
          className={`text-[var(--text-muted)] transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-[56px] py-0.5 bg-[var(--bg-panel)] border border-[var(--border-hairline)] rounded-[3px] shadow-lg z-50 flex flex-col font-mono text-[10px] font-semibold">
          <button
            type="button"
            onClick={() => {
              setLanguage('vi');
              setIsOpen(false);
            }}
            className={`px-2 py-1 text-left flex items-center justify-between cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors ${
              language === 'vi' ? 'text-[var(--accent-laser)] font-bold' : 'text-[var(--text-muted)]'
            }`}
          >
            <span>VI</span>
            {language === 'vi' && <span className="w-1 h-1 rounded-full bg-[var(--accent-laser)]" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setLanguage('en');
              setIsOpen(false);
            }}
            className={`px-2 py-1 text-left flex items-center justify-between cursor-pointer hover:bg-[var(--bg-elevated)] transition-colors ${
              language === 'en' ? 'text-[var(--accent-laser)] font-bold' : 'text-[var(--text-muted)]'
            }`}
          >
            <span>EN</span>
            {language === 'en' && <span className="w-1 h-1 rounded-full bg-[var(--accent-laser)]" />}
          </button>
        </div>
      )}
    </div>
  );
};
