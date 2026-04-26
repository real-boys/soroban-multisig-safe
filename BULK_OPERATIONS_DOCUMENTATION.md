# Bulk Operations Implementation Documentation

## Overview

This implementation adds comprehensive bulk operations support to the soroban-multisig-safe application, allowing users to perform multiple create, update, and delete operations efficiently with transaction support, progress tracking, and error handling.

## Features

### ✅ Core Functionality
- **Bulk Create Operations**: Create multiple wallets, transactions, and comments in a single request
- **Bulk Update Operations**: Update multiple records simultaneously
- **Bulk Delete Operations**: Delete multiple records with soft delete support
- **Transaction Support**: All operations run within database transactions for data consistency
- **Progress Tracking**: Real-time progress updates via WebSocket and HTTP polling
- **Error Handling**: Comprehensive error handling with retry logic and rollback mechanisms
- **Validation**: Input validation for all bulk operations
- **Rate Limiting**: Protection against abuse with configurable rate limits

### ✅ Advanced Features
- **WebSocket Integration**: Real-time progress updates to connected clients
- **Rollback Mechanisms**: Automatic rollback on failure for critical operations
- **Performance Optimization**: Database indexes optimized for bulk operations
- **Concurrent Processing**: Configurable concurrency control for performance
- **Cancellation Support**: Ability to cancel long-running operations

## API Endpoints

### Wallet Operations

#### Bulk Create Wallets
```http
POST /api/bulk/wallets/create
Content-Type: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "name": "Wallet 1",
      "owners": ["GABC..."],
      "threshold": 2,
      "recoveryAddress": "GDEF...",
      "recoveryDelay": 604800
    }
  ],
  "options": {
    "continueOnError": false,
    "maxConcurrency": 10,
    "timeoutMs": 30000
  }
}
```

#### Bulk Update Wallets
```http
PUT /api/bulk/wallets/update
Content-Type: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "id": "wallet_id_1",
      "name": "Updated Wallet Name",
      "threshold": 3
    }
  ],
  "options": {
    "continueOnError": true,
    "maxConcurrency": 5
  }
}
```

#### Bulk Delete Wallets
```http
DELETE /api/bulk/wallets/delete
Content-Type: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "id": "wallet_id_1"
    },
    {
      "id": "wallet_id_2"
    }
  ]
}
```

### Transaction Operations

#### Bulk Create Transactions
```http
POST /api/bulk/transactions/create
Content-Type: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "walletId": "wallet_id_1",
      "destination": "GXYZ...",
      "amount": "1000",
      "title": "Payment to Vendor",
      "description": "Monthly payment for services",
      "expiresAt": "2024-12-31T23:59:59Z"
    }
  ]
}
```

#### Bulk Update Transactions
```http
PUT /api/bulk/transactions/update
Content-Type: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "id": "transaction_id_1",
      "title": "Updated Transaction Title",
      "description": "Updated description"
    }
  ]
}
```

#### Bulk Delete Transactions
```http
DELETE /api/bulk/transactions/delete
Content-Type: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "id": "transaction_id_1"
    }
  ]
}
```

### Comment Operations

#### Bulk Create Comments
```http
POST /api/bulk/comments/create
Content-Type: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "transactionId": "transaction_id_1",
      "content": "This is a bulk comment"
    }
  ]
}
```

#### Bulk Delete Comments
```http
DELETE /api/bulk/comments/delete
Content-Type: application/json
Authorization: Bearer <token>

{
  "items": [
    {
      "id": "comment_id_1"
    }
  ]
}
```

### Operation Management

#### Get Operation Progress
```http
GET /api/bulk/operations/{operationId}/progress
Authorization: Bearer <token>
```

#### Cancel Operation
```http
POST /api/bulk/operations/{operationId}/cancel
Authorization: Bearer <token>
```

#### Get Active Operations
```http
GET /api/bulk/operations/active
Authorization: Bearer <token>
```

## Response Format

### Success Response
```json
{
  "success": true,
  "data": {
    "successful": [...],
    "failed": [...],
    "totalProcessed": 95,
    "operationId": "uuid-operation-id",
    "duration": 15432
  },
  "message": "Bulk operation completed successfully"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": ["Item 0: Name is required"]
  }
}
```

### Progress Response
```json
{
  "operationId": "uuid-operation-id",
  "status": "running",
  "totalItems": 100,
  "processedItems": 45,
  "successfulItems": 43,
  "failedItems": 2,
  "percentage": 45,
  "estimatedTimeRemaining": 15000,
  "startedAt": "2024-01-01T12:00:00Z",
  "updatedAt": "2024-01-01T12:01:30Z",
  "errors": [...]
}
```

## WebSocket Integration

### Connection
```javascript
const socket = io('ws://localhost:5001');

// Join user room for personal updates
socket.emit('join-user-room', userId);

// Subscribe to operation progress
socket.emit('subscribe-operation', {
  operationId: 'uuid-operation-id',
  userId: userId
});

// Listen for progress updates
socket.on('operation-progress', (progress) => {
  console.log('Progress:', progress);
});

// Cancel operation via WebSocket
socket.emit('cancel-operation', {
  operationId: 'uuid-operation-id',
  userId: userId
});
```

### WebSocket Events
- `join-user-room`: Join user-specific room for notifications
- `subscribe-operation`: Subscribe to operation progress updates
- `unsubscribe-operation`: Unsubscribe from operation updates
- `cancel-operation`: Cancel an ongoing operation
- `operation-progress`: Progress update event
- `operation-cancelled`: Operation cancelled event
- `error`: Error event

## Error Handling

