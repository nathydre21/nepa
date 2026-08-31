import Consul from 'consul';

export interface ServiceInstance {
  id: string;
  name: string;
  address: string;
  port: number;
  tags?: string[];
  meta?: Record<string, string>;
  check?: {
    http?: string;
    interval?: string;
    timeout?: string;
    ttl?: string;
  };
}

export interface ServiceRegistration {
  name: string;
  id: string;
  address: string;
  port: number;
  tags?: string[];
  meta?: Record<string, string>;
  check?: {
    http?: string;
    interval?: string;
    timeout?: string;
    ttl?: string;
  };
}

export class ServiceRegistry {
  private consul: Consul.Consul;
  private localCache: Map<string, ServiceInstance[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private cacheTTL = 30000; // 30 seconds

  constructor(consulHost: string = 'localhost', consulPort: number = 8500) {
    this.consul = new Consul({
      host: consulHost,
      port: consulPort
    });
  }

  async register(registration: ServiceRegistration): Promise<boolean> {
    try {
      await this.consul.agent.service.register(registration);
      console.log(`Service registered: ${registration.name} (${registration.id})`);
      return true;
    } catch (error) {
      console.error('Failed to register service:', error);
      return false;
    }
  }

  async deregister(serviceId: string): Promise<boolean> {
    try {
      await this.consul.agent.service.deregister(serviceId);
      console.log(`Service deregistered: ${serviceId}`);
      
      // Clear cache
      this.localCache.clear();
      
      return true;
    } catch (error) {
      console.error('Failed to deregister service:', error);
      return false;
    }
  }

  async discover(serviceName: string): Promise<ServiceInstance | null> {
    // Check cache first
    const cached = this.getCachedInstances(serviceName);
    if (cached && cached.length > 0) {
      return this.selectInstance(cached);
    }

    try {
      const services = await this.consul.health.service({
      service: serviceName,
      passing: true
    });

      if (services.length === 0) {
        console.warn(`No healthy instances found for service: ${serviceName}`);
        return null;
      }

      const instances: ServiceInstance[] = services.map(service => ({
        id: service.Service.ID,
        name: service.Service.Service,
        address: service.Service.Address,
        port: service.Service.Port,
        tags: service.Service.Tags,
        meta: service.Service.Meta
      }));

      // Cache the instances
      this.setCachedInstances(serviceName, instances);

      return this.selectInstance(instances);
    } catch (error) {
      console.error('Failed to discover service:', error);
      return null;
    }
  }

  async discoverAll(serviceName: string): Promise<ServiceInstance[]> {
    // Check cache first
    const cached = this.getCachedInstances(serviceName);
    if (cached && cached.length > 0) {
      return cached;
    }

    try {
      const services = await this.consul.health.service({
        service: serviceName,
        passing: true
      });

      const instances: ServiceInstance[] = services.map(service => ({
        id: service.Service.ID,
        name: service.Service.Service,
        address: service.Service.Address,
        port: service.Service.Port,
        tags: service.Service.Tags,
        meta: service.Service.Meta
      }));

      // Cache the instances
      this.setCachedInstances(serviceName, instances);

      return instances;
    } catch (error) {
      console.error('Failed to discover all service instances:', error);
      return [];
    }
  }

  async getServiceHealth(serviceName: string): Promise<any> {
    try {
      const checks = await this.consul.health.checks(serviceName);
      return checks;
    } catch (error) {
      console.error('Failed to get service health:', error);
      return null;
    }
  }

  private selectInstance(instances: ServiceInstance[]): ServiceInstance {
    // Round-robin load balancing
    const index = Math.floor(Math.random() * instances.length);
    return instances[index];
  }

  private getCachedInstances(serviceName: string): ServiceInstance[] | null {
    const cached = this.localCache.get(serviceName);
    const expiry = this.cacheExpiry.get(serviceName);

    if (!cached || !expiry || Date.now() > expiry) {
      this.localCache.delete(serviceName);
      this.cacheExpiry.delete(serviceName);
      return null;
    }

    return cached;
  }

  private setCachedInstances(serviceName: string, instances: ServiceInstance[]): void {
    this.localCache.set(serviceName, instances);
    this.cacheExpiry.set(serviceName, Date.now() + this.cacheTTL);
  }

  clearCache(): void {
    this.localCache.clear();
    this.cacheExpiry.clear();
  }
}

// In-memory service registry for local development (without Consul)
export class LocalServiceRegistry {
  private services: Map<string, ServiceInstance[]> = new Map();

  register(registration: ServiceRegistration): boolean {
    const instance: ServiceInstance = {
      id: registration.id,
      name: registration.name,
      address: registration.address,
      port: registration.port,
      tags: registration.tags,
      meta: registration.meta
    };

    if (!this.services.has(registration.name)) {
      this.services.set(registration.name, []);
    }

    const instances = this.services.get(registration.name)!;
    const existingIndex = instances.findIndex(i => i.id === registration.id);

    if (existingIndex !== -1) {
      instances[existingIndex] = instance;
    } else {
      instances.push(instance);
    }

    console.log(`Service registered (local): ${registration.name} (${registration.id})`);
    return true;
  }

  deregister(serviceId: string): boolean {
    for (const [serviceName, instances] of this.services.entries()) {
      const index = instances.findIndex(i => i.id === serviceId);
      if (index !== -1) {
        instances.splice(index, 1);
        console.log(`Service deregistered (local): ${serviceId}`);
        return true;
      }
    }
    return false;
  }

  discover(serviceName: string): ServiceInstance | null {
    const instances = this.services.get(serviceName);
    if (!instances || instances.length === 0) {
      return null;
    }

    // Round-robin load balancing
    const index = Math.floor(Math.random() * instances.length);
    return instances[index];
  }

  discoverAll(serviceName: string): ServiceInstance[] {
    return this.services.get(serviceName) || [];
  }

  getServiceHealth(serviceName: string): any {
    const instances = this.services.get(serviceName);
    if (!instances || instances.length === 0) {
      return null;
    }

    return instances.map(instance => ({
      ServiceID: instance.id,
      ServiceName: instance.name,
      Status: 'passing'
    }));
  }

  clearCache(): void {
    // No-op for local registry
  }
}

// Factory function to get the appropriate registry
export function getServiceRegistry(): ServiceRegistry | LocalServiceRegistry {
  const useConsul = process.env.USE_CONSUL === 'true';
  
  if (useConsul) {
    const consulHost = process.env.CONSUL_HOST || 'localhost';
    const consulPort = parseInt(process.env.CONSUL_PORT || '8500');
    return new ServiceRegistry(consulHost, consulPort);
  } else {
    return new LocalServiceRegistry();
  }
}

// Singleton instance
let registryInstance: ServiceRegistry | LocalServiceRegistry | null = null;

export function getRegistry(): ServiceRegistry | LocalServiceRegistry {
  if (!registryInstance) {
    registryInstance = getServiceRegistry();
  }
  return registryInstance;
}
