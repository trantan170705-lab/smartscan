import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? 'Switch to Light Blueprint' : 'Switch to Darkroom Obsidian'}
      aria-label="Toggle visual theme"
      className="w-[36px] h-[20px] rounded-full p-[2px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] flex items-center cursor-pointer transition-colors focus:outline-none focus:border-[var(--border-active)]"
    >
      <div
        className={`w-[14px] h-[14px] rounded-full bg-[var(--text-primary)] flex items-center justify-center text-[var(--bg-void)] transform transition-transform duration-150 ${
          isDark ? 'translate-x-[16px]' : 'translate-x-0'
        }`}
      >
        {isDark ? (
          <Moon size={10} strokeWidth={2} />
        ) : (
          <Sun size={10} strokeWidth={2} />
        )}
      </div>
    </button>
  );
};
