import { useState, useMemo } from 'react';
import { Calendar, ChevronDown, GripVertical, Building2, MapPin, DollarSign } from 'lucide-react';
import { usePermitsByPipelineStage, useUpdatePipelineStage } from '../hooks/usePermits';
import { PIPELINE_STAGE_CONFIG, OPPORTUNITY_COLORS, type PipelineStage, type PermitWithScore } from '../types';
import { Link } from 'react-router-dom';

// Get default date range (last 30 days)
function getDefaultDateRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

interface PipelineColumnProps {
  stage: PipelineStage;
  permits: PermitWithScore[];
  onMovePermit: (permitId: string, newStage: PipelineStage) => void;
}

function PipelineColumn({ stage, permits, onMovePermit }: PipelineColumnProps) {
  const config = PIPELINE_STAGE_CONFIG[stage];
  const [isDropTarget, setIsDropTarget] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDropTarget(true);
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDropTarget(false);
    const permitId = e.dataTransfer.getData('permitId');
    if (permitId) {
      onMovePermit(permitId, stage);
    }
  };

  return (
    <div
      className={`flex flex-col min-w-[280px] max-w-[320px] bg-gray-50 rounded-lg ${
        isDropTarget ? 'ring-2 ring-clipper-gold' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className="p-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: config.color }}
            />
            <h3 className="font-semibold text-gray-900">{config.label}</h3>
          </div>
          <span className="text-sm text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
            {permits.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
        {permits.map((permit) => (
          <PipelineCard key={permit.id} permit={permit} />
        ))}
        {permits.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            No permits in this stage
          </div>
        )}
      </div>
    </div>
  );
}

interface PipelineCardProps {
  permit: PermitWithScore;
}

function PipelineCard({ permit }: PipelineCardProps) {
  const ratingColors = permit.opportunity_rating
    ? OPPORTUNITY_COLORS[permit.opportunity_rating]
    : OPPORTUNITY_COLORS.not_relevant;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('permitId', permit.id);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="bg-white rounded-lg border border-gray-200 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {/* Permit Number & Rating */}
          <div className="flex items-center justify-between gap-2 mb-1">
            <Link
              to={`/permits/${permit.id}`}
              className="font-medium text-clipper-navy hover:text-clipper-gold text-sm truncate"
            >
              {permit.permit_number}
            </Link>
            {permit.opportunity_rating && (
              <span
                className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${ratingColors.bg} ${ratingColors.text}`}
              >
                {permit.opportunity_rating.replace('_', ' ')}
              </span>
            )}
          </div>

          {/* Address */}
          <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{permit.address}, {permit.city}</span>
          </div>

          {/* Project Type & Value */}
          <div className="flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 text-gray-500">
              <Building2 className="w-3 h-3" />
              <span className="truncate">{permit.project_type?.replace('_', ' ')}</span>
            </div>
            {permit.estimated_value && (
              <div className="flex items-center gap-1 text-gray-600 font-medium">
                <DollarSign className="w-3 h-3" />
                {(permit.estimated_value / 1000).toFixed(0)}K
              </div>
            )}
          </div>

          {/* Score */}
          {permit.overall_score !== null && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-clipper-gold rounded-full"
                  style={{ width: `${permit.overall_score}%` }}
                />
              </div>
              <span className="text-xs font-medium text-gray-600">{permit.overall_score}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Pipeline() {
  const [dateRange, setDateRange] = useState(getDefaultDateRange);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { data: permitsByStage, isLoading } = usePermitsByPipelineStage(
    dateRange.from,
    dateRange.to + 'T23:59:59'
  );
  const updateStage = useUpdatePipelineStage();

  const handleMovePermit = (permitId: string, newStage: PipelineStage) => {
    updateStage.mutate({ permitId, stage: newStage });
  };

  const stages: PipelineStage[] = ['lead', 'researching', 'contact_made', 'meeting_booked', 'not_interested', 'won', 'lost'];

  // Calculate totals
  const totals = useMemo(() => {
    if (!permitsByStage) return { count: 0, value: 0 };
    let count = 0;
    let value = 0;
    for (const stage of Object.values(permitsByStage)) {
      count += stage.length;
      for (const permit of stage) {
        value += permit.estimated_value || 0;
      }
    }
    return { count, value };
  }, [permitsByStage]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-clipper-navy">Pipeline</h1>
          <p className="mt-1 text-gray-500">
            Drag and drop opportunities to update their status
          </p>
        </div>

        {/* Date Range Picker */}
        <div className="relative">
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-sm">
              {new Date(dateRange.from).toLocaleDateString()} - {new Date(dateRange.to).toLocaleDateString()}
            </span>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </button>

          {showDatePicker && (
            <div className="absolute right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-10">
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDateRange(getDefaultDateRange())}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Last 30 Days
                  </button>
                  <button
                    onClick={() => {
                      const to = new Date();
                      const from = new Date();
                      from.setDate(from.getDate() - 90);
                      setDateRange({
                        from: from.toISOString().split('T')[0],
                        to: to.toISOString().split('T')[0],
                      });
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Last 90 Days
                  </button>
                </div>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="w-full px-3 py-2 text-sm bg-clipper-gold text-white rounded-md hover:bg-clipper-gold-dark"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-6 p-4 bg-white rounded-lg border border-gray-200">
        <div>
          <p className="text-sm text-gray-500">Total Opportunities</p>
          <p className="text-2xl font-bold text-clipper-navy">{totals.count}</p>
        </div>
        <div className="h-10 w-px bg-gray-200" />
        <div>
          <p className="text-sm text-gray-500">Total Estimated Value</p>
          <p className="text-2xl font-bold text-clipper-gold">
            ${(totals.value / 1000000).toFixed(1)}M
          </p>
        </div>
      </div>

      {/* Pipeline Board */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading pipeline...</div>
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <PipelineColumn
              key={stage}
              stage={stage}
              permits={permitsByStage?.[stage] || []}
              onMovePermit={handleMovePermit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
