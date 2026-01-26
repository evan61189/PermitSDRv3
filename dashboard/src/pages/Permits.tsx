import { useState } from 'react';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
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

  const { data, isLoading, error } = usePermits(filters);

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);
  const currentPage = Math.floor((filters.offset || 0) / PAGE_SIZE) + 1;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Permits</h1>
        <p className="mt-1 text-gray-500">
          Browse and filter permit opportunities
        </p>
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
        <div className="text-center py-12 text-red-500">
          Error loading permits. Please try again.
        </div>
      ) : data?.data.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500">No permits found matching your criteria.</p>
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
