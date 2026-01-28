import { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'red' | 'amber' | 'gray';
  href?: string;
}

const colorStyles = {
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    hoverBorder: 'hover:border-blue-300',
  },
  green: {
    bg: 'bg-green-50',
    icon: 'text-green-600',
    hoverBorder: 'hover:border-green-300',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    hoverBorder: 'hover:border-red-300',
  },
  amber: {
    bg: 'bg-amber-50',
    icon: 'text-amber-600',
    hoverBorder: 'hover:border-amber-300',
  },
  gray: {
    bg: 'bg-gray-50',
    icon: 'text-gray-600',
    hoverBorder: 'hover:border-gray-300',
  },
};

export default function StatCard({
  title,
  value,
  icon: Icon,
  trend,
  color = 'blue',
  href,
}: StatCardProps) {
  const styles = colorStyles[color];

  const content = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-1 text-3xl font-semibold text-gray-900">{value}</p>
        {trend && (
          <p
            className={clsx(
              'mt-1 text-sm font-medium',
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            )}
          >
            {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}% from last week
          </p>
        )}
      </div>
      <div className={clsx('p-3 rounded-lg', styles.bg)}>
        <Icon className={clsx('w-6 h-6', styles.icon)} />
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        to={href}
        className={clsx(
          'card p-6 block transition-all duration-200 cursor-pointer',
          styles.hoverBorder,
          'hover:shadow-md'
        )}
      >
        {content}
      </Link>
    );
  }

  return <div className="card p-6">{content}</div>;
}
