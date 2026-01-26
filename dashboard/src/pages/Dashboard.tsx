import { FileText, Flame, ThermometerSun, Snowflake } from 'lucide-react';
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
import PermitCard from '../components/PermitCard';
import {
  useDashboardStats,
  usePermitsByType,
  usePermitsByJurisdiction,
  useHotOpportunities,
} from '../hooks/usePermits';
import { PROJECT_TYPE_NAMES, JURISDICTION_NAMES, type ProjectType, type Jurisdiction } from '../types';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function Dashboard() {
  const { data: stats } = useDashboardStats();
  const { data: byType } = usePermitsByType();
  const { data: byJurisdiction } = usePermitsByJurisdiction();
  const { data: hotOpportunities, isLoading: hotLoading } = useHotOpportunities(5);

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
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-500">
          Overview of permit opportunities and AI-scored leads
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Permits"
          value={stats?.total_permits || 0}
          icon={FileText}
          color="blue"
        />
        <StatCard
          title="Hot Opportunities"
          value={stats?.hot_opportunities || 0}
          icon={Flame}
          color="red"
        />
        <StatCard
          title="Warm Opportunities"
          value={stats?.warm_opportunities || 0}
          icon={ThermometerSun}
          color="amber"
        />
        <StatCard
          title="Cold Opportunities"
          value={stats?.cold_opportunities || 0}
          icon={Snowflake}
          color="blue"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Project Type */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Permits by Project Type
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeChartData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* By Jurisdiction */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
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

      {/* Hot Opportunities */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Flame className="w-5 h-5 text-red-500" />
            Top Hot Opportunities
          </h2>
          <a href="/permits?rating=hot" className="text-sm text-blue-600 hover:text-blue-700">
            View all →
          </a>
        </div>

        {hotLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : hotOpportunities && hotOpportunities.length > 0 ? (
          <div className="space-y-4">
            {hotOpportunities.map((permit) => (
              <PermitCard key={permit.id} permit={permit} />
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No hot opportunities found. Run the scraper to collect permit data.
          </div>
        )}
      </div>
    </div>
  );
}
