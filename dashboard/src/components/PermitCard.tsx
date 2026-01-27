import { MapPin, ExternalLink } from 'lucide-react';
import type { PermitWithScore } from '../types';

interface PermitCardProps {
  permit: PermitWithScore;
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
          {/* Permit Number */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-mono font-semibold text-blue-600">
              {permit.permit_number}
            </span>
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
