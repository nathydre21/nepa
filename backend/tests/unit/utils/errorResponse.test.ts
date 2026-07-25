import { Response } from 'express';
import { errorResponse } from '../../../utils/errorResponse';
import { mockResponse } from '../../mocks';

describe('errorResponse', () => {
  let res: Response;

  beforeEach(() => {
    res = mockResponse();
  });

  it('sets the HTTP status code and returns { success: false, error }', () => {
    const result = errorResponse(res, 400, 'Bad request');

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Bad request',
    });
    expect(result).toBe(res);
  });

  it('supports common client and server error codes', () => {
    const codes = [400, 401, 403, 404, 409, 422, 429, 500];

    for (const code of codes) {
      jest.clearAllMocks();
      errorResponse(res, code, `Error ${code}`);

      expect(res.status).toHaveBeenCalledWith(code);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: `Error ${code}`,
      });
    }
  });

  it('handles an empty error message', () => {
    errorResponse(res, 500, '');

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: '',
    });
  });

  it('does not include status or success:true fields in the body', () => {
    errorResponse(res, 404, 'Not found');

    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body).toEqual({ success: false, error: 'Not found' });
    expect(body).not.toHaveProperty('status');
    expect(Object.keys(body).sort()).toEqual(['error', 'success']);
  });

  it('passes through dynamic / nullish-coalesced messages as-is', () => {
    const dynamic: string | undefined = undefined;
    errorResponse(res, 400, dynamic || 'Fallback message');

    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Fallback message',
    });
  });

  it('coalesces null and undefined messages to Unknown error', () => {
    errorResponse(res, 500, undefined);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unknown error',
    });

    jest.clearAllMocks();
    errorResponse(res, 500, null);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: 'Unknown error',
    });
  });
});
