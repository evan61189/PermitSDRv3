import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Building2,
  User,
  ExternalLink,
  Lightbulb,
  Phone,
  Edit2,
  Check,
  X,
  ClipboardList,
} from 'lucide-react';
import { format } from 'date-fns';
import { usePermit, useUpdateProjectContact, useUpdatePipelineStage } from '../hooks/usePermits';
import OpportunityBadge from '../components/OpportunityBadge';
import ScoreGauge from '../components/ScoreGauge';
import TaskList from '../components/TaskList';
import { PROJECT_TYPE_NAMES, JURISDICTION_NAMES, PIPELINE_STAGE_CONFIG, type PipelineStage } from '../types';

export default function PermitDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: permit, isLoading, error } = usePermit(id!);
  const updateContact = useUpdateProjectContact();
  const updateStage = useUpdatePipelineStage();
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactValue, setContactValue] = useState('');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading permit details...</div>
      </div>
    );
  }

  if (error || !permit) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-red-500 mb-4">Permit not found</div>
        <Link to="/permits" className="text-blue-600 hover:text-blue-700">
          ← Back to permits
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/permits"
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to permits
      </Link>

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-mono text-gray-500">
                {permit.permit_number}
              </span>
              <OpportunityBadge
                rating={permit.opportunity_rating}
                score={permit.overall_score}
                showScore
                size="lg"
              />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              {permit.description || permit.permit_type || 'Permit Details'}
            </h1>
          </div>

          {(permit.detail_url || permit.source_url) && (
            <a
              href={permit.detail_url || permit.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary flex items-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              View Source
            </a>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <div className="text-sm text-gray-500">Address</div>
              <div className="font-medium">
                {permit.address}
                <br />
                {permit.city}, {permit.state} {permit.zip_code}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <div className="text-sm text-gray-500">Project Type</div>
              <div className="font-medium">
                {PROJECT_TYPE_NAMES[permit.project_type]}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <div className="text-sm text-gray-500">Submission Date</div>
              <div className="font-medium">
                {permit.submission_date
                  ? format(new Date(permit.submission_date), 'MMMM d, yyyy')
                  : 'N/A'}
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <User className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <div className="text-sm text-gray-500">Applicant</div>
              <div className="font-medium">{permit.applicant_name || 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* Project Contact Section */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
            <div className="flex-1">
              <div className="text-sm text-gray-500 mb-1">Project Contact</div>
              {isEditingContact ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={contactValue}
                    onChange={(e) => setContactValue(e.target.value)}
                    placeholder="Enter contact name, phone, or email"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-clipper-gold focus:border-clipper-gold"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        updateContact.mutate({ permitId: permit.id, contact: contactValue });
                        setIsEditingContact(false);
                      }
                      if (e.key === 'Escape') {
                        setContactValue(permit.project_contact || '');
                        setIsEditingContact(false);
                      }
                    }}
                  />
                  <button
                    onClick={() => {
                      updateContact.mutate({ permitId: permit.id, contact: contactValue });
                      setIsEditingContact(false);
                    }}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-md"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setContactValue(permit.project_contact || '');
                      setIsEditingContact(false);
                    }}
                    className="p-2 text-gray-400 hover:bg-gray-50 rounded-md"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="font-medium">
                    {permit.project_contact || 'No contact added'}
                  </span>
                  <button
                    onClick={() => {
                      setContactValue(permit.project_contact || '');
                      setIsEditingContact(true);
                    }}
                    className="p-1 text-gray-400 hover:text-clipper-navy hover:bg-gray-100 rounded"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Pipeline Stage - Editable */}
          <div className="flex items-center gap-3 mt-4">
            <span className="text-sm text-gray-500">Pipeline Stage:</span>
            <select
              value={permit.pipeline_stage || ''}
              onChange={(e) => {
                const newStage = e.target.value as PipelineStage;
                if (newStage) {
                  updateStage.mutate({ permitId: permit.id, stage: newStage });
                }
              }}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-clipper-gold focus:border-transparent bg-white"
            >
              <option value="">Select stage...</option>
              {Object.entries(PIPELINE_STAGE_CONFIG).map(([stage, config]) => (
                <option key={stage} value={stage}>
                  {config.label}
                </option>
              ))}
            </select>
            {permit.pipeline_stage && (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: PIPELINE_STAGE_CONFIG[permit.pipeline_stage]?.color }}
              />
            )}
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <span>
              Status: <span className="font-medium text-gray-700">{permit.status}</span>
            </span>
            <span>
              Jurisdiction: <span className="font-medium text-gray-700">
                {JURISDICTION_NAMES[permit.source_jurisdiction]}
              </span>
            </span>
            {permit.estimated_value && (
              <span>
                Est. Value: <span className="font-medium text-gray-700">
                  ${permit.estimated_value.toLocaleString()}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tasks Section */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <ClipboardList className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Follow-up Tasks</h2>
        </div>
        <TaskList permitId={permit.id} />
      </div>

      {/* AI Scoring Section */}
      {permit.overall_score !== null && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">AI Analysis</h2>

          {/* Score Gauges */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-8">
            <ScoreGauge
              score={permit.overall_score || 0}
              label="Overall"
              size="lg"
            />
            <ScoreGauge
              score={permit.project_size_score || 0}
              label="Project Size"
            />
            <ScoreGauge
              score={permit.timing_score || 0}
              label="Timing"
            />
            <ScoreGauge
              score={permit.location_score || 0}
              label="Location"
            />
            <ScoreGauge
              score={permit.competition_score || 0}
              label="Competition"
            />
          </div>

          {/* Reasoning */}
          {permit.reasoning && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Analysis</h3>
              <p className="text-gray-600 bg-gray-50 rounded-lg p-4">
                {permit.reasoning}
              </p>
            </div>
          )}

          {/* Keywords */}
          {permit.keywords_detected && permit.keywords_detected.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Keywords Detected</h3>
              <div className="flex flex-wrap gap-2">
                {permit.keywords_detected.map((keyword, index) => (
                  <span
                    key={index}
                    className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Recommended Actions */}
          {permit.recommended_actions && permit.recommended_actions.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Recommended Actions
              </h3>
              <ul className="space-y-2">
                {permit.recommended_actions.map((action, index) => (
                  <li
                    key={index}
                    className="flex items-start gap-2 text-gray-600"
                  >
                    <span className="w-5 h-5 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-medium flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {permit.scored_at && (
            <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
              Scored on {format(new Date(permit.scored_at), 'MMMM d, yyyy \'at\' h:mm a')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
