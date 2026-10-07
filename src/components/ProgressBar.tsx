interface ProgressBarProps {
  percent: number;
  size?: 'md' | 'lg';
  /** Lighter colors for use on the navy rank card. */
  onDark?: boolean;
}

/**
 * Horizontal fill bar. It's hidden from screen readers (aria-hidden) because
 * every bar in the app sits next to text that already says the number.
 */
export function ProgressBar({ percent, size = 'md', onDark = false }: ProgressBarProps) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div className={`bar bar--${size}${onDark ? ' bar--on-dark' : ''}`} aria-hidden="true">
      <div className="bar__fill" style={{ width: `${width}%` }} />
    </div>
  );
}
