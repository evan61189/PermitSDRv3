import { Link } from 'react-router-dom';
import { MapPin, Calendar, Building2, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import OpportunityBadge from './OpportunityBadge';
import type { PermitWithScore } from '../types';
import { PROJECT_TYPE_NAMES, JURISDICTION_NAMES } from '../types';

interface PermitCardProps {
  permit: PermitWithScore;
}

export default function PermitCard({ permit }: PermitCardProps) {
  const formattedDate = permit.submission_date
    ? format(new Date(permit.submission_date), 'MMM d, yyyy')
    : 'N/A';

  return (
    <Link
      to={`/permits/${permit.id}`}
      className="card p-5 hover:shadow-md transition-shadow block"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-mono text-gray-500">
              {permit.permit_number}
            </span>
            <OpportunityBadge
              rating={permit.opportunity_rating}
              score={permit.overall_score}
              showScore
              size="sm"
            />
          </div>

          <h3 className="text-base font-semibold text-gray-900 truncate">
            {permit.description || permit.permit_type || 'No description'}
          </h3>

          <div className="mt-2 space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400" />
              <span className="truncate">
                {permit.address}, {permit.city}, {permit.state}
              </span>
            </div>

            <div className="flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Building2 className="w-4 h-4 text-gray-400" />
                <span>{PROJECT_TYPE_NAMES[permit.project_type]}</span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>{formattedDate}</span>
              </div>
            </div>
          </div>
        </div>

        <ArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {JURISDICTION_NAMES[permit.source_jurisdiction]}
        </span>
        <span className="text-xs text-gray-500">
          Status: <span className="font-medium">{permit.status}</span>
        </span>
      </div>
    </Link>
  );
}
