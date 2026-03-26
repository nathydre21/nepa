# RSS Feed Support

This document describes the RSS feed functionality added to the NEPA application.

## Overview

The RSS feed feature provides real-time updates about various activities in the NEPA system through standard RSS feeds. This allows users and administrators to monitor recent updates using their preferred RSS readers.

## Available Feeds

### 1. Recent Bills Feed
- **Endpoint**: `/api/rss/bills`
- **Description**: RSS feed for recent bills created in the system
- **Content**: Bill details including amount, due date, status, utility information, and user information
- **Update Frequency**: Every 60 minutes

### 2. Recent Payments Feed
- **Endpoint**: `/api/rss/payments`
- **Description**: RSS feed for recent payments processed in the system
- **Content**: Payment details including amount, method, status, transaction ID, and associated bill information
- **Update Frequency**: Every 60 minutes

### 3. New Users Feed
- **Endpoint**: `/api/rss/users`
- **Description**: RSS feed for new user registrations
- **Content**: User registration details including name, email, role, and registration date
- **Update Frequency**: Every 60 minutes

### 4. Recent Reports Feed
- **Endpoint**: `/api/rss/reports`
- **Description**: RSS feed for recent reports generated in the system
- **Content**: Report details including title, type, creator, and creation date
- **Update Frequency**: Every 60 minutes

### 5. Combined Activity Feed
- **Endpoint**: `/api/rss/activity`
- **Description**: Combined RSS feed for all recent activity across the system
- **Content**: Aggregated feed containing bills, payments, users, and reports sorted by most recent
- **Update Frequency**: Every 60 minutes

## Feed Information Endpoint

### Get Available Feeds
- **Endpoint**: `/api/rss`
- **Method**: GET
- **Description**: Returns information about all available RSS feeds
- **Response**: JSON object containing feed metadata and URLs

## Implementation Details

### Architecture

The RSS functionality is implemented using the following components:

1. **RssService**: Core service class responsible for generating RSS feeds
2. **RssController**: Controller handling HTTP requests for RSS endpoints
3. **RSS Library**: Uses the `rss` npm package for XML generation

### Key Features

- **Singleton Pattern**: RssService uses singleton pattern for efficient resource management
- **Database Integration**: Direct integration with Prisma ORM for data retrieval
- **Error Handling**: Comprehensive error handling for all RSS endpoints
- **Content Type**: Properly sets `application/rss+xml` content type for all feed responses
- **Rate Limiting**: Inherits rate limiting from the main API middleware
- **Security**: Public endpoints (no authentication required for feed access)

### Feed Structure

Each RSS feed follows the RSS 2.0 specification and includes:

- **Channel Information**: Title, description, link, language, publication date
- **Item Elements**: Title, description, link, GUID, categories, author, publication date
- **Proper XML Formatting**: Well-formed XML with proper encoding

### Data Privacy

- User email addresses are included in feeds for identification purposes
- Wallet addresses are partially masked for privacy
- No sensitive data (passwords, tokens) is included in feeds
- All feeds are publicly accessible by design

## Usage Examples

### Accessing Feeds

```bash
# Get feed information
curl http://localhost:3000/api/rss

# Get recent bills feed
curl http://localhost:3000/api/rss/bills

# Get combined activity feed
curl http://localhost:3000/api/rss/activity
```

### RSS Reader Integration

Users can add any of the feed URLs to their preferred RSS readers:

- Feedly: `https://feedly.com/i/subscription/feed/http://your-domain.com/api/rss/activity`
- Inoreader: `http://your-domain.com/api/rss/activity`
- Other RSS readers: Use the direct feed URLs

## Configuration

### Environment Variables

- `BASE_URL`: Base URL for the application (default: `http://localhost:3000`)
  - Used for generating absolute URLs in feed items

### Customization

The RSS feeds can be customized by modifying the following:

1. **Feed Limits**: Number of items per feed (currently set to 50)
2. **Update Frequency**: TTL (time-to-live) value (currently set to 60 minutes)
3. **Feed Metadata**: Titles, descriptions, and language settings
4. **Content Formatting**: Item descriptions and categorization

## Testing

The RSS functionality includes comprehensive tests covering:

- Feed endpoint accessibility
- RSS XML structure validation
- Content type verification
- Feed content validation
- Error handling scenarios

Run tests with:
```bash
npm test -- tests/rss.test.ts
```

## Monitoring and Analytics

RSS feed requests are logged through the application's logging middleware. Feed access can be monitored through:

- Application logs
- Analytics dashboard
- Custom monitoring solutions

## Performance Considerations

- Database queries are optimized with proper indexing
- Feed generation is efficient with limited result sets
- Singleton pattern reduces resource overhead
- Caching can be implemented for high-traffic scenarios

## Security Considerations

- Feed endpoints are publicly accessible by design
- No sensitive data is exposed in feeds
- Rate limiting applies to RSS endpoints
- Input validation is handled by middleware

## Future Enhancements

Potential future improvements include:

1. **Authentication Options**: Optional authenticated feeds for sensitive data
2. **Custom Filtering**: Query parameters for filtering feed content
3. **Webhook Integration**: Automatic notifications for new feed items
4. **Feed Caching**: Redis-based caching for improved performance
5. **Custom Feed Creation**: User-defined custom feeds
6. **Feed Analytics**: Detailed feed usage statistics
7. **Feed Subscriptions**: User subscription management

## Troubleshooting

### Common Issues

1. **Empty Feeds**: Check database connectivity and data availability
2. **Invalid XML**: Verify RSS library installation and configuration
3. **404 Errors**: Ensure routes are properly registered in app.ts
4. **Performance Issues**: Consider database optimization and caching

### Debug Logging

Enable debug logging to troubleshoot RSS feed issues:

```bash
DEBUG=rss:* npm run dev
```

## Dependencies

- `rss`: RSS feed generation library
- `date-fns`: Date formatting utilities
- `@prisma/client`: Database ORM
- `express`: Web framework

## API Documentation

The RSS endpoints are documented in the OpenAPI/Swagger specification available at `/api-docs`.
