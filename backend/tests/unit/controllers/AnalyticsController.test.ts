import { Request, Response } from 'express';
import { getDashboardData, generateReport, exportData } from '../../controllers/AnalyticsController';
import { AnalyticsService } from '../../AnalyticsService';
import { mockRequest, mockResponse } from '../mocks';

jest.mock('../../AnalyticsService');

const MockedAnalyticsService = AnalyticsService as jest.MockedClass<typeof AnalyticsService>;

describe('AnalyticsController', () => {
  let mockAnalyticsService: any;
  let req: Request;
  let res: Response;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAnalyticsService = {
      getBillingStats: jest.fn(),
      getDailyRevenue: jest.fn(),
      getUserGrowth: jest.fn(),
      predictRevenue: jest.fn(),
      saveReport: jest.fn(),
      exportRevenueData: jest.fn()
    };
    MockedAnalyticsService.mockImplementation(() => mockAnalyticsService);
    req = mockRequest();
    res = mockResponse();
  });

  describe('getDashboardData', () => {
    it('should return dashboard data successfully', async () => {
      const mockStats = {
        totalRevenue: 10000,
        overdueBills: 25,
        pendingBills: 50
      };
      const mockRevenueChart = [
        { date: '2023-01-01', value: 100 },
        { date: '2023-01-02', value: 150 }
      ];
      const mockUserGrowth = [
        { date: '2023-01-01', count: 5 },
        { date: '2023-01-02', count: 3 }
      ];
      const mockPrediction = {
        predictedDailyRevenue: 125,
        predictedMonthlyRevenue: 3750,
        trend: 'UP',
        confidence: 'MEDIUM'
      };

      mockAnalyticsService.getBillingStats.mockResolvedValue(mockStats);
      mockAnalyticsService.getDailyRevenue.mockResolvedValue(mockRevenueChart);
      mockAnalyticsService.getUserGrowth.mockResolvedValue(mockUserGrowth);
      mockAnalyticsService.predictRevenue.mockResolvedValue(mockPrediction);

      await getDashboardData(req, res);

      expect(res.json).toHaveBeenCalledWith({
        summary: mockStats,
        charts: {
          revenue: mockRevenueChart,
          userGrowth: mockUserGrowth
        },
        prediction: mockPrediction
      });
    });

    it('should handle dashboard data retrieval errors', async () => {
      mockAnalyticsService.getBillingStats.mockRejectedValue(new Error('Database error'));

      await getDashboardData(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Failed to fetch dashboard data'
      });
    });

    it('should call all analytics services in parallel', async () => {
      mockAnalyticsService.getBillingStats.mockResolvedValue({});
      mockAnalyticsService.getDailyRevenue.mockResolvedValue([]);
      mockAnalyticsService.getUserGrowth.mockResolvedValue([]);
      mockAnalyticsService.predictRevenue.mockResolvedValue({});

      await getDashboardData(req, res);

      expect(mockAnalyticsService.getBillingStats).toHaveBeenCalled();
      expect(mockAnalyticsService.getDailyRevenue).toHaveBeenCalledWith(30);
      expect(mockAnalyticsService.getUserGrowth).toHaveBeenCalledWith(30);
      expect(mockAnalyticsService.predictRevenue).toHaveBeenCalled();
    });
  });

  describe('generateReport', () => {
    const validReportData = {
      title: 'Monthly Revenue Report',
      type: 'REVENUE',
      userId: 'user-123'
    };

    it('should generate revenue report successfully', async () => {
      req.body = validReportData;
      
      const mockRevenueData = [
        { date: '2023-01-01', value: 100 },
        { date: '2023-01-02', value: 150 }
      ];
      
      const mockReport = {
        id: 'report-123',
        title: validReportData.title,
        type: validReportData.type,
        data: mockRevenueData,
        createdBy: validReportData.userId,
        createdAt: new Date()
      };

      mockAnalyticsService.getDailyRevenue.mockResolvedValue(mockRevenueData);
      mockAnalyticsService.saveReport.mockResolvedValue(mockReport);

      await generateReport(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockReport);
      expect(mockAnalyticsService.getDailyRevenue).toHaveBeenCalledWith(30);
      expect(mockAnalyticsService.saveReport).toHaveBeenCalledWith(
        validReportData.userId,
        validReportData.title,
        validReportData.type,
        mockRevenueData
      );
    });

    it('should generate user growth report successfully', async () => {
      req.body = {
        ...validReportData,
        type: 'USER_GROWTH'
      };
      
      const mockUserGrowthData = [
        { date: '2023-01-01', count: 5 },
        { date: '2023-01-02', count: 3 }
      ];
      
      const mockReport = {
        id: 'report-123',
        title: validReportData.title,
        type: 'USER_GROWTH',
        data: mockUserGrowthData,
        createdBy: validReportData.userId,
        createdAt: new Date()
      };

      mockAnalyticsService.getUserGrowth.mockResolvedValue(mockUserGrowthData);
      mockAnalyticsService.saveReport.mockResolvedValue(mockReport);

      await generateReport(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockAnalyticsService.getUserGrowth).toHaveBeenCalledWith(30);
      expect(mockAnalyticsService.saveReport).toHaveBeenCalledWith(
        validReportData.userId,
        validReportData.title,
        'USER_GROWTH',
        mockUserGrowthData
      );
    });

    it('should generate billing stats report for unknown type', async () => {
      req.body = {
        ...validReportData,
        type: 'UNKNOWN_TYPE'
      };
      
      const mockStats = {
        totalRevenue: 10000,
        overdueBills: 25,
        pendingBills: 50
      };
      
      const mockReport = {
        id: 'report-123',
        title: validReportData.title,
        type: 'UNKNOWN_TYPE',
        data: mockStats,
        createdBy: validReportData.userId,
        createdAt: new Date()
      };

      mockAnalyticsService.getBillingStats.mockResolvedValue(mockStats);
      mockAnalyticsService.saveReport.mockResolvedValue(mockReport);

      await generateReport(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(mockAnalyticsService.getBillingStats).toHaveBeenCalled();
      expect(mockAnalyticsService.saveReport).toHaveBeenCalledWith(
        validReportData.userId,
        validReportData.title,
        'UNKNOWN_TYPE',
        mockStats
      );
    });

    it('should handle report generation errors', async () => {
      req.body = validReportData;
      
      mockAnalyticsService.getDailyRevenue.mockRejectedValue(new Error('Service error'));

      await generateReport(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Failed to generate report'
      });
    });

    it('should handle save report errors', async () => {
      req.body = validReportData;
      
      mockAnalyticsService.getDailyRevenue.mockResolvedValue([]);
      mockAnalyticsService.saveReport.mockRejectedValue(new Error('Database error'));

      await generateReport(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Failed to generate report'
      });
    });
  });

  describe('exportData', () => {
    it('should export revenue data as CSV', async () => {
      const mockCSV = 'Date,Revenue\n2023-01-01,100.50\n2023-01-02,150.75';
      
      mockAnalyticsService.exportRevenueData.mockResolvedValue(mockCSV);

      await exportData(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename=revenue_export.csv'
      );
      expect(res.send).toHaveBeenCalledWith(mockCSV);
    });

    it('should handle export errors', async () => {
      mockAnalyticsService.exportRevenueData.mockRejectedValue(new Error('Export error'));

      await exportData(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
         success: false,
        error: 'Failed to export data'
      });
    });
  });
});
