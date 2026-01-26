import clsx from 'clsx';
import { Flame, ThermometerSun, Snowflake, MinusCircle } from 'lucide-react';
import type { OpportunityRating } from '../types';

interface OpportunityBadgeProps {
  rating: OpportunityRating | null;
  score?: number | null;
  showScore?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const config: Record<OpportunityRating, {
  label: string;
  icon: typeof Flame;
  classes: string;
}> = {
  hot: {
    label: 'Hot',
    icon: Flame,
    classes: 'bg-red-100 text-red-800 border-red-200',
  },
  warm: {
    label: 'Warm',
    icon: ThermometerSun,
    classes: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  cold: {
    label: 'Cold',
    icon: Snowflake,
    classes: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  not_relevant: {
    label: 'Not Relevant',
    icon: MinusCircle,
    classes: 'bg-gray-100 text-gray-600 border-gray-200',
  },
};

const sizeClasses = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
  lg: 'px-3 py-1.5 text-base',
};

export default function OpportunityBadge({
  rating,
  score,
  showScore = false,
  size = 'md',
}: OpportunityBadgeProps) {
  if (!rating) {
    return (
      <span className={clsx(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        'bg-gray-50 text-gray-500 border-gray-200',
        sizeClasses[size]
      )}>
        Unscored
      </span>
    );
  }

  const { label, icon: Icon, classes } = config[rating];

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        classes,
        sizeClasses[size]
      )}
    >
      <Icon className={clsx(
        size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'
      )} />
      {label}
      {showScore && score !== null && score !== undefined && (
        <span className="ml-1 font-semibold">{score}</span>
      )}
    </span>
  );
}
