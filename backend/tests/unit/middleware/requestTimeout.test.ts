import { EventEmitter } from 'events';
import { Request, Response, NextFunction } from 'express';
import { requestTimeout } from '../../../middleware/requestTimeout';

describe('requestTimeout middleware', () => {
  let req: Request;
  let res: Response & EventEmitter;
  let next: NextFunction;
  let statusMock: jest.Mock;
  let jsonMock: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();

    req = {} as Request;

    statusMock = jest.fn().mockReturnThis();
    jsonMock = jest.fn().mockReturnThis();

    res = new EventEmitter() as Response & EventEmitter;
    Object.assign(res, {
      headersSent: false,
      status: statusMock,
      json: jsonMock,
    });

    next = jest.fn();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should call next() immediately', () => {
    const middleware = requestTimeout(1000);
    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('should default to a 30 second timeout', () => {
    const middleware = requestTimeout();
    middleware(req, res, next);

    jest.advanceTimersByTime(29999);
    expect(statusMock).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(statusMock).toHaveBeenCalledWith(504);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: 'Request timeout',
    });
  });

  it('should respond with 504 when the request exceeds the timeout', () => {
    const middleware = requestTimeout(500);
    middleware(req, res, next);

    jest.advanceTimersByTime(500);

    expect(statusMock).toHaveBeenCalledWith(504);
    expect(jsonMock).toHaveBeenCalledWith({
      success: false,
      error: 'Request timeout',
    });
  });

  it('should not send a timeout response when headers were already sent', () => {
    const middleware = requestTimeout(500);
    middleware(req, res, next);

    (res as any).headersSent = true;
    jest.advanceTimersByTime(500);

    expect(statusMock).not.toHaveBeenCalled();
    expect(jsonMock).not.toHaveBeenCalled();
  });

  it('should clear the timeout when the response finishes', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const middleware = requestTimeout(5000);
    middleware(req, res, next);

    res.emit('finish');

    expect(clearTimeoutSpy).toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    expect(statusMock).not.toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  it('should clear the timeout when the connection closes', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const middleware = requestTimeout(5000);
    middleware(req, res, next);

    res.emit('close');

    expect(clearTimeoutSpy).toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    expect(statusMock).not.toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  it('should respect a custom timeout duration', () => {
    const middleware = requestTimeout(100);
    middleware(req, res, next);

    jest.advanceTimersByTime(99);
    expect(statusMock).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(statusMock).toHaveBeenCalledWith(504);
  });
});
