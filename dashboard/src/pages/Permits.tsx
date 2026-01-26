import { useState } from 'react';
import { Search, ChevronLeft, ChevronRight, Play, Loader2 } from 'lucide-react';
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
  const [filters, setFilters] = useState<PermitFilters>({
    sortBy: 'created_at',
    sortOrder: 'desc',
    limit: PAGE_SIZE,
    offset: 0,
  });

  const [searchInput, setSearchInput] = useState('');
  const [scraperStatus, setScraperStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [scraperMessage, setScraperMessage] = useState('');

  const { data, isLoading, error } = usePermits(filters);

  const triggerScraper = async () => {
    setScraperStatus('loading');
    setScraperMessage('');

    try {
      const response = await fetch('/.netlify/functions/trigger-scraper', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          runScoring: true,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setScraperStatus('success');
        setScraperMessage('Scraper triggered! Check back in a few minutes for new permits.');
        // Reset status after 5 seconds
        setTimeout(() => {
          setScraperStatus('idle');
          setScraperMessage('');
        }, 5000);
      } else {
        setScraperStatus('error');
        setScraperMessage(data.message || data.error || 'Failed to trigger scraper');
      }
    } catch (err) {
      setScraperStatus('error');
      setScraperMessage(err instanceof Error ? err.message : 'Failed to trigger scraper');
    }
  };

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);
  const currentPage = Math.floor((filters.offset || 0) / PAGE_SIZE) + 1;

  const hasActiveFilters = filters.jurisdiction || filters.projectType || filters.opportunityRating || filters.search;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, search: searchInput, offset: 0 }));
  };

  const handleFilterChange = (key: keyof PermitFilters, value: string | undefined) => {
    setFilters((f) => ({ ...f, [key]: value || undefined, offset: 0 }));
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
    });
    setSearchInput('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permits</h1>
          <p className="mt-1 text-gray-500">
            Browse and filter permit opportunities
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scraperMessage && (
            <span className={`text-sm ${scraperStatus === 'success' ? 'text-green-600' : 'text-red-600'}`}>
              {scraperMessage}
            </span>
          )}
          <button
            onClick={triggerScraper}
            disabled={scraperStatus === 'loading'}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scraperStatus === 'loading' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {scraperStatus === 'loading' ? 'Triggering...' : 'Run Scraper'}
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
              <option value="overall_score">Sort by: Score</option>
              <option value="submission_date">Sort by: Submission Date</option>
            </select>
          </div>
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
    </div>
  );
}
