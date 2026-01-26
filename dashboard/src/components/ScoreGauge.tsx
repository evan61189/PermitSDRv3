import clsx from 'clsx';

interface ScoreGaugeProps {
  score: number;
  label: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function ScoreGauge({ score, label, size = 'md' }: ScoreGaugeProps) {
  const getColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-amber-600';
    return 'text-red-600';
  };

  const getBgColor = (score: number) => {
    if (score >= 70) return 'bg-green-100';
    if (score >= 40) return 'bg-amber-100';
    return 'bg-red-100';
  };

  const sizeClasses = {
    sm: { container: 'w-16 h-16', text: 'text-lg', label: 'text-xs' },
    md: { container: 'w-20 h-20', text: 'text-2xl', label: 'text-xs' },
    lg: { container: 'w-24 h-24', text: 'text-3xl', label: 'text-sm' },
  };

  return (
    <div className="flex flex-col items-center">
      <div
        className={clsx(
          'rounded-full flex items-center justify-center',
          sizeClasses[size].container,
          getBgColor(score)
        )}
      >
        <span className={clsx('font-bold', sizeClasses[size].text, getColor(score))}>
          {score}
        </span>
      </div>
      <span className={clsx('mt-1 text-gray-600 font-medium', sizeClasses[size].label)}>
        {label}
      </span>
    </div>
  );
}
