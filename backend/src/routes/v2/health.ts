import { Router, Request, Response } from 'express';
import { VersionedRequest } from '@/middleware/apiVersioning';

const router = Router();

router.get('/', (req: VersionedRequest, res: Response) => {
  const versionInfo = req.versionInfo;
  
  res.json({
    success: true,
    data: {
      status: 'UP',
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      apiVersion: req.apiVersion,
      versionInfo: {
        requestedVersion: versionInfo.requestedVersion,
        resolvedVersion: versionInfo.resolvedVersion,
        isDeprecated: versionInfo.isDeprecated,
        deprecationDate: versionInfo.deprecationDate,
        sunsetDate: versionInfo.sunsetDate
      },
      features: {
        versioning: true,
        deprecationWarnings: true,
        headerNegotiation: true,
        pathVersioning: true
      },
      supportedVersions: ['v1', 'v2'],
      recommendedVersion: 'v2'
    },
    links: {
      self: `/api/${req.apiVersion}/health`,
      documentation: `/api/${req.apiVersion}/docs`,
      versionInfo: `/api/${req.apiVersion}/version`
    }
  });
});

// New v2-only endpoint for version information
router.get('/version', (req: VersionedRequest, res: Response) => {
  const versionInfo = req.versionInfo;
  
  res.json({
    success: true,
    data: {
      currentVersion: req.apiVersion,
      requestedVersion: versionInfo.requestedVersion,
      resolvedVersion: versionInfo.resolvedVersion,
      isDeprecated: versionInfo.isDeprecated,
      deprecationDate: versionInfo.deprecationDate,
      sunsetDate: versionInfo.sunsetDate,
      supportedVersions: ['v1', 'v2'],
      recommendedVersion: 'v2',
      versioningMethods: {
        path: 'GET /api/v1/health or /api/v2/health',
        header: 'Accept-Version: v1 or API-Version: v2'
      },
      migration: {
        from: 'v1',
        to: 'v2',
        breakingChanges: [
          'Response format includes additional version metadata',
          'New endpoints available in v2',
          'Some v1 endpoints will be deprecated'
        ],
        migrationGuide: 'https://docs.example.com/migration/v1-to-v2'
      }
    }
  });
});

export default router;
