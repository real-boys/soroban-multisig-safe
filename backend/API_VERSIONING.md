# API Versioning Strategy

This document outlines the comprehensive API versioning strategy implemented for the Stellar Multi-Sig Safe backend.

## Overview

The API versioning system provides:
- **URI Path Versioning** (`/api/v1/`, `/api/v2/`) - Primary method
- **Header-based Version Negotiation** - Fallback method
- **Deprecation Warnings** - For older versions
- **Backward Compatibility** - Maintained for supported versions
- **Version Metadata** - Included in responses

## Supported Versions

- **v1**: Legacy version (deprecated)
- **v2**: Current version (recommended)

## Versioning Methods

### 1. URI Path Versioning (Recommended)

```bash
# v1 API (deprecated)
GET /api/v1/health
GET /api/v1/wallets

# v2 API (current)
GET /api/v2/health
GET /api/v2/wallets
```

### 2. Header-based Versioning

When using path-based versioning, you can override the version using headers:

```bash
# Using Accept-Version header
GET /api/v2/health
Headers: Accept-Version: v1

# Using API-Version header
GET /api/v2/health
Headers: API-Version: v1
```

**Priority Order:**
1. Path version (highest priority)
2. `Accept-Version` header
3. `API-Version` header
4. Default to current version

### 3. Version Negotiation

Unversioned requests are redirected to the current version:

```bash
# This request will be redirected
GET /api/health

# Response (301)
{
  "success": false,
  "error": {
    "code": "VERSION_REQUIRED",
    "message": "API version is required. Please use a versioned endpoint.",
    "redirectTo": "/api/v2/health",
    "supportedVersions": ["v1", "v2"],
    "recommendedVersion": "v2"
  }
}
```

## Response Headers

All versioned API responses include these headers:

```http
X-API-Version: v2
X-API-Supported-Versions: v1, v2
```

### Deprecated Version Headers

For deprecated versions (v1):

```http
X-API-Deprecated: true
X-API-Deprecation-Date: 2024-06-01
X-API-Sunset-Date: 2024-12-31
X-API-Recommended-Version: v2
```

## Response Format

### v1 Response Format

```json
{
  "success": true,
  "data": {
    "status": "UP",
    "timestamp": "2024-04-27T14:30:00.000Z",
    "version": "1.0.0"
  }
}
```

### v2 Response Format (Enhanced)

```json
{
  "success": true,
  "data": {
    "status": "UP",
    "timestamp": "2024-04-27T14:30:00.000Z",
    "version": "2.0.0",
    "apiVersion": "v2",
    "versionInfo": {
      "requestedVersion": "v2",
      "resolvedVersion": "v2",
      "isDeprecated": false,
      "deprecationDate": null,
      "sunsetDate": null
    },
    "features": {
      "versioning": true,
      "deprecationWarnings": true,
      "headerNegotiation": true,
      "pathVersioning": true
    },
    "supportedVersions": ["v1", "v2"],
    "recommendedVersion": "v2"
  },
  "links": {
    "self": "/api/v2/health",
    "documentation": "/api/v2/docs",
    "versionInfo": "/api/v2/version"
  }
}
```

## Error Handling

### Invalid Version

```json
{
  "success": false,
  "error": {
    "code": "INVALID_API_VERSION",
    "message": "API version v3 is not yet supported. Latest supported version is v2.",
    "supportedVersions": ["v1", "v2"],
    "recommendedVersion": "v2"
  }
}
```

### Version Too Low

For endpoints requiring minimum versions:

```json
{
  "success": false,
  "error": {
    "code": "API_VERSION_TOO_LOW",
    "message": "This endpoint requires API version v2 or higher. Current version: v1",
    "minimumVersion": "v2",
    "currentVersion": "v1",
    "recommendedVersion": "v2"
  }
}
```

## Version Constraints

### Minimum Version Requirements

Endpoints can require minimum versions:

```typescript
import { requireMinimumVersion } from '@/middleware/apiVersioning';

// This endpoint requires v2 or higher
router.use('/new-feature', requireMinimumVersion('v2'));
```

### Maximum Version Constraints

Endpoints can be limited to maximum versions (for backwards compatibility):

```typescript
import { requireMaximumVersion } from '@/middleware/apiVersioning';

// This endpoint only works with v1
router.use('/legacy-feature', requireMaximumVersion('v1'));
```

## Deprecation Timeline

### v1 Deprecation Schedule

- **Deprecation Date**: 2024-06-01
- **Sunset Date**: 2024-12-31
- **Status**: Deprecated

### Migration Guide

1. **Update Base URLs**: Change `/api/v1/` to `/api/v2/`
2. **Handle Enhanced Responses**: v2 includes additional metadata
3. **Test Header Negotiation**: Ensure your client handles version headers
4. **Monitor Deprecation Warnings**: Check for `X-API-Deprecated` headers

## Implementation Details

### Middleware Stack

```typescript
// Apply API versioning to all /api routes
app.use('/api', apiVersioning);

// Mount versioned routes
app.use('/api/v1', v1Routes);
app.use('/api/v2', v2Routes);
```

### Version Extraction Logic

1. **Path**: Extract from `/api/v{number}/` pattern
2. **Headers**: Check `Accept-Version` and `API-Version`
3. **Default**: Fall back to `CURRENT_VERSION`

### Version Resolution

1. Validate version format (`v{number}`)
2. Check against supported versions
3. Apply version constraints
4. Set response headers
5. Add deprecation warnings if needed

## Testing

The versioning system includes comprehensive tests:

```bash
# Run all tests
npm test

# Run versioning tests specifically
npm test -- --testNamePattern="API Versioning"
```

### Test Coverage

- ✅ Path-based versioning
- ✅ Header-based versioning
- ✅ Deprecation warnings
- ✅ Version negotiation
- ✅ Error handling
- ✅ Response headers
- ✅ Backward compatibility

## Best Practices

### For API Consumers

1. **Always specify a version** in your requests
2. **Use path-based versioning** for clarity
3. **Monitor deprecation headers** in responses
4. **Plan migration** before sunset dates
5. **Test against multiple versions** during development

### For API Developers

1. **Maintain backward compatibility** within major versions
2. **Use semantic versioning** for breaking changes
3. **Provide migration guides** for deprecated versions
4. **Add deprecation warnings** well in advance
5. **Document version differences** clearly

## Future Considerations

### Planned v3 Features

- [ ] GraphQL endpoint support
- [ ] Real-time WebSocket APIs
- [ ] Advanced pagination
- [ ] Field selection and filtering
- [ ] Batch operations

### Version Sunset Policy

- **6 months deprecation notice** before sunset
- **3 months overlap** with new version
- **Extended support** available for enterprise customers
- **Security updates** provided until sunset date

## Support

For questions about API versioning:

- 📖 **Documentation**: Check this guide first
- 🐛 **Issues**: Report versioning bugs on GitHub
- 💬 **Discussions**: Join the community discussion
- 📧 **Support**: Contact the development team
