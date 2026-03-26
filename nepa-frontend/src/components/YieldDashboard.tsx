import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { Loading } from './Loading';

interface YieldData {
  date: string;
  totalYield: number;
  apr: number;
  tvl: number;
}

interface PositionData {
  id: string;
  strategy: string;
  amount: number;
  earnedYield: number;
  apr: number;
  riskLevel: string;
}

interface AlertData {
  id: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  timestamp: Date;
}

const YieldDashboard: React.FC = () => {
  const [yieldData, setYieldData] = useState<YieldData[]>([]);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('7d');
  const [totalInvested, setTotalInvested] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  useEffect(() => {
    fetchYieldData();
    fetchPositions();
    fetchAlerts();
    
    const interval = setInterval(() => {
      fetchYieldData();
      fetchAlerts();
    }, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [selectedPeriod]);

  const fetchYieldData = async () => {
    try {
      setLoading(true);
      // Mock data - in production, fetch from API
      const mockData: YieldData[] = [
        { date: '2024-01-01', totalYield: 100, apr: 5.2, tvl: 10000 },
        { date: '2024-01-02', totalYield: 105, apr: 5.3, tvl: 10500 },
        { date: '2024-01-03', totalYield: 110, apr: 5.1, tvl: 11000 },
        { date: '2024-01-04', totalYield: 118, apr: 5.4, tvl: 11800 },
        { date: '2024-01-05', totalYield: 125, apr: 5.6, tvl: 12500 },
        { date: '2024-01-06', totalYield: 132, apr: 5.5, tvl: 13200 },
        { date: '2024-01-07', totalYield: 140, apr: 5.7, tvl: 14000 },
      ];
      
      setYieldData(mockData);
      
      const total = mockData.reduce((sum, data) => sum + data.totalYield, 0);
      setTotalEarned(total);
      setTotalInvested(10000);
      
    } catch (error) {
      console.error('Error fetching yield data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPositions = async () => {
    try {
      // Mock data - in production, fetch from API
      const mockPositions: PositionData[] = [
        {
          id: '1',
          strategy: 'XLM-USDC Stable Pool',
          amount: 5000,
          earnedYield: 75,
          apr: 5.2,
          riskLevel: 'Low'
        },
        {
          id: '2',
          strategy: 'XLM-YXLM Pool',
          amount: 3000,
          earnedYield: 45,
          apr: 12.1,
          riskLevel: 'Medium'
        },
        {
          id: '3',
          strategy: 'DeFi Lending',
          amount: 2000,
          earnedYield: 20,
          apr: 18.5,
          riskLevel: 'High'
        }
      ];
      
      setPositions(mockPositions);
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const fetchAlerts = async () => {
    try {
      // Mock data - in production, fetch from API
      const mockAlerts: AlertData[] = [
        {
          id: '1',
          type: 'opportunity',
          message: 'New high-yield opportunity detected in stable pool',
          severity: 'info',
          timestamp: new Date()
        },
        {
          id: '2',
          type: 'performance',
          message: 'Portfolio performance: +2.3% this week',
          severity: 'info',
          timestamp: new Date(Date.now() - 3600000)
        }
      ];
      
      setAlerts(mockAlerts);
    } catch (error) {
      console.error('Error fetching alerts:', error);
    }
  };

  const pieData = positions.map(position => ({
    name: position.strategy,
    value: position.amount
  }));

  const barData = positions.map(position => ({
    strategy: position.strategy.split(' ')[0],
    apr: position.apr,
    yield: position.earnedYield
  }));

  const currentAPR = positions.length > 0 
    ? positions.reduce((sum, p) => sum + p.apr * (p.amount / totalInvested), 0)
    : 0;

  const formatYield = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'warning': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (loading && yieldData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" label="Loading yield data..." />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Yield Generation Dashboard</h1>
          <p className="text-gray-600 text-sm sm:text-base">Monitor and manage your DeFi yield positions</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-2">Total Invested</h3>
            <p className="text-xl sm:text-2xl font-bold text-gray-900">{formatYield(totalInvested)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-2">Total Earned</h3>
            <p className="text-xl sm:text-2xl font-bold text-green-600">{formatYield(totalEarned)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-2">Current APR</h3>
            <p className="text-xl sm:text-2xl font-bold text-blue-600">{formatPercentage(currentAPR)}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-xs sm:text-sm font-medium text-gray-500 mb-2">Active Positions</h3>
            <p className="text-xl sm:text-2xl font-bold text-purple-600">{positions.length}</p>
          </div>
        </div>

        {/* Period Selector */}
        <div className="mb-6">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
          >
            <option value="1d">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Yield Over Time */}
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-4">Yield Performance</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={yieldData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip formatter={(value) => formatYield(Number(value))} />
                <Legend />
                <Line type="monotone" dataKey="totalYield" stroke="#8884d8" name="Total Yield" />
                <Line type="monotone" dataKey="tvl" stroke="#82ca9d" name="TVL" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Portfolio Distribution */}
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-4">Portfolio Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => {
                    const displayName = name.split(' ')[0];
                    return `${displayName} ${(percent * 100).toFixed(0)}%`;
                  }}
                  outerRadius={60}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatYield(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Strategy Performance */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-4">Strategy Performance</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="strategy" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="apr" fill="#8884d8" name="APR (%)" />
                <Bar dataKey="yield" fill="#82ca9d" name="Yield Earned" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Positions Table */}
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-4">Active Positions</h3>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <div className="inline-block min-w-full align-middle">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 sm:px-0 text-xs sm:text-sm">Strategy</th>
                      <th className="text-right py-2 px-2 sm:px-0 text-xs sm:text-sm">Amount</th>
                      <th className="text-right py-2 px-2 sm:px-0 text-xs sm:text-sm hidden sm:table-cell">APR</th>
                      <th className="text-right py-2 px-2 sm:px-0 text-xs sm:text-sm hidden md:table-cell">Yield</th>
                      <th className="text-center py-2 px-2 sm:px-0 text-xs sm:text-sm">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {positions.map((position) => (
                      <tr key={position.id} className="border-b">
                        <td className="py-2 px-2 sm:px-0 text-xs sm:text-sm">
                          <div className="truncate max-w-[100px] sm:max-w-none">
                            {position.strategy}
                          </div>
                        </td>
                        <td className="text-right py-2 px-2 sm:px-0 text-xs sm:text-sm">{formatYield(position.amount)}</td>
                        <td className="text-right py-2 px-2 sm:px-0 text-xs sm:text-sm hidden sm:table-cell">{formatPercentage(position.apr)}</td>
                        <td className="text-right py-2 px-2 sm:px-0 text-xs sm:text-sm hidden md:table-cell">{formatYield(position.earnedYield)}</td>
                        <td className="text-center py-2 px-2 sm:px-0">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            position.riskLevel === 'Low' ? 'bg-green-100 text-green-800' :
                            position.riskLevel === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {position.riskLevel}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Alerts Section */}
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-4">Recent Alerts</h3>
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <p className="text-gray-500 text-sm sm:text-base">No recent alerts</p>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}
                >
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                    <div className="flex-1">
                      <p className="font-medium text-sm sm:text-base">{alert.message}</p>
                      <p className="text-xs sm:text-sm opacity-75">
                        {alert.timestamp.toLocaleString()}
                      </p>
                    </div>
                    <span className="text-xs font-medium uppercase whitespace-nowrap">
                      {alert.severity}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default YieldDashboard;
