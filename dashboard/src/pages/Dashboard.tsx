import { FileText, Flame, ThermometerSun, Snowflake, MapPin, Users, Building2, DollarSign, TrendingUp, Sparkles, Eye, Download, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts';
import StatCard from '../components/StatCard';
import OpportunityMap from '../components/OpportunityMap';
import {
  useDashboardStats,
  usePermitsByType,
  usePermitsByJurisdiction,
  usePermitsForMap,
  useTopApplicants,
  useTopApplicantsByCounty,
  useTopContractors,
  useValueInsights,
  usePermitTrends,
  useCompaniesToWatch,
  useProjectTypeTrends,
  useAIRecommendations,
  useExportInsights,
} from '../hooks/usePermits';
import { PROJECT_TYPE_NAMES, JURISDICTION_NAMES, type ProjectType, type Jurisdiction } from '../types';

// Clipper Construction brand colors for charts
const COLORS = ['#F9A825', '#2D3436', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// Helper to format currency
const formatCurrency = (value: number) => {
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(1)}M`;
  } else if (value >= 1000) {
    return `$${(value / 1000).toFixed(0)}K`;
  }
  return `$${value.toFixed(0)}`;
};

export default function Dashboard() {
  const { data: stats } = useDashboardStats();
  const { data: byType } = usePermitsByType();
  const { data: byJurisdiction } = usePermitsByJurisdiction();
  const { data: mapPermits, isLoading: mapLoading } = usePermitsForMap(100);
  const { data: topApplicants, isLoading: applicantsLoading } = useTopApplicants(5);
  const { data: applicantsByCounty, isLoading: countyLoading } = useTopApplicantsByCounty(3);
  const { data: topContractors, isLoading: contractorsLoading } = useTopContractors(5);
  const { data: valueInsights, isLoading: valueLoading } = useValueInsights();
  const { data: permitTrends, isLoading: trendsLoading } = usePermitTrends(8);
  const { data: companiesToWatch, isLoading: watchLoading } = useCompaniesToWatch(5);
  const { data: typeTrends, isLoading: typeTrendsLoading } = useProjectTypeTrends();
  const { data: recommendations, isLoading: recsLoading } = useAIRecommendations();
  const { refetch: fetchExportData, isLoading: exportLoading } = useExportInsights();

  const handleExportCSV = async () => {
    const result = await fetchExportData();
    if (result.data) {
      // Convert permits to CSV
      const headers = ['Permit #', 'Description', 'Address', 'City', 'County', 'Applicant', 'Contractor', 'Est. Value', 'Type', 'Status', 'Submission Date', 'Rating', 'Score'];
      const rows = result.data.permits.map(p => [
        p.permit_number,
        `"${(p.description || '').replace(/"/g, '""')}"`,
        `"${(p.address || '').replace(/"/g, '""')}"`,
        p.city,
        p.county,
        `"${(p.applicant_name || '').replace(/"/g, '""')}"`,
        `"${(p.contractor_name || '').replace(/"/g, '""')}"`,
        p.estimated_value,
        p.project_type,
        p.status,
        p.submission_date,
        p.opportunity_rating,
        p.overall_score,
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `permit-insights-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const typeChartData = byType?.map((item) => ({
    name: PROJECT_TYPE_NAMES[item.type as ProjectType] || item.type,
    value: item.count,
  })) || [];

  const jurisdictionChartData = byJurisdiction?.map((item) => ({
    name: JURISDICTION_NAMES[item.jurisdiction as Jurisdiction] || item.jurisdiction,
    value: item.count,
  })) || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-clipper-navy">Dashboard</h1>
          <p className="mt-1 text-gray-500">
            Commercial permit opportunities for <span className="text-clipper-gold font-medium">Clipper Construction</span>
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={exportLoading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-clipper-navy text-white rounded-lg hover:bg-clipper-navy-light transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {exportLoading ? 'Exporting...' : 'Export CSV'}
        </button>
      </div>

      {/* Stats Grid - Clickable Kanban Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Permits"
          value={stats?.total_permits || 0}
          icon={FileText}
          color="blue"
          href="/permits"
        />
        <StatCard
          title="Hot Opportunities"
          value={stats?.hot_opportunities || 0}
          icon={Flame}
          color="red"
          href="/permits?rating=hot"
        />
        <StatCard
          title="Warm Opportunities"
          value={stats?.warm_opportunities || 0}
          icon={ThermometerSun}
          color="amber"
          href="/permits?rating=warm"
        />
        <StatCard
          title="Cold Opportunities"
          value={stats?.cold_opportunities || 0}
          icon={Snowflake}
          color="blue"
          href="/permits?rating=cold"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Project Type */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-clipper-navy mb-4">
            Permits by Project Type
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#F9A825" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Jurisdiction */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-clipper-navy mb-4">
            Permits by Jurisdiction
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={jurisdictionChartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }: { name: string; value: number }) => `${name}: ${value}`}
                >
                  {jurisdictionChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* AI Recommendations */}
      <div className="card p-6 border-l-4 border-clipper-gold">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-clipper-navy flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-clipper-gold" />
            AI Recommendations
          </h2>
        </div>
        {recsLoading ? (
          <div className="text-center py-4 text-gray-500">Analyzing data...</div>
        ) : recommendations && recommendations.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {recommendations.map((rec, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  rec.priority === 'high' ? 'bg-red-50 border-red-200' :
                  rec.priority === 'medium' ? 'bg-amber-50 border-amber-200' :
                  'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start gap-2 mb-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                    rec.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {rec.priority.toUpperCase()}
                  </span>
                </div>
                <h3 className="font-medium text-gray-900 text-sm mb-1">{rec.title}</h3>
                <p className="text-xs text-gray-600 mb-3">{rec.description}</p>
                {rec.actionLink && (
                  <a
                    href={rec.actionLink}
                    className="text-xs font-medium text-clipper-gold hover:text-clipper-gold-dark inline-flex items-center gap-1"
                  >
                    {rec.actionLabel} <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No recommendations yet. Collect more data to get insights.</div>
        )}
      </div>

      {/* Filing Trends & Companies to Watch */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Filing Trends */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-clipper-navy flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" />
              Permit Filing Trends
            </h2>
          </div>
          {trendsLoading ? (
            <div className="h-48 flex items-center justify-center text-gray-500">Loading...</div>
          ) : permitTrends && permitTrends.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={permitTrends}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      name === 'count' ? `${value} permits` : formatCurrency(value),
                      name === 'count' ? 'Permits' : 'Value'
                    ]}
                  />
                  <Area type="monotone" dataKey="count" stroke="#F9A825" fill="#F9A82533" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500">No trend data available</div>
          )}
        </div>

        {/* Companies to Watch */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-clipper-navy flex items-center gap-2">
              <Eye className="w-5 h-5 text-purple-500" />
              Companies to Watch
            </h2>
          </div>
          {watchLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : companiesToWatch && companiesToWatch.length > 0 ? (
            <div className="space-y-3">
              {companiesToWatch.map((company) => (
                <div key={company.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate text-sm">{company.name}</div>
                    <div className="text-xs text-gray-500">
                      {company.recentCount} permits (30d) · {formatCurrency(company.totalValue)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {company.isNew ? (
                      <span className="text-xs font-semibold px-2 py-0.5 bg-green-100 text-green-700 rounded">NEW</span>
                    ) : company.changePercent > 0 ? (
                      <span className="text-xs font-semibold text-green-600 flex items-center">
                        <ArrowUpRight className="w-3 h-3" />
                        {company.changePercent}%
                      </span>
                    ) : company.changePercent < 0 ? (
                      <span className="text-xs font-semibold text-red-600 flex items-center">
                        <ArrowDownRight className="w-3 h-3" />
                        {Math.abs(company.changePercent)}%
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400"><Minus className="w-3 h-3" /></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">Need more data to identify trends</div>
          )}
        </div>
      </div>

      {/* Project Type Trends */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-clipper-navy flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" />
            Project Type Trends
            <span className="text-xs font-normal text-gray-500">(30 day change)</span>
          </h2>
        </div>
        {typeTrendsLoading ? (
          <div className="text-center py-4 text-gray-500">Loading...</div>
        ) : typeTrends && typeTrends.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {typeTrends.slice(0, 6).map((trend) => (
              <div
                key={trend.type}
                className={`p-3 rounded-lg border ${
                  trend.trend === 'up' ? 'bg-green-50 border-green-200' :
                  trend.trend === 'down' ? 'bg-red-50 border-red-200' :
                  'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="text-xs text-gray-600 truncate">{trend.typeName}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-lg font-bold text-gray-900">{trend.recentCount}</span>
                  <span className={`text-xs font-semibold flex items-center ${
                    trend.trend === 'up' ? 'text-green-600' :
                    trend.trend === 'down' ? 'text-red-600' :
                    'text-gray-400'
                  }`}>
                    {trend.trend === 'up' && <ArrowUpRight className="w-3 h-3" />}
                    {trend.trend === 'down' && <ArrowDownRight className="w-3 h-3" />}
                    {trend.trend === 'stable' && <Minus className="w-3 h-3" />}
                    {trend.changePercent !== 0 && `${Math.abs(trend.changePercent)}%`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">No trend data available</div>
        )}
      </div>

      {/* Opportunity Map */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-clipper-navy flex items-center gap-2">
            <MapPin className="w-5 h-5 text-clipper-gold" />
            Opportunity Map
          </h2>
        </div>
        {mapLoading ? (
          <div className="h-80 flex items-center justify-center text-gray-500">
            Loading map...
          </div>
        ) : (
          <OpportunityMap permits={mapPermits || []} className="h-80" />
        )}
      </div>

      {/* Insights Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Value Summary */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-clipper-navy flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-green-500" />
              Value Summary
            </h2>
          </div>
          {valueLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : valueInsights ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-sm text-green-600 font-medium">Total Est. Value</div>
                  <div className="text-2xl font-bold text-green-700">
                    {formatCurrency(valueInsights.totalEstimatedValue)}
                  </div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-sm text-blue-600 font-medium">Average Value</div>
                  <div className="text-2xl font-bold text-blue-700">
                    {formatCurrency(valueInsights.averageValue)}
                  </div>
                </div>
              </div>
              <div className="bg-amber-50 rounded-lg p-4">
                <div className="text-sm text-amber-600 font-medium">Highest Value Project</div>
                <div className="text-2xl font-bold text-amber-700">
                  {formatCurrency(valueInsights.highestValue)}
                </div>
              </div>
              {valueInsights.valueByProjectType.length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-medium text-gray-600 mb-2">Top Value by Project Type</div>
                  <div className="space-y-2">
                    {valueInsights.valueByProjectType.slice(0, 3).map((item) => (
                      <div key={item.type} className="flex items-center justify-between text-sm">
                        <span className="text-gray-700">
                          {PROJECT_TYPE_NAMES[item.type as ProjectType] || item.type}
                        </span>
                        <span className="font-medium text-gray-900">
                          {formatCurrency(item.value)} ({item.count})
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No value data available</div>
          )}
        </div>

        {/* Top Applicants */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-clipper-navy flex items-center gap-2">
              <Users className="w-5 h-5 text-purple-500" />
              Top Applicants
            </h2>
          </div>
          {applicantsLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : topApplicants && topApplicants.length > 0 ? (
            <div className="space-y-3">
              {topApplicants.map((applicant, index) => (
                <div key={applicant.name} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{applicant.name}</div>
                    <div className="text-sm text-gray-500">
                      {applicant.count} permits · {formatCurrency(applicant.totalValue)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No applicant data available</div>
          )}
        </div>

        {/* Top Contractors */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-clipper-navy flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-500" />
              Top Contractors
            </h2>
          </div>
          {contractorsLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : topContractors && topContractors.length > 0 ? (
            <div className="space-y-3">
              {topContractors.map((contractor, index) => (
                <div key={contractor.name} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 font-bold text-sm">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{contractor.name}</div>
                    <div className="text-sm text-gray-500">
                      {contractor.count} permits · {formatCurrency(contractor.totalValue)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No contractor data available</div>
          )}
        </div>

        {/* Top Applicants by County */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-clipper-navy flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-500" />
              Top Applicants by County
            </h2>
          </div>
          {countyLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : applicantsByCounty && applicantsByCounty.length > 0 ? (
            <div className="space-y-4">
              {applicantsByCounty.map((county) => (
                <div key={county.county}>
                  <div className="font-medium text-gray-900 mb-2">
                    {JURISDICTION_NAMES[county.county as Jurisdiction] || county.county}
                  </div>
                  <div className="space-y-1 pl-3 border-l-2 border-indigo-200">
                    {county.applicants.map((applicant, idx) => (
                      <div key={applicant.name} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 truncate flex-1">
                          {idx + 1}. {applicant.name}
                        </span>
                        <span className="text-gray-500 ml-2">{applicant.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">No county data available</div>
          )}
        </div>
      </div>
    </div>
  );
}
