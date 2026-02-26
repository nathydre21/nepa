import * as tf from '@tensorflow/tfjs';
import path from 'path';
import {
  TransactionFeatures,
  FraudDetectionResult,
  FraudRiskLevel,
  FraudType,
  FraudDetectionStatus,
  FraudModelConfig,
  FraudModelMetrics,
  MLTrainingData,
  FraudDetectionRequest,
  FraudDetectionResponse,
  AdaptiveLearningConfig,
  RealTimeMonitoringConfig
} from './types';

/** File URL for Node (pure tfjs has no file:// support; use absolute path + file URL for fetch). */
function modelFileUrl(relativeDir: string, file: string): string {
  const resolved = path.resolve(relativeDir, file);
  return 'file:///' + resolved.replace(/\\/g, '/');
}

export class FraudDetectionService {
  private model: tf.LayersModel | null = null;
  private modelConfig: FraudModelConfig;
  private adaptiveConfig: AdaptiveLearningConfig;
  private monitoringConfig: RealTimeMonitoringConfig;
  private featureScaler: tf.Normalizer | null = null;
  private trainingData: MLTrainingData[] = [];
  private isTraining: boolean = false;
  private readonly modelDir = './models/fraud-detection-model';

  constructor() {
    this.modelConfig = this.getDefaultModelConfig();
    this.adaptiveConfig = this.getDefaultAdaptiveConfig();
    this.monitoringConfig = this.getDefaultMonitoringConfig();
    this.initializeModel();
  }

  /**
   * Initialize or load the fraud detection model (uses pure @tensorflow/tfjs for portability).
   */
  private async initializeModel(): Promise<void> {
    try {
      try {
        const url = modelFileUrl(this.modelDir, 'model.json');
        this.model = await tf.loadLayersModel(url);
        console.log('Loaded existing fraud detection model');
      } catch {
        console.log('No existing model found, creating new one');
        this.model = this.createDefaultModel();
        await this.saveModel();
      }

      if (typeof tf.data !== 'undefined' && tf.data.normalize) {
        this.featureScaler = tf.data.normalize({ min: 0, max: 1 });
      }
    } catch (error) {
      console.error('Failed to initialize model:', error);
      throw new Error('Model initialization failed');
    }
  }

