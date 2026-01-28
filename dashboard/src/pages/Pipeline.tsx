import { useState, useMemo } from 'react';
import { Calendar, ChevronDown, GripVertical, Building2, MapPin, DollarSign, User, X, Check } from 'lucide-react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { usePermitsByPipelineStage, useUpdatePipelineStage, useUpdateProjectContact } from '../hooks/usePermits';
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
  onUpdateContact: (permitId: string, contact: string) => void;
}

function PipelineColumn({ stage, permits, onUpdateContact }: PipelineColumnProps) {
  const config = PIPELINE_STAGE_CONFIG[stage];
  const { setNodeRef, isOver } = useDroppable({
    id: stage,
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-[280px] max-w-[320px] bg-gray-50 rounded-lg transition-all ${
        isOver ? 'ring-2 ring-clipper-gold bg-clipper-gold/10' : ''
      }`}
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
      <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-320px)]">
        {permits.map((permit) => (
          <DraggablePipelineCard
            key={permit.id}
            permit={permit}
            onUpdateContact={onUpdateContact}
          />
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

interface DraggablePipelineCardProps {
  permit: PermitWithScore;
  onUpdateContact: (permitId: string, contact: string) => void;
  isDragOverlay?: boolean;
}

function DraggablePipelineCard({ permit, onUpdateContact, isDragOverlay }: DraggablePipelineCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: permit.id,
    data: { permit },
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${isDragging && !isDragOverlay ? 'opacity-30' : ''}`}
    >
      <PipelineCard
        permit={permit}
        onUpdateContact={onUpdateContact}
        dragHandleProps={{ ...attributes, ...listeners }}
        isDragOverlay={isDragOverlay}
      />
    </div>
  );
}

interface PipelineCardProps {
  permit: PermitWithScore;
  onUpdateContact: (permitId: string, contact: string) => void;
  dragHandleProps?: Record<string, unknown>;
  isDragOverlay?: boolean;
}

function PipelineCard({ permit, onUpdateContact, dragHandleProps, isDragOverlay }: PipelineCardProps) {
  const [isEditingContact, setIsEditingContact] = useState(false);
  const [contactValue, setContactValue] = useState(permit.project_contact || '');

  const ratingColors = permit.opportunity_rating
    ? OPPORTUNITY_COLORS[permit.opportunity_rating]
    : OPPORTUNITY_COLORS.not_relevant;

  const handleSaveContact = () => {
    onUpdateContact(permit.id, contactValue);
    setIsEditingContact(false);
  };

  const handleCancelContact = () => {
    setContactValue(permit.project_contact || '');
    setIsEditingContact(false);
  };

  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-all select-none ${
        isDragOverlay ? 'shadow-xl ring-2 ring-clipper-gold rotate-2' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <div
          {...dragHandleProps}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        </div>
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

          {/* Project Contact */}
          <div className="mt-2 pt-2 border-t border-gray-100">
            {isEditingContact ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={contactValue}
                  onChange={(e) => setContactValue(e.target.value)}
                  placeholder="Contact name/info"
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-clipper-gold focus:border-clipper-gold"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveContact();
                    if (e.key === 'Escape') handleCancelContact();
                  }}
                />
                <button
                  onClick={handleSaveContact}
                  className="p-1 text-green-600 hover:bg-green-50 rounded"
                >
                  <Check className="w-3 h-3" />
                </button>
                <button
                  onClick={handleCancelContact}
                  className="p-1 text-gray-400 hover:bg-gray-50 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingContact(true)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-clipper-navy w-full text-left"
              >
                <User className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {permit.project_contact || 'Add contact...'}
                </span>
              </button>
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
  const [activePermit, setActivePermit] = useState<PermitWithScore | null>(null);

  const { data: permitsByStage, isLoading } = usePermitsByPipelineStage(
    dateRange.from,
    dateRange.to + 'T23:59:59'
  );
  const updateStage = useUpdatePipelineStage();
  const updateContact = useUpdateProjectContact();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const permit = active.data.current?.permit as PermitWithScore;
    setActivePermit(permit);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActivePermit(null);

    if (over && active.id !== over.id) {
      const permitId = active.id as string;
      const newStage = over.id as PipelineStage;

      // Only update if dropping on a valid stage
      if (Object.keys(PIPELINE_STAGE_CONFIG).includes(newStage)) {
        updateStage.mutate({ permitId, stage: newStage });
      }
    }
  };

  const handleUpdateContact = (permitId: string, contact: string) => {
    updateContact.mutate({ permitId, contact });
  };

  // Active pipeline stages (main workflow)
  const activeStages: PipelineStage[] = ['lead', 'researching', 'contact_made', 'meeting_booked'];
  // Outcome stages (end states)
  const outcomeStages: PipelineStage[] = ['not_interested', 'won', 'lost'];

  // Calculate totals (excluding outcome stages)
  const totals = useMemo(() => {
    if (!permitsByStage) return { count: 0, value: 0, wonCount: 0, wonValue: 0 };
    let count = 0;
    let value = 0;
    let wonCount = 0;
    let wonValue = 0;

    for (const [stage, permits] of Object.entries(permitsByStage)) {
      for (const permit of permits) {
        if (stage === 'won') {
          wonCount++;
          wonValue += permit.estimated_value || 0;
        }
        if (!['not_interested', 'won', 'lost'].includes(stage)) {
          count++;
          value += permit.estimated_value || 0;
        }
      }
    }
    return { count, value, wonCount, wonValue };
  }, [permitsByStage]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
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
            <p className="text-sm text-gray-500">Active Opportunities</p>
            <p className="text-2xl font-bold text-clipper-navy">{totals.count}</p>
          </div>
          <div className="h-10 w-px bg-gray-200" />
          <div>
            <p className="text-sm text-gray-500">Pipeline Value</p>
            <p className="text-2xl font-bold text-clipper-gold">
              ${(totals.value / 1000000).toFixed(1)}M
            </p>
          </div>
          <div className="h-10 w-px bg-gray-200" />
          <div>
            <p className="text-sm text-gray-500">Won Deals</p>
            <p className="text-2xl font-bold text-green-600">{totals.wonCount}</p>
          </div>
          <div className="h-10 w-px bg-gray-200" />
          <div>
            <p className="text-sm text-gray-500">Won Value</p>
            <p className="text-2xl font-bold text-green-600">
              ${(totals.wonValue / 1000000).toFixed(1)}M
            </p>
          </div>
        </div>

        {/* Pipeline Board */}
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-gray-500">Loading pipeline...</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Pipeline Stages */}
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">Active Pipeline</h2>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {activeStages.map((stage) => (
                  <PipelineColumn
                    key={stage}
                    stage={stage}
                    permits={permitsByStage?.[stage] || []}
                    onUpdateContact={handleUpdateContact}
                  />
                ))}
              </div>
            </div>

            {/* Outcome Stages */}
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-3 uppercase tracking-wide">Outcomes</h2>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {outcomeStages.map((stage) => (
                  <PipelineColumn
                    key={stage}
                    stage={stage}
                    permits={permitsByStage?.[stage] || []}
                    onUpdateContact={handleUpdateContact}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drag Overlay - shows the card while dragging */}
      <DragOverlay>
        {activePermit ? (
          <PipelineCard
            permit={activePermit}
            onUpdateContact={() => {}}
            isDragOverlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
