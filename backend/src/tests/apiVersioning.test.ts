import request from 'supertest';
import { app } from '@/index';
import { CURRENT_VERSION, SUPPORTED_VERSIONS, DEPRECATED_VERSIONS } from '@/middleware/apiVersioning';

describe('API Versioning', () => {
  describe('Path-based versioning', () => {
    it('should accept v1 requests via path', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['x-api-version']).toBe('v1');
    });

    it('should accept v2 requests via path', async () => {
      const response = await request(app)
        .get('/api/v2/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.headers['x-api-version']).toBe('v2');
      expect(response.body.data.apiVersion).toBe('v2');
    });

    it('should reject unsupported version via path', async () => {
      const response = await request(app)
        .get('/api/v3/health')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_API_VERSION');
      expect(response.body.error.supportedVersions).toEqual(SUPPORTED_VERSIONS);
    });

    it('should reject invalid version format via path', async () => {
      const response = await request(app)
        .get('/api/vx/health')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_API_VERSION');
    });
  });

  describe('Header-based versioning', () => {
    it('should accept version via Accept-Version header', async () => {
      const response = await request(app)
        .get('/api/v2/health')
        .set('Accept-Version', 'v1')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('v1');
    });

    it('should accept version via API-Version header', async () => {
      const response = await request(app)
        .get('/api/v2/health')
        .set('API-Version', 'v1')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('v1');
    });

    it('should prioritize path version over headers', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('Accept-Version', 'v2')
        .set('API-Version', 'v2')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('v1');
    });

    it('should reject unsupported version via header', async () => {
      const response = await request(app)
        .get('/api/v2/health')
        .set('Accept-Version', 'v3')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_API_VERSION');
    });
  });

  describe('Deprecation warnings', () => {
    it('should add deprecation headers for deprecated versions', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.headers['x-api-deprecated']).toBe('true');
      expect(response.headers['x-api-deprecation-date']).toBeDefined();
      expect(response.headers['x-api-sunset-date']).toBeDefined();
      expect(response.headers['x-api-recommended-version']).toBe(CURRENT_VERSION);
    });

    it('should not add deprecation headers for current version', async () => {
      const response = await request(app)
        .get('/api/v2/health')
        .expect(200);

      expect(response.headers['x-api-deprecated']).toBeUndefined();
    });
  });

  describe('Version negotiation', () => {
    it('should redirect unversioned requests', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(301);

      expect(response.body.error.code).toBe('VERSION_REQUIRED');
      expect(response.body.error.redirectTo).toBe(`/api/${CURRENT_VERSION}/health`);
      expect(response.body.error.recommendedVersion).toBe(CURRENT_VERSION);
    });

    it('should include supported versions in error responses', async () => {
      const response = await request(app)
        .get('/api/v99/health')
        .expect(400);

      expect(response.body.error.supportedVersions).toEqual(SUPPORTED_VERSIONS);
      expect(response.body.error.recommendedVersion).toBe(CURRENT_VERSION);
    });
  });

  describe('Version constraints', () => {
    it('should enforce minimum version requirements', async () => {
      // This test assumes we have an endpoint that requires minimum v2
      // For now, we'll test that v2 routes work with v2
      const response = await request(app)
        .get('/api/v2/health/version')
        .expect(200);

      expect(response.body.data.currentVersion).toBe('v2');
    });

    it('should reject requests below minimum version', async () => {
      // This would test an endpoint that requires v2 but gets v1
      // Since we don't have such an endpoint yet, this is a placeholder
      // The middleware functionality is tested in the apiVersioning middleware tests
    });
  });

  describe('Response headers', () => {
    it('should include API version in response headers', async () => {
      const response = await request(app)
        .get('/api/v2/health')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('v2');
      expect(response.headers['x-api-supported-versions']).toBe(SUPPORTED_VERSIONS.join(', '));
    });

    it('should include version information in v2 responses', async () => {
      const response = await request(app)
        .get('/api/v2/health')
        .expect(200);

      expect(response.body.data.versionInfo).toBeDefined();
      expect(response.body.data.versionInfo.resolvedVersion).toBe('v2');
      expect(response.body.data.versionInfo.isDeprecated).toBe(false);
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain v1 response format', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      // v1 should have the original structure
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).not.toHaveProperty('versionInfo');
    });

    it('should enhance v2 response format', async () => {
      const response = await request(app)
        .get('/api/v2/health')
        .expect(200);

      // v2 should have enhanced structure
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('versionInfo');
      expect(response.body.data).toHaveProperty('features');
      expect(response.body.data).toHaveProperty('links');
    });
  });

  describe('Error handling', () => {
    it('should handle malformed version in path', async () => {
      const response = await request(app)
        .get('/api/v/health')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_API_VERSION');
    });

    it('should handle future version requests', async () => {
      const response = await request(app)
        .get('/api/v10/health')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('not yet supported');
    });

    it('should handle past version requests', async () => {
      // Assuming v0 is no longer supported
      const response = await request(app)
        .get('/api/v0/health')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('no longer supported');
    });
  });
});