  /**
   * Create a default neural network model
   */
  private createDefaultModel(): tf.LayersModel {
    const model = tf.sequential({
      layers: [
        tf.layers.dense({
          inputShape: [50], // Number of features
          units: 128,
          activation: 'relu',
          kernelInitializer: 'heNormal'
        }),
        tf.layers.dropout({ rate: 0.3 }),
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          kernelInitializer: 'heNormal'
        }),
        tf.layers.dropout({ rate: 0.2 }),
        tf.layers.dense({
          units: 32,
          activation: 'relu',
          kernelInitializer: 'heNormal'
        }),
        tf.layers.dropout({ rate: 0.1 }),
        tf.layers.dense({
          units: 16,
          activation: 'relu',
          kernelInitializer: 'heNormal'
        }),
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid'
        })
      ]
    });

    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy', 'precision', 'recall']
    });

    return model;
  }

  /**
   * Extract features from transaction data
   */
  private extractFeatures(request: FraudDetectionRequest): number[] {
    const features = request.features;
    
    return [
      // Basic features
      features.amount,
      this.normalizeCurrency(features.currency),
      this.normalizeNetwork(features.network),
      this.normalizeTimestamp(features.timestamp),
      
      // User behavior features
      features.userTransactionCount24h / 100, // Normalize
      features.userTransactionCount7d / 100,
      features.userTransactionCount30d / 100,
      features.userAvgTransactionAmount / 10000,
      features.userTotalAmount24h / 10000,
      features.userTotalAmount7d / 10000,
      features.userTotalAmount30d / 10000,
      features.userAccountAge / 365, // Convert to years
      this.normalizeTimestamp(features.userLastLoginTime),
      features.userLoginFrequency / 7, // Normalize to weekly
      
      // Geographic features
      this.normalizeIPAddress(features.ipAddress),
      this.normalizeCountry(features.country),
      features.isHighRiskCountry ? 1 : 0,
      features.isVPN ? 1 : 0,
      features.isTor ? 1 : 0,
      features.distanceFromLastLocation / 10000, // Normalize km
      features.locationChangeTime / 24, // Convert to days
      
      // Device features
      this.normalizeDeviceId(features.deviceId),
      this.normalizeDeviceFingerprint(features.deviceFingerprint),
      this.normalizeUserAgent(features.userAgent),
      features.isNewDevice ? 1 : 0,
      features.deviceAge / 365, // Convert to years
      features.deviceTransactionCount / 100,
      
      // Temporal features
      features.hourOfDay / 24,
      features.dayOfWeek / 7,
      features.isWeekend ? 1 : 0,
      features.isBusinessHours ? 1 : 0,
      features.timeSinceLastTransaction / 60, // Convert to hours
      features.transactionVelocity / 10,
      
      // Network features
      this.normalizeBlockchainNetwork(features.blockchainNetwork),
      features.isCrossChain ? 1 : 0,
      (features.gasPrice || 0) / 1000,
      (features.confirmations || 0) / 100,
      (features.blockNumber || 0) / 1000000,
      
      // Pattern features
      features.isRecurringPayment ? 1 : 0,
      features.isUnusualAmount ? 1 : 0,
      features.isUnusualTime ? 1 : 0,
      features.isUnusualLocation ? 1 : 0,
      features.isUnusualDevice ? 1 : 0,
      features.amountDeviationFromAvg / 5,
      features.frequencyDeviationFromAvg / 5,
      
      // Risk indicators
      features.isBlacklistedAddress ? 1 : 0,
      features.isBlacklistedDevice ? 1 : 0,
      features.isBlacklistedIP ? 1 : 0,
      features.hasFailedTransactions ? 1 : 0,
      features.failedTransactionCount / 10,
      features.chargebackHistory / 5
    ];
  }

  /**
   * Detect fraud in real-time
   */
  async detectFraud(request: FraudDetectionRequest): Promise<FraudDetectionResponse> {
    const startTime = Date.now();
    
    try {
      if (!this.model) {
        throw new Error('Model not initialized');
      }

      // Extract and normalize features
      const features = this.extractFeatures(request);
      const featureTensor = tf.tensor2d([features]);
      
      // Make prediction
      const prediction = this.model.predict(featureTensor) as tf.Tensor;
      const riskScore = await prediction.data();
      
      // Clean up tensors
      featureTensor.dispose();
      prediction.dispose();
      
      const score = riskScore[0] * 100; // Convert to 0-100 scale
      const result = this.createDetectionResult(request, score);
      
      const processingTime = Date.now() - startTime;
      
      // Store for adaptive learning
      if (this.adaptiveConfig.enabled) {
        this.trainingData.push({
          id: this.generateId(),
          transactionId: request.transactionId,
          features: request.features,
          isFraud: result.riskLevel === FraudRiskLevel.CRITICAL,
          confidence: result.confidence,
          modelVersion: this.modelConfig.version,
          dataSource: 'automated',
          createdAt: new Date()
        });
      }

      return {
        success: true,
        result,
        processingTime
      };

    } catch (error) {
      console.error('Fraud detection failed:', error);
      return {
        success: false,
        error: error.message,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Create detection result from risk score
   */
  private createDetectionResult(request: FraudDetectionRequest, riskScore: number): FraudDetectionResult {
    const riskLevel = this.getRiskLevel(riskScore);
    const detectedFraudTypes = this.detectFraudTypes(request.features, riskScore);
    const reasons = this.generateReasons(request.features, riskScore, detectedFraudTypes);
    
    return {
      transactionId: request.transactionId,
      riskScore,
      riskLevel,
      confidence: Math.min(riskScore / 100, 1),
      detectedFraudTypes,
      reasons,
      requiresManualReview: riskScore >= this.modelConfig.reviewThreshold,
      shouldBlock: riskScore >= this.modelConfig.threshold,
      modelVersion: this.modelConfig.version,
      processingTime: 0, // Will be set by calling method
      timestamp: new Date()
    };
  }

  /**
   * Determine risk level from score
   */
  private getRiskLevel(score: number): FraudRiskLevel {
    if (score >= 80) return FraudRiskLevel.CRITICAL;
    if (score >= 60) return FraudRiskLevel.HIGH;
    if (score >= 40) return FraudRiskLevel.MEDIUM;
    return FraudRiskLevel.LOW;
  }

  /**
   * Detect specific fraud types based on patterns
   */
  private detectFraudTypes(features: TransactionFeatures, riskScore: number): FraudType[] {
    const fraudTypes: FraudType[] = [];

    // Velocity attack detection
    if (features.transactionVelocity > 20) {
      fraudTypes.push(FraudType.VELOCITY_ATTACK);
    }

    // Geographic anomaly detection
    if (features.distanceFromLastLocation > 1000 && features.locationChangeTime < 24) {
      fraudTypes.push(FraudType.GEOGRAPHIC_ANOMALY);
    }

    // Device anomaly detection
    if (features.isNewDevice && features.userAccountAge < 7) {
      fraudTypes.push(FraudType.DEVICE_ANOMALY);
    }

    // Amount anomaly detection
    if (features.amountDeviationFromAvg > 3) {
      fraudTypes.push(FraudType.AMOUNT_ANOMALY);
    }

    // Time anomaly detection
    if (features.isUnusualTime && features.userTransactionCount30d > 10) {
      fraudTypes.push(FraudType.TIME_ANOMALY);
    }

    // Account takeover detection
    if (features.isNewDevice && features.isUnusualLocation && features.timeSinceLastTransaction < 60) {
      fraudTypes.push(FraudType.ACCOUNT_TAKEOVER);
    }

    // Card testing detection
    if (features.failedTransactionCount > 5 && features.userTransactionCount24h < 10) {
      fraudTypes.push(FraudType.CARD_TESTING);
    }

    // Behavioral anomaly detection
    if (features.frequencyDeviationFromAvg > 2 && features.amountDeviationFromAvg > 2) {
      fraudTypes.push(FraudType.BEHAVIORAL_ANOMALY);
    }

    return fraudTypes;
  }

  /**
   * Generate human-readable reasons for fraud detection
   */
  private generateReasons(features: TransactionFeatures, riskScore: number, fraudTypes: FraudType[]): string[] {
    const reasons: string[] = [];

    if (riskScore >= 80) {
      reasons.push('Critical risk score detected');
    }

    fraudTypes.forEach(type => {
      switch (type) {
        case FraudType.VELOCITY_ATTACK:
          reasons.push('Unusually high transaction velocity detected');
          break;
        case FraudType.GEOGRAPHIC_ANOMALY:
          reasons.push('Suspicious geographic location change detected');
          break;
        case FraudType.DEVICE_ANOMALY:
          reasons.push('New device from recently created account');
          break;
        case FraudType.AMOUNT_ANOMALY:
          reasons.push('Transaction amount significantly deviates from user average');
          break;
        case FraudType.TIME_ANOMALY:
          reasons.push('Transaction at unusual time for this user');
          break;
        case FraudType.ACCOUNT_TAKEOVER:
          reasons.push('Potential account takeover detected');
          break;
        case FraudType.CARD_TESTING:
          reasons.push('Pattern consistent with card testing');
          break;
        case FraudType.BEHAVIORAL_ANOMALY:
          reasons.push('Unusual behavioral pattern detected');
          break;
      }
    });

    if (features.isBlacklistedAddress) {
      reasons.push('Transaction involves blacklisted address');
    }

    if (features.isBlacklistedDevice) {
      reasons.push('Transaction from blacklisted device');
    }

    if (features.isBlacklistedIP) {
      reasons.push('Transaction from blacklisted IP address');
    }

    return reasons;
  }

  /**
   * Train the model with new data
   */
  async trainModel(trainingData: MLTrainingData[]): Promise<void> {
    if (this.isTraining) {
      throw new Error('Model is already training');
    }

    this.isTraining = true;
    
    try {
      // Prepare training data
      const { features, labels } = this.prepareTrainingData(trainingData);
      
      // Train the model
      const history = await this.model.fit(features, labels, {
        epochs: 50,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: (epoch, logs: Record<string, number>) => {
            const acc = logs.accuracy ?? logs.acc;
            console.log(`Epoch ${epoch}: loss = ${logs.loss}, accuracy = ${acc}`);
          }
        }
      });

      // Update model configuration
      this.modelConfig.lastTrained = new Date();
      this.modelConfig.trainingDataSize = trainingData.length;
      this.modelConfig.performance = this.calculateMetrics(trainingData);
      
      // Save the updated model
      await this.saveModel();
      
      console.log('Model training completed successfully');
      
    } catch (error) {
      console.error('Model training failed:', error);
      throw error;
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Prepare training data tensors
   */
  private prepareTrainingData(trainingData: MLTrainingData[]): { features: tf.Tensor, labels: tf.Tensor } {
    const features = trainingData.map(data => 
      this.extractFeatures({
        transactionId: data.transactionId,
        features: data.features,
        userId: data.features.userId,
        ipAddress: data.features.ipAddress,
        userAgent: '',
        deviceId: data.features.deviceId,
        timestamp: data.features.timestamp
      })
    );

    const labels = trainingData.map(data => data.isFraud ? 1 : 0);

    return {
      features: tf.tensor2d(features),
      labels: tf.tensor2d(labels, [labels.length, 1])
    };
  }

  /**
   * Calculate model performance metrics
   */
  private calculateMetrics(trainingData: MLTrainingData[]): FraudModelMetrics {
    // This is a simplified calculation - in practice, you'd use a separate test set
    const total = trainingData.length;
    const fraud = trainingData.filter(d => d.isFraud).length;
    const legitimate = total - fraud;
    
    return {
      accuracy: 0.95, // Placeholder - would calculate from predictions
      precision: 0.92,
      recall: 0.88,
      f1Score: 0.90,
      falsePositiveRate: 0.05,
      falseNegativeRate: 0.12,
      truePositiveRate: 0.88,
      trueNegativeRate: 0.95,
      rocAuc: 0.96,
      confusionMatrix: {
        truePositives: Math.floor(fraud * 0.88),
        trueNegatives: Math.floor(legitimate * 0.95),
        falsePositives: Math.floor(legitimate * 0.05),
        falseNegatives: Math.floor(fraud * 0.12)
      },
      totalSamples: total,
      lastUpdated: new Date()
    };
  }

  /**
   * Save model to disk (pure tfjs: use indexedDB-style or file URL if supported in environment).
   */
  private async saveModel(): Promise<void> {
    if (!this.model) return;
    try {
      const url = 'file:///' + path.resolve(this.modelDir).replace(/\\/g, '/');
      await this.model.save(url);
      console.log('Model saved successfully');
    } catch (error) {
      // Pure tfjs may not support file:// save in all environments; log and continue
      console.warn('Model save skipped (not supported in this environment):', (error as Error).message);
    }
  }

  /**
   * Adaptive learning - update model with new data
   */
  async adaptiveLearning(): Promise<void> {
    if (!this.adaptiveConfig.enabled || this.trainingData.length < this.adaptiveConfig.minSamplesForUpdate) {
      return;
    }

    try {
      await this.trainModel(this.trainingData);
      this.trainingData = []; // Clear training data after update
      console.log('Adaptive learning completed');
    } catch (error) {
      console.error('Adaptive learning failed:', error);
    }
  }

  // Helper methods for normalization
  private normalizeCurrency(currency: string): number {
    const currencies = { 'USD': 1, 'EUR': 2, 'GBP': 3, 'XLM': 4, 'ETH': 5, 'MATIC': 6 };
    return (currencies[currency] || 0) / 6;
  }

  private normalizeNetwork(network: string): number {
    const networks = { 'stellar': 1, 'ethereum': 2, 'polygon': 3, 'bsc': 4 };
    return (networks[network] || 0) / 4;
  }

  private normalizeTimestamp(timestamp: Date): number {
    const hour = timestamp.getHours();
    return hour / 24;
  }

  private normalizeIPAddress(ip: string): number {
    // Simple hash-based normalization
    let hash = 0;
    for (let i = 0; i < ip.length; i++) {
      hash = ((hash << 5) - hash) + ip.charCodeAt(i);
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) / 2147483647; // Normalize to 0-1
  }

  private normalizeCountry(country: string): number {
    // Simple country-based risk scoring
    const highRiskCountries = ['US', 'GB', 'CA', 'AU']; // Example
    return highRiskCountries.includes(country) ? 0.8 : 0.2;
  }

  private normalizeDeviceId(deviceId: string): number {
    return this.normalizeIPAddress(deviceId); // Same approach as IP
  }

  private normalizeDeviceFingerprint(fingerprint: string): number {
    return this.normalizeIPAddress(fingerprint); // Same approach
  }

  private normalizeUserAgent(userAgent: string): number {
    // Simple hash-based normalization
    return this.normalizeIPAddress(userAgent);
  }

  private normalizeBlockchainNetwork(network: string): number {
    const networks = { 'stellar': 1, 'ethereum': 2, 'polygon': 3, 'bsc': 4 };
    return (networks[network] || 0) / 4;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private getDefaultModelConfig(): FraudModelConfig {
    return {
      modelType: 'neural_network',
      version: '1.0.0',
      threshold: 75,
      reviewThreshold: 50,
      features: [],
      hyperparameters: {},
      trainingDataSize: 0,
      validationDataSize: 0,
      lastTrained: new Date(),
      performance: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1Score: 0,
        falsePositiveRate: 0,
        falseNegativeRate: 0,
        truePositiveRate: 0,
        trueNegativeRate: 0,
        rocAuc: 0,
        confusionMatrix: {
          truePositives: 0,
          trueNegatives: 0,
          falsePositives: 0,
          falseNegatives: 0
        },
        totalSamples: 0,
        lastUpdated: new Date()
      }
    };
  }

  private getDefaultAdaptiveConfig(): AdaptiveLearningConfig {
    return {
      enabled: true,
      learningRate: 0.001,
      batchSize: 32,
      updateFrequency: 24, // hours
      minSamplesForUpdate: 100,
      maxModelAge: 30, // days
      performanceThreshold: 0.8,
      autoRetraining: true,
      featureImportanceThreshold: 0.01
    };
  }

  private getDefaultMonitoringConfig(): RealTimeMonitoringConfig {
    return {
      enabled: true,
      checkInterval: 5000, // 5 seconds
      batchSize: 10,
      maxConcurrentChecks: 5,
      alertThresholds: {
        riskScore: 80,
        transactionVolume: 100,
        failedAttempts: 5,
        geographicAnomalies: 10
      },
      notificationChannels: ['email', 'slack']
    };
  }
}
