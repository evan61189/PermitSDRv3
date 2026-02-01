import { MapPin, ExternalLink, Building, Briefcase, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { PermitWithScore } from '../types';
import { PROJECT_TYPE_NAMES, type ProjectType } from '../types';

interface PermitCardProps {
  permit: PermitWithScore;
  selectable?: boolean;
  selected?: boolean;
  onSelectChange?: (id: string, selected: boolean) => void;
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

function getProjectTypeBadge(projectType: string | null | undefined) {
  if (!projectType) return null;

  const isCommercial = projectType.includes('commercial') || projectType === 'industrial' || projectType === 'mixed_use';
  const colorClass = isCommercial
    ? 'bg-purple-100 text-purple-700 border-purple-200'
    : 'bg-slate-100 text-slate-700 border-slate-200';

  const displayName = PROJECT_TYPE_NAMES[projectType as ProjectType] || projectType;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${colorClass}`}>
      <Building className="w-3 h-3" />
      {displayName}
    </span>
  );
}

export default function PermitCard({ permit, selectable = false, selected = false, onSelectChange }: PermitCardProps) {
  const [expanded, setExpanded] = useState(false);

  const handleDetailClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (permit.detail_url) {
      window.open(permit.detail_url, '_blank');
    }
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onSelectChange?.(permit.id, e.target.checked);
  };

  const hasAIInsights = permit.reasoning || (permit.recommended_actions && permit.recommended_actions.length > 0);

  return (
    <div className={`card p-5 hover:shadow-md transition-shadow ${selected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {selectable && (
            <div className="pt-1">
              <input
                type="checkbox"
                checked={selected}
                onChange={handleCheckboxChange}
                className="w-5 h-5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
              />
            </div>
          )}
          <div className="flex-1 min-w-0">
          {/* Permit Number, Project Type, and AI Score */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Link
              to={`/permits/${permit.id}`}
              className="text-sm font-mono font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              {permit.permit_number}
            </Link>
            {getProjectTypeBadge(permit.project_type)}
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
          <div className="text-sm text-gray-600 mb-2">
            <span className="font-medium">Description: </span>
            {permit.description || 'No description available'}
          </div>

          {/* Additional Info: Estimated Value, Applicant */}
          {(permit.estimated_value || permit.applicant_name) && (
            <div className="flex flex-wrap gap-4 text-xs text-gray-500 mb-2">
              {permit.estimated_value && (
                <span>
                  <span className="font-medium">Value:</span> ${permit.estimated_value.toLocaleString()}
                </span>
              )}
              {permit.applicant_name && (
                <span>
                  <span className="font-medium">Applicant:</span> {permit.applicant_name}
                </span>
              )}
              {permit.contractor_name && (
                <span>
                  <span className="font-medium">Contractor:</span> {permit.contractor_name}
                </span>
              )}
            </div>
          )}

          {/* AI Insights Toggle */}
          {hasAIInsights && (
            <div className="mt-3 border-t pt-3">
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
              >
                <Briefcase className="w-4 h-4" />
                <span className="font-medium">AI Insights</span>
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {expanded && (
                <div className="mt-2 space-y-2">
                  {/* AI Reasoning */}
                  {permit.reasoning && (
                    <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded">
                      <span className="font-medium text-gray-700">Analysis: </span>
                      {permit.reasoning}
                    </div>
                  )}

                  {/* Keywords */}
                  {permit.keywords_detected && permit.keywords_detected.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {permit.keywords_detected.map((keyword, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Recommended Actions */}
                  {permit.recommended_actions && permit.recommended_actions.length > 0 && (
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">Recommended Actions:</span>
                      <ul className="list-disc list-inside mt-1 text-gray-600">
                        {permit.recommended_actions.map((action, i) => (
                          <li key={i}>{action}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
