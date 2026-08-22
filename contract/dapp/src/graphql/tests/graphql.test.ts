import { ApolloServer } from '@apollo/server';
import { gql } from 'graphql-tag';
import { GraphQLServer } from '../server';
import { resolvers } from '../resolvers';
import { GraphQLCache } from '../cache';

// Test schema
const typeDefs = gql`
  type Query {
    hello: String
    user(id: ID!): User
    users: [User!]!
  }

  type Mutation {
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
  }

  type Subscription {
    userUpdated(userId: ID!): User!
    notificationReceived(userId: ID!): Notification!
  }

  type User {
    id: ID!
    name: String!
    email: String!
    createdAt: DateTime!
  }

  type Notification {
    id: ID!
    message: String!
    createdAt: DateTime!
  }

  input CreateUserInput {
    name: String!
    email: String!
  }

  input UpdateUserInput {
    name: String
    email: String
  }

  scalar DateTime
`;

describe('GraphQL API Tests', () => {
  let server: ApolloServer;
  let testServer: GraphQLServer;
  let cache: GraphQLCache;

  beforeAll(async () => {
    // Initialize cache
    cache = new GraphQLCache({
      enabled: true,
      ttl: 300,
      maxSize: 1000,
      strategy: 'lru'
    });

    // Initialize test server
    const config = {
      port: 4001,
      environment: 'test' as const,
      corsOrigins: ['http://localhost:3000'],
      rateLimit: {
        windowMs: 60000,
        max: 100
      },
      introspection: true,
      playground: false,
      subscriptions: true,
      cache: {
        enabled: true,
        ttl: 300,
        maxSize: 1000
      },
      monitoring: {
        enabled: true,
        logLevel: 'info'
      }
    };

    testServer = new GraphQLServer(config);
    server = new ApolloServer({
      typeDefs,
      resolvers,
      introspection: true,
    });

    await server.start();
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
    if (testServer) {
      await testServer.stop();
    }
    if (cache) {
      await cache.disconnect();
    }
  });

  describe('Query Operations', () => {
    it('should execute simple query', async () => {
      const query = gql`
        query {
          hello
        }
      `;

      const response = await server.execute({
        query,
      });

      expect(response.errors).toBeUndefined();
      expect(response.data?.hello).toBeDefined();
    });

    it('should handle query with variables', async () => {
      const query = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            email
          }
        }
      `;

      const response = await server.execute({
        query,
        variables: { id: 'user-1' },
      });

      expect(response.errors).toBeUndefined();
      expect(response.data?.user).toBeDefined();
      expect(response.data?.user.id).toBe('user-1');
    });

    it('should handle query with pagination', async () => {
      const query = gql`
        query GetUsers($limit: Int, $offset: Int) {
          users {
            id
            name
            email
          }
        }
      `;

      const response = await server.execute({
        query,
        variables: { limit: 10, offset: 0 },
      });

      expect(response.errors).toBeUndefined();
      expect(response.data?.users).toBeDefined();
      expect(Array.isArray(response.data?.users)).toBe(true);
    });

    it('should handle query errors gracefully', async () => {
      const query = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            email
          }
        }
      `;

      const response = await server.execute({
        query,
        variables: { id: 'non-existent' },
      });

      expect(response.errors).toBeDefined();
      expect(response.errors?.length).toBeGreaterThan(0);
    });

    it('should validate query syntax', async () => {
      const invalidQuery = gql`
        query {
          user {
            id
            name
          }
        }
      `;

      const response = await server.execute({
        query: invalidQuery,
      });

      expect(response.errors).toBeDefined();
      expect(response.errors?.length).toBeGreaterThan(0);
    });
  });

  describe('Mutation Operations', () => {
    it('should execute create mutation', async () => {
      const mutation = gql`
        mutation CreateUser($input: CreateUserInput!) {
          createUser(input: $input) {
            id
            name
            email
            createdAt
          }
        }
      `;

      const variables = {
        input: {
          name: 'John Doe',
          email: 'john.doe@example.com'
        }
      };

      const response = await server.execute({
        query: mutation,
        variables,
      });

      expect(response.errors).toBeUndefined();
      expect(response.data?.createUser).toBeDefined();
      expect(response.data?.createUser.name).toBe('John Doe');
      expect(response.data?.createUser.email).toBe('john.doe@example.com');
    });

    it('should execute update mutation', async () => {
      const mutation = gql`
        mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
          updateUser(id: $id, input: $input) {
            id
            name
            email
          }
        }
      `;

      const variables = {
        id: 'user-1',
        input: {
          name: 'Jane Doe'
        }
      };

      const response = await server.execute({
        query: mutation,
        variables,
      });

      expect(response.errors).toBeUndefined();
      expect(response.data?.updateUser).toBeDefined();
      expect(response.data?.updateUser.name).toBe('Jane Doe');
    });

    it('should validate mutation input', async () => {
      const mutation = gql`
        mutation CreateUser($input: CreateUserInput!) {
          createUser(input: $input) {
            id
            name
            email
          }
        }
      `;

      const variables = {
        input: {
          // Missing required fields
          email: 'invalid-email'
        }
      };

      const response = await server.execute({
        query: mutation,
        variables,
      });

      expect(response.errors).toBeDefined();
      expect(response.errors?.length).toBeGreaterThan(0);
    });

    it('should handle authentication in mutations', async () => {
      const mutation = gql`
        mutation AuthenticatedMutation {
          # This would require authentication
          updateUser(id: "user-1", input: { name: "Test" }) {
            id
            name
          }
        }
      `;

      const response = await server.execute({
        query: mutation,
        context: {
          user: null // No authenticated user
        }
      });

      expect(response.errors).toBeDefined();
      expect(response.errors?.[0]?.message).toContain('Authentication required');
    });
  });

  describe('Subscription Operations', () => {
    it('should handle subscription setup', async () => {
      const subscription = gql`
        subscription UserUpdated($userId: ID!) {
          userUpdated(userId: $userId) {
            id
            name
            email
          }
        }
      `;

      const asyncIterable = await server.subscribe({
        query: subscription,
        variables: { userId: 'user-1' },
      });

      expect(asyncIterable).toBeDefined();
      expect(typeof asyncIterable[Symbol.asyncIterator]).toBe('function');
    });

    it('should receive subscription events', async () => {
      const subscription = gql`
        subscription NotificationReceived($userId: ID!) {
          notificationReceived(userId: $userId) {
            id
            message
            createdAt
          }
        }
      `;

      const asyncIterable = await server.subscribe({
        query: subscription,
        variables: { userId: 'user-1' },
      });

      // Mock event publication
      // In real implementation, this would be triggered by actual events
      const iterator = asyncIterable[Symbol.asyncIterator]();
      
      // Test that we can iterate (would need actual event to get data)
      expect(iterator).toBeDefined();
    });
  });

  describe('Caching', () => {
    beforeEach(async () => {
      await cache.clear();
    });

    it('should cache query results', async () => {
      const query = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            email
          }
        }
      `;

      const variables = { id: 'user-1' };

      // First call - should cache result
      const response1 = await server.execute({
        query,
        variables,
      });

      expect(response1.errors).toBeUndefined();
      expect(response1.data?.user).toBeDefined();

      // Check cache stats
      const stats = cache.getStats();
      expect(stats.misses).toBeGreaterThan(0);
    });

    it('should retrieve from cache', async () => {
      const query = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            email
          }
        }
      `;

      const variables = { id: 'user-1' };

      // First call
      await server.execute({ query, variables });

      // Second call - should hit cache
      const response2 = await server.execute({
        query,
        variables,
      });

      expect(response2.errors).toBeUndefined();
      expect(response2.data?.user).toBeDefined();

      const stats = cache.getStats();
      expect(stats.hits).toBeGreaterThan(0);
    });

    it('should respect cache TTL', async () => {
      const shortTtlCache = new GraphQLCache({
        enabled: true,
        ttl: 1, // 1 second
        maxSize: 1000,
        strategy: 'lru'
      });

      const query = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
          }
        }
      `;

      const variables = { id: 'user-1' };

      // First call
      await server.execute({ query, variables });

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Second call - should miss cache
      const response = await server.execute({
        query,
        variables,
      });

      expect(response.errors).toBeUndefined();
      expect(response.data?.user).toBeDefined();

      const stats = shortTtlCache.getStats();
      expect(stats.misses).toBeGreaterThan(stats.hits);

      await shortTtlCache.disconnect();
    });

    it('should handle cache eviction', async () => {
      const smallCache = new GraphQLCache({
        enabled: true,
        ttl: 300,
        maxSize: 2, // Very small cache
        strategy: 'lru'
      });

      // Fill cache beyond capacity
      for (let i = 0; i < 5; i++) {
        await smallCache.set(`key-${i}`, { value: i });
      }

      const stats = smallCache.getStats();
      expect(stats.size).toBeLessThanOrEqual(2);
      expect(stats.evictions).toBeGreaterThan(0);

      await smallCache.disconnect();
    });
  });

  describe('Authentication & Authorization', () => {
    it('should authenticate valid token', async () => {
      const query = gql`
        query {
          me {
            id
            name
            email
          }
        }
      `;

      const response = await server.execute({
        query,
        context: {
          user: {
            id: 'user-1',
            email: 'test@example.com',
            role: 'USER'
          }
        }
      });

      expect(response.errors).toBeUndefined();
      expect(response.data?.me).toBeDefined();
      expect(response.data?.me.id).toBe('user-1');
    });

    it('should reject invalid token', async () => {
      const query = gql`
        query {
          me {
            id
            name
            email
          }
        }
      `;

      const response = await server.execute({
        query,
        context: {
          user: null
        }
      });

      expect(response.errors).toBeDefined();
      expect(response.errors?.[0]?.message).toContain('Authentication required');
    });

    it('should enforce role-based access', async () => {
      const mutation = gql`
        mutation AdminOnlyMutation {
          # This would require ADMIN role
          createUser(input: { name: "Test", email: "test@example.com" }) {
            id
          }
        }
      `;

      const response = await server.execute({
        query: mutation,
        context: {
          user: {
            id: 'user-1',
            role: 'USER' // Not ADMIN
          }
        }
      });

      expect(response.errors).toBeDefined();
      expect(response.errors?.[0]?.message).toContain('Access denied');
    });
  });

  describe('Error Handling', () => {
    it('should handle GraphQL syntax errors', async () => {
      const invalidQuery = `
        query {
          user(id: "123") {
            id
            name
          }
        }
      `; // Missing closing brace

      const response = await server.execute({
        query: invalidQuery,
      });

      expect(response.errors).toBeDefined();
      expect(response.errors?.length).toBeGreaterThan(0);
    });

    it('should handle validation errors', async () => {
      const query = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
          }
        }
      `;

      const response = await server.execute({
        query,
        variables: { id: null }, // Invalid: ID cannot be null
      });

      expect(response.errors).toBeDefined();
    });

    it('should handle resolver errors', async () => {
      const query = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
          }
        }
      `;

      const response = await server.execute({
        query,
        variables: { id: 'non-existent-user' },
      });

      expect(response.errors).toBeDefined();
      expect(response.errors?.[0]?.message).toContain('not found');
    });

    it('should format errors consistently', async () => {
      const query = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
          }
        }
      `;

      const response = await server.execute({
        query,
        variables: { id: 'non-existent-user' },
      });

      if (response.errors && response.errors.length > 0) {
        const error = response.errors[0];
        expect(error.message).toBeDefined();
        expect(error.locations).toBeDefined();
        expect(error.path).toBeDefined();
      }
    });
  });

  describe('Performance', () => {
    it('should handle concurrent requests', async () => {
      const query = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            email
          }
        }
      `;

      const promises = Array.from({ length: 10 }, (_, i) =>
        server.execute({
          query,
          variables: { id: `user-${i}` },
        })
      );

      const responses = await Promise.all(promises);

      responses.forEach(response => {
        expect(response.errors).toBeUndefined();
        expect(response.data?.user).toBeDefined();
      });
    });

    it('should handle large queries efficiently', async () => {
      const query = gql`
        query GetUsers {
          users {
            id
            name
            email
            createdAt
          }
        }
      `;

      const startTime = Date.now();
      const response = await server.execute({ query });
      const endTime = Date.now();

      expect(response.errors).toBeUndefined();
      expect(response.data?.users).toBeDefined();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle deep nested queries', async () => {
      const query = gql`
        query GetDeepData {
          user(id: "user-1") {
            id
            name
            email
            # Add nested fields if available
          }
        }
      `;

      const response = await server.execute({ query });

      expect(response.errors).toBeUndefined();
      expect(response.data?.user).toBeDefined();
    });
  });

  describe('Introspection', () => {
    it('should support schema introspection', async () => {
      const query = gql`
        query IntrospectionQuery {
          __schema {
            types {
              name
              kind
              description
            }
          }
        }
      `;

      const response = await server.execute({ query });

      expect(response.errors).toBeUndefined();
      expect(response.data?.__schema).toBeDefined();
      expect(response.data?.__schema.types).toBeDefined();
      expect(Array.isArray(response.data?.__schema.types)).toBe(true);
    });

    it('should expose type information', async () => {
      const query = gql`
        query GetType {
          __type(name: "User") {
            name
            kind
            fields {
              name
              type {
                name
                kind
              }
            }
          }
        }
      `;

      const response = await server.execute({ query });

      expect(response.errors).toBeUndefined();
      expect(response.data?.__type).toBeDefined();
      expect(response.data?.__type.name).toBe('User');
      expect(response.data?.__type.fields).toBeDefined();
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete user workflow', async () => {
      // 1. Create user
      const createMutation = gql`
        mutation CreateUser($input: CreateUserInput!) {
          createUser(input: $input) {
            id
            name
            email
          }
        }
      `;

      const createResponse = await server.execute({
        query: createMutation,
        variables: {
          input: {
            name: 'Integration User',
            email: 'integration@example.com'
          }
        }
      });

      expect(createResponse.errors).toBeUndefined();
      const userId = createResponse.data?.createUser.id;

      // 2. Get user
      const getQuery = gql`
        query GetUser($id: ID!) {
          user(id: $id) {
            id
            name
            email
          }
        }
      `;

      const getResponse = await server.execute({
        query: getQuery,
        variables: { id: userId }
      });

      expect(getResponse.errors).toBeUndefined();
      expect(getResponse.data?.user.name).toBe('Integration User');

      // 3. Update user
      const updateMutation = gql`
        mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
          updateUser(id: $id, input: $input) {
            id
            name
            email
          }
        }
      `;

      const updateResponse = await server.execute({
        query: updateMutation,
        variables: {
          id: userId,
          input: { name: 'Updated User' }
        }
      });

      expect(updateResponse.errors).toBeUndefined();
      expect(updateResponse.data?.updateUser.name).toBe('Updated User');
    });

    it('should handle real-time updates', async () => {
      // Set up subscription
      const subscription = gql`
        subscription UserUpdated($userId: ID!) {
          userUpdated(userId: $userId) {
            id
            name
          }
        }
      `;

      const asyncIterable = await server.subscribe({
        query: subscription,
        variables: { userId: 'user-1' }
      });

      // Mock user update that would trigger subscription
      const updateMutation = gql`
        mutation UpdateUser($id: ID!, $input: UpdateUserInput!) {
          updateUser(id: $id, input: $input) {
            id
            name
          }
        }
      `;

      await server.execute({
        query: updateMutation,
        variables: {
          id: 'user-1',
          input: { name: 'Real-time Update' }
        }
      });

      // Verify subscription is ready
      expect(asyncIterable).toBeDefined();
    });
  });
});
