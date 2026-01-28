import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Play, Loader2, Calendar } from 'lucide-react';
import PermitCard from '../components/PermitCard';
import { usePermits, type PermitFilters } from '../hooks/usePermits';
import {
  JURISDICTION_NAMES,
  PROJECT_TYPE_NAMES,
  type Jurisdiction,
  type ProjectType,
  type OpportunityRating,
} from '../types';

const PAGE_SIZE = 20;

export default function Permits() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize filters from URL params
  const getInitialFilters = (): PermitFilters => {
    const rating = searchParams.get('rating') as OpportunityRating | null;
    const jurisdiction = searchParams.get('jurisdiction') as Jurisdiction | null;
    const projectType = searchParams.get('projectType') as ProjectType | null;
    const search = searchParams.get('search');

    return {
      opportunityRating: rating || undefined,
      jurisdiction: jurisdiction || undefined,
      projectType: projectType || undefined,
      search: search || undefined,
      sortBy: 'created_at',
      sortOrder: 'desc',
      limit: PAGE_SIZE,
      offset: 0,
    };
  };

  const [filters, setFilters] = useState<PermitFilters>(getInitialFilters);

  // Sync filters to URL params when they change
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.opportunityRating) params.set('rating', filters.opportunityRating);
    if (filters.jurisdiction) params.set('jurisdiction', filters.jurisdiction);
    if (filters.projectType) params.set('projectType', filters.projectType);
    if (filters.search) params.set('search', filters.search);

    setSearchParams(params, { replace: true });
  }, [filters.opportunityRating, filters.jurisdiction, filters.projectType, filters.search, setSearchParams]);

  const [searchInput, setSearchInput] = useState(filters.search || '');
  const [scraperStatus, setScraperStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [scraperMessage, setScraperMessage] = useState('');
  const [showScraperModal, setShowScraperModal] = useState(false);

  // Date range state for scraper - default to last 7 days
  const getDefaultDates = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 7);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    };
  };
  const [dateRange, setDateRange] = useState(getDefaultDates);

  const { data, isLoading, error } = usePermits(filters);

  const triggerScraper = async () => {
    setScraperStatus('loading');
    setScraperMessage('');
    setShowScraperModal(false);

    try {
      const response = await fetch('/.netlify/functions/trigger-scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runScoring: true,
          startDate: dateRange.start,
          endDate: dateRange.end,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setScraperStatus('success');
        setScraperMessage(`Scraper triggered for ${dateRange.start} to ${dateRange.end}! Check back in a few minutes.`);
        // Reset status after 5 seconds
        setTimeout(() => {
          setScraperStatus('idle');
          setScraperMessage('');
        }, 5000);
      } else {
        setScraperStatus('error');
        setScraperMessage(result.message || result.error || 'Failed to trigger scraper');
      }
    } catch (err) {
      setScraperStatus('error');
      setScraperMessage(err instanceof Error ? err.message : 'Failed to trigger scraper');
    }
  };

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);
  const currentPage = Math.floor((filters.offset || 0) / PAGE_SIZE) + 1;

  const hasActiveFilters = filters.jurisdiction || filters.projectType || filters.opportunityRating || filters.search || filters.minScore || filters.minValue;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, search: searchInput, offset: 0 }));
  };

  const handleFilterChange = (key: keyof PermitFilters, value: string | number | undefined) => {
    // Handle numeric values for minScore and minValue
    if ((key === 'minScore' || key === 'minValue') && typeof value === 'string') {
      const numValue = value ? parseInt(value, 10) : undefined;
      setFilters((f) => ({ ...f, [key]: numValue, offset: 0 }));
    } else {
      setFilters((f) => ({ ...f, [key]: value || undefined, offset: 0 }));
    }
  };

  const handlePageChange = (newPage: number) => {
    setFilters((f) => ({ ...f, offset: (newPage - 1) * PAGE_SIZE }));
  };

  const clearFilters = () => {
    setFilters({
      sortBy: 'created_at',
      sortOrder: 'desc',
      limit: PAGE_SIZE,
      offset: 0,
      minScore: undefined,
      minValue: undefined,
    });
    setSearchInput('');
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-clipper-navy">Permits</h1>
          <p className="mt-1 text-gray-500">
            Browse and filter permit opportunities for <span className="text-clipper-gold font-medium">Clipper Construction</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scraperMessage && (
            <span className={`text-sm ${scraperStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {scraperMessage}
            </span>
          )}
          <button
            onClick={() => setShowScraperModal(true)}
            disabled={scraperStatus === 'loading'}
            className="inline-flex items-center gap-2 px-4 py-2 bg-clipper-gold text-clipper-navy font-semibold rounded-lg hover:bg-clipper-gold-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scraperStatus === 'loading' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Calendar className="w-4 h-4" />
            )}
            {scraperStatus === 'loading' ? 'Running...' : 'Run Scraper'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search permits..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </form>

          {/* Filter Dropdowns */}
          <div className="flex flex-wrap gap-3">
            <select
              value={filters.jurisdiction || ''}
              onChange={(e) => handleFilterChange('jurisdiction', e.target.value as Jurisdiction)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Jurisdictions</option>
              {Object.entries(JURISDICTION_NAMES).map(([key, name]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </select>

            <select
              value={filters.projectType || ''}
              onChange={(e) => handleFilterChange('projectType', e.target.value as ProjectType)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Project Types</option>
              {Object.entries(PROJECT_TYPE_NAMES).map(([key, name]) => (
                <option key={key} value={key}>{name}</option>
              ))}
            </select>

            <select
              value={filters.opportunityRating || ''}
              onChange={(e) => handleFilterChange('opportunityRating', e.target.value as OpportunityRating)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Ratings</option>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cold">Cold</option>
              <option value="not_relevant">Not Relevant</option>
            </select>

            <select
              value={filters.sortBy || 'created_at'}
              onChange={(e) => handleFilterChange('sortBy', e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="created_at">Sort by: Date Added</option>
              <option value="overall_score">Sort by: AI Score</option>
              <option value="estimated_value">Sort by: Est. Value</option>
              <option value="submission_date">Sort by: Submission Date</option>
            </select>
          </div>
        </div>

        {/* Advanced Filters Row */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t">
          {/* Minimum Score Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="minScore" className="text-sm text-gray-600 whitespace-nowrap">
              Min Score:
            </label>
            <select
              id="minScore"
              value={filters.minScore?.toString() || ''}
              onChange={(e) => handleFilterChange('minScore', e.target.value)}
              className="px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Any</option>
              <option value="25">25+</option>
              <option value="50">50+</option>
              <option value="75">75+</option>
              <option value="90">90+</option>
            </select>
          </div>

          {/* Minimum Value Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="minValue" className="text-sm text-gray-600 whitespace-nowrap">
              Min Value:
            </label>
            <select
              id="minValue"
              value={filters.minValue?.toString() || ''}
              onChange={(e) => handleFilterChange('minValue', e.target.value)}
              className="px-2 py-1 text-sm border border-gray-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Any</option>
              <option value="50000">$50K+</option>
              <option value="100000">$100K+</option>
              <option value="250000">$250K+</option>
              <option value="500000">$500K+</option>
              <option value="1000000">$1M+</option>
            </select>
          </div>

          {/* Quick Filter: Hot & Warm Only */}
          <button
            onClick={() => {
              if (filters.minScore === 50) {
                handleFilterChange('minScore', undefined);
              } else {
                handleFilterChange('minScore', '50');
              }
            }}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              filters.minScore === 50
                ? 'bg-amber-100 text-amber-700 border border-amber-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Hot & Warm Only
          </button>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-3 py-1 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading permits...</div>
      ) : error ? (
        <div className="card p-12 text-center">
          <p className="text-red-500 mb-4">Error loading permits</p>
          <p className="text-gray-500 text-sm">
            Please ensure Supabase is configured correctly and the database schema has been created.
            <br />
            Check that VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables are set.
          </p>
        </div>
      ) : data?.data.length === 0 ? (
        <div className="card p-12 text-center">
          {hasActiveFilters ? (
            <>
              <p className="text-gray-600 mb-4">No permits found matching your filters.</p>
              <button
                onClick={clearFilters}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Clear all filters
              </button>
            </>
          ) : (
            <>
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-600 mb-2 font-medium">No permits in the database yet</p>
              <p className="text-gray-500 text-sm mb-6">
                Run the scraper to fetch commercial permit data from Howard County,
                <br />
                Baltimore City, and Anne Arundel County.
              </p>
              {scraperMessage && (
                <p className={`text-sm mb-4 ${scraperStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                  {scraperMessage}
                </p>
              )}
              <button
                onClick={triggerScraper}
                disabled={scraperStatus === 'loading'}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {scraperStatus === 'loading' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Play className="w-5 h-5" />
                )}
                {scraperStatus === 'loading' ? 'Triggering Scraper...' : 'Run Scraper'}
              </button>
              <p className="text-gray-400 text-xs mt-4">
                The scraper will run in the background. Check back in a few minutes for new permits.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              Showing {((currentPage - 1) * PAGE_SIZE) + 1} - {Math.min(currentPage * PAGE_SIZE, data?.count || 0)} of {data?.count || 0} permits
            </span>
          </div>

          <div className="space-y-4">
            {data?.data.map((permit) => (
              <PermitCard key={permit.id} permit={permit} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }

                  return (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-10 h-10 rounded-lg font-medium ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'border border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Scraper Date Range Modal */}
      {showScraperModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Run Permit Scraper
            </h3>
            <p className="text-gray-600 mb-4">
              Select a date range to scrape permits. The scraper will search for permits filed within this range.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={dateRange.start}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={dateRange.end}
                  onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Note: Permits already in the database will be updated. New permits will be added and scored.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowScraperModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={triggerScraper}
                className="inline-flex items-center gap-2 px-4 py-2 bg-clipper-gold text-clipper-navy font-semibold rounded-lg hover:bg-clipper-gold-dark transition-colors"
              >
                <Play className="w-4 h-4" />
                Start Scraper
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
