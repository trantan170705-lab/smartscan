import { useEffect } from 'react';

export interface ShortcutHandlers {
  onSpace?: () => void;
  onRotate?: () => void;
  onFilter1?: () => void;
  onFilter2?: () => void;
  onFilter3?: () => void;
  onPrevPage?: () => void;
  onNextPage?: () => void;
  onExport?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled: boolean = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handlers.onExport?.();
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          handlers.onSpace?.();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          handlers.onRotate?.();
          break;
        case '1':
          e.preventDefault();
          handlers.onFilter1?.();
          break;
        case '2':
          e.preventDefault();
          handlers.onFilter2?.();
          break;
        case '3':
          e.preventDefault();
          handlers.onFilter3?.();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlers.onPrevPage?.();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handlers.onNextPage?.();
          break;
        case 'Escape':
          e.preventDefault();
          handlers.onEscape?.();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers, enabled]);
}
