/**
 * API Response Utilities
 * Standardized response format across all endpoints
 */

export class ApiResponse {
  /**
   * Success response (200)
   */
  static success(res, { message = 'Success', data = null, meta = null } = {}) {
    const response = {
      success: true,
      message,
      data
    };
    
    if (meta) response.meta = meta;
    
    return res.status(200).json(response);
  }

  /**
   * Created response (201)
   */
  static created(res, { message = 'Created successfully', data = null } = {}) {
    return res.status(201).json({
      success: true,
      message,
      data
    });
  }

  /**
   * No Content response (204)
   */
  static noContent(res) {
    return res.status(204).send();
  }

  /**
   * Paginated response
   */
  static paginated(res, { data, page, limit, total, totalPages } = {}) {
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1
      }
    });
  }

  /**
   * Error response
   */
  static error(res, { statusCode = 500, code = 'ERROR', message = 'An error occurred', details = null } = {}) {
    const response = {
      success: false,
      error: {
        code,
        message
      }
    };
    
    if (details) response.error.details = details;
    
    return res.status(statusCode).json(response);
  }

  /**
   * Validation error response (422)
   */
  static validationError(res, errors) {
    return res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        errors
      }
    });
  }

  /**
   * Unauthorized response (401)
   */
  static unauthorized(res, message = 'Authentication required') {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message
      }
    });
  }

  /**
   * Forbidden response (403)
   */
  static forbidden(res, message = 'Access denied') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message
      }
    });
  }

  /**
   * Not Found response (404)
   */
  static notFound(res, resource = 'Resource') {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `${resource} not found`
      }
    });
  }
}

/**
 * Pagination helper
 */
export const paginate = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
    offset: (page - 1) * limit
  };
};

/**
 * Response transformer for mobile apps
 * Converts snake_case to camelCase
 */
export const transformResponse = (data) => {
  if (Array.isArray(data)) {
    return data.map(transformResponse);
  }
  
  if (data && typeof data === 'object') {
    const transformed = {};
    for (const [key, value] of Object.entries(data)) {
      const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      transformed[camelKey] = transformResponse(value);
    }
    return transformed;
  }
  
  return data;
};

export default ApiResponse;
