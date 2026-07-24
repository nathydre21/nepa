import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export const mockRequest = (overrides: Partial<Request> = {}): Request => {
  const req = {
    body: {},
    params: {},
    query: {},
    headers: {},
    method: 'GET',
    url: '/test',
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    user: null,
    ...overrides
  } as Request;

  return req;
};

export const mockResponse = (): Response => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res as Response;
};

export const mockNext = (): NextFunction => {
  return jest.fn();
};

export const createMockAuth = (userId: string, role: string = 'USER') => {
  return {
    id: userId,
    userId,
    role,
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };
};

export const createAuthenticatedRequest = (auth: any, overrides: Partial<Request> = {}) => {
  return mockRequest({
    user: auth,
    headers: {
      authorization: `Bearer ${jwt.sign(auth, process.env.JWT_SECRET || 'test_jwt_secret_key_for_testing_only')}`
    },
    ...overrides
  });
};
