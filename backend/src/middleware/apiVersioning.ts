import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

// Supported API versions
export const SUPPORTED_VERSIONS = ['v1', 'v2'] as const;
export const CURRENT_VERSION = 'v2' as const;
export const DEPRECATED_VERSIONS = ['v1'] as const;

export type ApiVersion = typeof SUPPORTED_VERSIONS[number];

export interface VersionedRequest extends Request {
  apiVersion: ApiVersion;
  versionInfo: {
    requestedVersion: string;
    resolvedVersion: ApiVersion;
    isDeprecated: boolean;
    deprecationDate?: string;
    sunsetDate?: string;
  };
}

/**
 * Extract API version from multiple sources with priority:
 * 1. URL path (/api/v1/...)
 * 2. Accept-Version header
 * 3. API-Version header
 * 4. Default to current version
 */
export function extractApiVersion(req: Request): string {
  // 1. Check URL path for version
  const pathVersionMatch = req.path.match(/^\/api\/(v\d+)\//);
  if (pathVersionMatch) {
    return pathVersionMatch[1];
  }

  // 2. Check Accept-Version header
  const acceptVersion = req.headers['accept-version'];
  if (acceptVersion && typeof acceptVersion === 'string') {
    return acceptVersion;
  }

  // 3. Check API-Version header
  const apiVersion = req.headers['api-version'];
  if (apiVersion && typeof apiVersion === 'string') {
    return apiVersion;
  }

  // 4. Default to current version
  return CURRENT_VERSION;
}

/**
 * Validate and resolve API version
 */
export function resolveApiVersion(requestedVersion: string): ApiVersion {
  // Check if version is supported
  if (SUPPORTED_VERSIONS.includes(requestedVersion as ApiVersion)) {
    return requestedVersion as ApiVersion;
  }

  // Check if it's a valid version format but unsupported
  const versionMatch = requestedVersion.match(/^v(\d+)$/);
  if (versionMatch) {
    const versionNumber = parseInt(versionMatch[1]);
    const latestSupported = parseInt(CURRENT_VERSION.slice(1));
    
    if (versionNumber > latestSupported) {
      throw new Error(`API version ${requestedVersion} is not yet supported. Latest supported version is ${CURRENT_VERSION}.`);
    } else {
      throw new Error(`API version ${requestedVersion} is no longer supported. Please use ${CURRENT_VERSION}.`);
    }
  }

  throw new Error(`Invalid API version format: ${requestedVersion}. Use format like 'v1', 'v2'.`);
}

/**
 * Get deprecation information for a version
 */
export function getDeprecationInfo(version: ApiVersion) {
  if (!DEPRECATED_VERSIONS.includes(version as any)) {
    return { isDeprecated: false };
  }

  // Define deprecation timeline (you can adjust these dates)
  const deprecationDates: Record<string, { deprecationDate: string; sunsetDate: string }> = {
    'v1': {
      deprecationDate: '2024-06-01',
      sunsetDate: '2024-12-31'
    }
  };

  const info = deprecationDates[version];
  return {
    isDeprecated: true,
    deprecationDate: info?.deprecationDate,
    sunsetDate: info?.sunsetDate
  };
}

/**
 * API Versioning Middleware
 */
export function apiVersioning(req: Request, res: Response, next: NextFunction): void {
  try {
    const requestedVersion = extractApiVersion(req);
    const resolvedVersion = resolveApiVersion(requestedVersion);
    const versionInfo = getDeprecationInfo(resolvedVersion);

    // Extend request object with version information
    const versionedReq = req as VersionedRequest;
    versionedReq.apiVersion = resolvedVersion;
    versionedReq.versionInfo = {
      requestedVersion,
      resolvedVersion,
      isDeprecated: versionInfo.isDeprecated,
      deprecationDate: versionInfo.deprecationDate,
      sunsetDate: versionInfo.sunsetDate
    };

    // Add deprecation warnings to response headers if version is deprecated
    if (versionInfo.isDeprecated) {
      res.setHeader('X-API-Deprecated', 'true');
      if (versionInfo.deprecationDate) {
        res.setHeader('X-API-Deprecation-Date', versionInfo.deprecationDate);
      }
      if (versionInfo.sunsetDate) {
        res.setHeader('X-API-Sunset-Date', versionInfo.sunsetDate);
      }
      res.setHeader('X-API-Recommended-Version', CURRENT_VERSION);
      
      logger.warn(`Deprecated API version ${resolvedVersion} used by client`, {
        requestedVersion,
        resolvedVersion,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
    }

    // Add API version information to response headers
    res.setHeader('X-API-Version', resolvedVersion);
    res.setHeader('X-API-Supported-Versions', SUPPORTED_VERSIONS.join(', '));

    next();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Version negotiation failed';
    
    logger.warn('API version negotiation failed', {
      error: message,
      requestedVersion: req.headers['accept-version'] || req.headers['api-version'],
      path: req.path,
      ip: req.ip
    });

    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_API_VERSION',
        message,
        supportedVersions: SUPPORTED_VERSIONS,
        recommendedVersion: CURRENT_VERSION
      }
    });
  }
}

/**
 * Middleware to ensure minimum API version
 */
export function requireMinimumVersion(minimumVersion: ApiVersion) {
  return (req: VersionedRequest, res: Response, next: NextFunction): void => {
    const requestVersion = req.apiVersion;
    const minVersionNum = parseInt(minimumVersion.slice(1));
    const requestVersionNum = parseInt(requestVersion.slice(1));

    if (requestVersionNum < minVersionNum) {
      res.status(400).json({
        success: false,
        error: {
          code: 'API_VERSION_TOO_LOW',
          message: `This endpoint requires API version ${minimumVersion} or higher. Current version: ${requestVersion}`,
          minimumVersion,
          currentVersion: requestVersion,
          recommendedVersion: CURRENT_VERSION
        }
      });
      return;
    }

    next();
  };
}

/**
 * Middleware to ensure maximum API version (for backwards compatibility)
 */
export function requireMaximumVersion(maximumVersion: ApiVersion) {
  return (req: VersionedRequest, res: Response, next: NextFunction): void => {
    const requestVersion = req.apiVersion;
    const maxVersionNum = parseInt(maximumVersion.slice(1));
    const requestVersionNum = parseInt(requestVersion.slice(1));

    if (requestVersionNum > maxVersionNum) {
      res.status(400).json({
        success: false,
        error: {
          code: 'API_VERSION_TOO_HIGH',
          message: `This endpoint is not available in API version ${requestVersion}. Maximum supported version: ${maximumVersion}`,
          maximumVersion,
          currentVersion: requestVersion
        }
      });
      return;
    }

    next();
  };
}
