import { FileText, Flame, ThermometerSun, Snowflake, MapPin, Users, Building2, DollarSign, TrendingUp } from 'lucide-react';
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
      <div>
        <h1 className="text-2xl font-bold text-clipper-navy">Dashboard</h1>
        <p className="mt-1 text-gray-500">
          Commercial permit opportunities for <span className="text-clipper-gold font-medium">Clipper Construction</span>
        </p>
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
