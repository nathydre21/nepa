import React, { useState, useMemo, useEffect } from 'react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Loading } from './Loading';

interface Payment {
  id: string;
  date: Date;
  amount: number;
  meterId: string;
  status: 'completed' | 'pending' | 'failed';
  type: string;
}

interface UsageData {
  date: string;
  consumption: number;
  cost: number;
}

interface BudgetData {
  category: string;
  allocated: number;
  spent: number;
  remaining: number;
}

interface UpcomingBill {
  id: string;
  dueDate: Date;
  amount: number;
  meterId: string;
  type: string;
}

const Dashboard: React.FC = () => {
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>('month');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // Simulate data fetching
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      setLoading(false);
    };
    
    fetchData();
  }, []);

  // Mock data - in real app, this would come from API
  const payments: Payment[] = useMemo(() => [
    { id: '1', date: subDays(new Date(), 2), amount: 45.50, meterId: 'METER-001', status: 'completed', type: 'Electricity' },
    { id: '2', date: subDays(new Date(), 5), amount: 38.20, meterId: 'METER-001', status: 'completed', type: 'Electricity' },
    { id: '3', date: subDays(new Date(), 8), amount: 52.75, meterId: 'METER-002', status: 'completed', type: 'Electricity' },
    { id: '4', date: subDays(new Date(), 12), amount: 41.30, meterId: 'METER-001', status: 'pending', type: 'Electricity' },
    { id: '5', date: subDays(new Date(), 15), amount: 48.90, meterId: 'METER-002', status: 'completed', type: 'Electricity' },
    { id: '6', date: subDays(new Date(), 18), amount: 35.60, meterId: 'METER-001', status: 'failed', type: 'Electricity' },
  ], []);

  const usageData: UsageData[] = useMemo(() => [
    { date: 'Jan', consumption: 320, cost: 42.50 },
    { date: 'Feb', consumption: 280, cost: 37.20 },
    { date: 'Mar', consumption: 350, cost: 46.75 },
    { date: 'Apr', consumption: 290, cost: 38.30 },
    { date: 'May', consumption: 310, cost: 41.90 },
    { date: 'Jun', consumption: 340, cost: 45.60 },
  ], []);

  const budgetData: BudgetData[] = useMemo(() => [
    { category: 'Electricity', allocated: 200, spent: 145.50, remaining: 54.50 },
    { category: 'Water', allocated: 80, spent: 62.30, remaining: 17.70 },
    { category: 'Gas', allocated: 120, spent: 98.75, remaining: 21.25 },
  ], []);

  const upcomingBills: UpcomingBill[] = useMemo(() => [
    { id: '1', dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), amount: 48.75, meterId: 'METER-001', type: 'Electricity' },
    { id: '2', dueDate: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000), amount: 35.20, meterId: 'METER-002', type: 'Electricity' },
    { id: '3', dueDate: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000), amount: 28.50, meterId: 'METER-003', type: 'Water' },
  ], []);

  const consumptionTrendData = useMemo(() => [
    { time: '00:00', consumption: 12 },
    { time: '04:00', consumption: 8 },
    { time: '08:00', consumption: 25 },
    { time: '12:00', consumption: 35 },
    { time: '16:00', consumption: 30 },
    { time: '20:00', consumption: 28 },
    { time: '23:00', consumption: 15 },
  ], []);

  const filteredPayments = useMemo(() => {
    return payments.filter(payment => {
      const matchesFilter = paymentFilter === 'all' || payment.status === paymentFilter;
      const matchesSearch = searchTerm === '' ||
        payment.meterId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.type.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [payments, paymentFilter, searchTerm]);

  const totalSpent = payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amount, 0);

  const avgMonthlyBill = totalSpent / 6; // Assuming 6 months of data

  const successRate = payments.length > 0 
    ? Math.round((payments.filter(p => p.status === 'completed').length / payments.length) * 100)
    : 0;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading size="lg" label="Loading dashboard data..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-3 sm:p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-2">
            User Dashboard
          </h1>
          <p className="text-sm sm:text-base text-gray-600">
            Monitor your utility payments and consumption
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-white rounded-lg shadow-sm sm:shadow p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Total Spent</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">${totalSpent.toFixed(2)}</p>
              </div>
              <div className="bg-blue-100 rounded-full p-2 sm:p-3 ml-3">
                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm sm:shadow p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Avg Monthly Bill</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">${avgMonthlyBill.toFixed(2)}</p>
              </div>
              <div className="bg-green-100 rounded-full p-2 sm:p-3 ml-3">
                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm sm:shadow p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Pending Bills</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{upcomingBills.length}</p>
              </div>
              <div className="bg-yellow-100 rounded-full p-2 sm:p-3 ml-3">
                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm sm:shadow p-4 sm:p-6 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs sm:text-sm font-medium text-gray-600 mb-1">Success Rate</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">{successRate}%</p>
              </div>
              <div className="bg-purple-100 rounded-full p-2 sm:p-3 ml-3">
                <svg className="w-4 h-4 sm:w-6 sm:h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">This Month</p>
                <p className="text-2xl font-bold text-gray-900">$145.50</p>
              </div>
              <div className="bg-purple-100 rounded-full p-3">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Usage Chart */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Monthly Usage & Cost</h2>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={usageData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis yAxisId="left" />
                <YAxis yAxisId="right" orientation="right" />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="consumption" fill="#3b82f6" name="Consumption (kWh)" />
                <Line yAxisId="right" type="monotone" dataKey="cost" stroke="#10b981" name="Cost ($)" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Budget Overview */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Budget Overview</h2>
            <ResponsiveContainer width="100%" height={300}>
          {/* Consumption Trends */}
          <div className="bg-white rounded-lg shadow-sm sm:shadow p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
              Daily Consumption Pattern
            </h2>
            <div className="h-48 sm:h-64 lg:h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={consumptionTrendData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 12 }}
                    className="text-xs sm:text-sm"
                  />
                  <YAxis 
                    tick={{ fontSize: 12 }}
                    className="text-xs sm:text-sm"
                  />
                  <Tooltip 
                    contentStyle={{
                      backgroundColor: 'rgba(0, 0, 0, 0.8)',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="consumption" 
                    stroke="#8b5cf6" 
                    fill="#8b5cf6" 
                    fillOpacity={0.3}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Upcoming Bills */}
          <div className="bg-white rounded-lg shadow-sm sm:shadow p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
              Upcoming Bills
            </h2>
            <div className="space-y-2 sm:space-y-3 max-h-48 sm:max-h-64 lg:max-h-80 overflow-y-auto">
              {upcomingBills.map((bill) => (
                <div 
                  key={bill.id} 
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors duration-200"
                >
                  <div className="mb-2 sm:mb-0">
                    <p className="font-medium text-gray-900 text-sm sm:text-base">{bill.type}</p>
                    <p className="text-xs sm:text-sm text-gray-600">{bill.meterId}</p>
                    <p className="text-xs text-gray-500">
                      Due: {format(bill.dueDate, 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base">
                      ${bill.amount.toFixed(2)}
                    </p>
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 mt-1 sm:mt-0">
                      {Math.ceil((bill.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Payment History */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 sm:mb-0">Payment History</h2>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Search by meter or type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={paymentFilter}
                  onChange={(e) => setPaymentFilter(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="completed">Completed</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meter ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {format(payment.date, 'MMM dd, yyyy')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{payment.meterId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{payment.type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${payment.amount.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${payment.status === 'completed' ? 'bg-green-100 text-green-800' :
                        payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                        {payment.status}
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
  );
};

export default Dashboard;
