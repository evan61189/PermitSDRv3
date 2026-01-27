import { MapPin, ExternalLink } from 'lucide-react';
import type { PermitWithScore } from '../types';

interface PermitCardProps {
  permit: PermitWithScore;
}

function getScoreBadge(rating: string | null | undefined, score: number | null | undefined) {
  if (!rating) return null;

  const colors: Record<string, string> = {
    hot: 'bg-red-100 text-red-700 border-red-200',
    warm: 'bg-orange-100 text-orange-700 border-orange-200',
    cold: 'bg-blue-100 text-blue-700 border-blue-200',
    not_relevant: 'bg-gray-100 text-gray-600 border-gray-200',
  };

  const labels: Record<string, string> = {
    hot: 'Hot',
    warm: 'Warm',
    cold: 'Cold',
    not_relevant: 'Not Relevant',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${colors[rating] || colors.not_relevant}`}>
      {labels[rating] || rating}
      {score !== null && score !== undefined && ` (${score})`}
    </span>
  );
}

export default function PermitCard({ permit }: PermitCardProps) {
  const handleDetailClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (permit.detail_url) {
      window.open(permit.detail_url, '_blank');
    }
  };

  return (
    <div className="card p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Permit Number and AI Score */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-sm font-mono font-semibold text-blue-600">
              {permit.permit_number}
            </span>
            {getScoreBadge(permit.opportunity_rating, permit.overall_score)}
            {permit.detail_url && (
              <button
                onClick={handleDetailClick}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-600 bg-green-50 rounded hover:bg-green-100 transition-colors"
                title="View original permit"
              >
                <ExternalLink className="w-3 h-3" />
                View Source
              </button>
            )}
          </div>

          {/* Address */}
          <div className="flex items-center gap-2 text-sm text-gray-700 mb-2">
            <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
            <span>
              {permit.address || 'No address'}
              {permit.city && `, ${permit.city}`}
              {permit.state && `, ${permit.state}`}
            </span>
          </div>

          {/* Description */}
          <div className="text-sm text-gray-600">
            <span className="font-medium">Description: </span>
            {permit.description || 'No description available'}
          </div>
        </div>
      </div>
    </div>
  );
}