### Error Types
1. **Validation Errors**: Input validation failures (no retry)
2. **Network Errors**: Connection issues (retry with exponential backoff)
3. **Database Errors**: Constraint violations (no retry), deadlocks (retry)
4. **Authorization Errors**: Permission issues (no retry)
5. **Resource Limit Errors**: Rate limiting (retry with delay)

### Retry Logic
- **Automatic Retry**: Configurable retry attempts with exponential backoff
- **Error Analysis**: Intelligent error classification for retry decisions
- **Rollback**: Automatic rollback for failed operations when possible

### Rollback Mechanisms
- **Create Operations**: Delete created records
- **Update Operations**: Restore previous state
- **Delete Operations**: Restore soft-deleted records

## Performance Optimizations

### Database Indexes
Created indexes for:
- Wallet queries by owner and creation time
- Transaction searches and filters
- Comment relationships
- Composite indexes for common query patterns
- BRIN indexes for time-series data

### Concurrency Control
- **Batch Processing**: Process items in configurable batches
- **Max Concurrency**: Limit concurrent operations per user
- **Transaction Isolation**: Appropriate isolation levels for data consistency

### Rate Limiting
- **Global Limits**: 10 bulk operations per 15 minutes per IP
- **Per-User Limits**: Configurable limits per user type
- **Operation Size Limits**: Maximum 100 items per bulk operation

## Configuration

### Environment Variables
```bash
# Bulk Operations
BULK_OPERATION_MAX_ITEMS=100
BULK_OPERATION_MAX_CONCURRENCY=50
BULK_OPERATION_DEFAULT_TIMEOUT=30000

# WebSocket
FRONTEND_URL=http://localhost:3000

# Rate Limiting
BULK_RATE_LIMIT_WINDOW=900000
BULK_RATE_LIMIT_MAX=10
```

## Security Considerations

### Authentication
- All bulk operations require valid JWT tokens
- User authorization verified for each operation
- Operation ownership validation

### Input Validation
- Comprehensive input validation using express-validator
- SQL injection prevention through parameterized queries
- XSS prevention through input sanitization

### Rate Limiting
- IP-based rate limiting
- User-based rate limiting
- Operation size limitations

## Monitoring and Logging

### Error Tracking
- Detailed error logging with context
- Error classification and statistics
- Performance metrics tracking

### Progress Tracking
- Real-time progress updates
- Operation duration tracking
- Success/failure rate monitoring

### Audit Trail
- All bulk operations logged
- User action tracking
- Data change audit logs

## Testing

### Unit Tests
- Service layer testing
- Error handling validation
- Progress tracking verification

### Integration Tests
- API endpoint testing
- WebSocket integration testing
- Database transaction testing

### Load Testing
- Bulk operation performance testing
- Concurrent operation testing
- Resource utilization monitoring

## Usage Examples

### Frontend Integration
```javascript
// Start bulk operation
const response = await fetch('/api/bulk/wallets/create', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    items: walletData,
    options: { continueOnError: true }
  })
});

const { operationId } = await response.json();

// Monitor progress
const progressInterval = setInterval(async () => {
  const progress = await fetch(`/api/bulk/operations/${operationId}/progress`);
  const data = await progress.json();
  
  if (data.data.status === 'completed' || data.data.status === 'failed') {
    clearInterval(progressInterval);
  }
}, 1000);
```

### WebSocket Integration
```javascript
const socket = io('ws://localhost:5001');

socket.emit('join-user-room', userId);
socket.emit('subscribe-operation', { operationId, userId });

socket.on('operation-progress', (progress) => {
  updateProgressBar(progress.percentage);
  updateStatus(progress.status);
});
```

## Migration and Deployment

### Database Migration
Run the provided SQL migration to add performance indexes:
```bash
psql -d your_database -f prisma/migrations/add_bulk_operation_indexes.sql
```

### Service Integration
- Bulk operations routes are automatically integrated
- WebSocket service initialized with main application
- Error handling service available for monitoring

### Configuration Updates
- Add bulk operation environment variables
- Update rate limiting configuration
- Configure WebSocket CORS settings

## Troubleshooting

### Common Issues
1. **Operation Timeouts**: Increase timeout values or reduce batch size
2. **Memory Issues**: Reduce max concurrency or batch size
3. **Database Locks**: Check transaction isolation levels
4. **WebSocket Connection**: Verify CORS configuration

### Debug Mode
Enable detailed logging:
```bash
DEBUG=bulk:* npm run dev
```

### Performance Monitoring
Monitor operation metrics:
- Operation duration
- Success/failure rates
- Resource utilization
- Database performance

## Future Enhancements

### Planned Features
- **Scheduled Bulk Operations**: Queue operations for later execution
- **Template Support**: Save and reuse bulk operation templates
- **Import/Export**: Bulk data import from CSV/Excel files
- **Advanced Filtering**: More sophisticated progress filtering
- **Analytics Dashboard**: Bulk operation analytics and reporting

### Performance Improvements
- **Caching**: Redis caching for frequently accessed data
- **Queue System**: Background job processing for large operations
- **Sharding**: Database sharding for large-scale deployments
- **CDN Integration**: Asset distribution for WebSocket connections

## Support

For issues and questions:
1. Check the application logs for detailed error information
2. Verify configuration settings
3. Test with smaller batch sizes first
4. Monitor system resources during operations
5. Review the error handling documentation

---

**Implementation Status**: ✅ Complete

All bulk operations have been successfully implemented with:
- Full CRUD operations for wallets, transactions, and comments
- Transaction support and rollback mechanisms
- Real-time progress tracking via WebSocket
- Comprehensive error handling and retry logic
- Performance optimizations and database indexing
- Security measures and rate limiting
- Complete API documentation and examples
