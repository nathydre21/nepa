# Authentication Flow Documentation

## Overview

This document provides a comprehensive guide to the authentication and authorization system in the NEPA backend application. The system implements JWT-based authentication, Role-Based Access Control (RBAC), and Two-Factor Authentication (2FA) using industry-standard libraries.

## Table of Contents

1. [Architecture](#architecture)
2. [Dependencies](#dependencies)
3. [Database Schema](#database-schema)
4. [Authentication Flow](#authentication-flow)
5. [Authorization Flow](#authorization-flow)
6. [Two-Factor Authentication](#two-factor-authentication)
7. [Middleware Usage](#middleware-usage)
8. [Security Best Practices](#security-best-practices)
9. [Testing](#testing)

## Architecture

### Components

- **AuthenticationService**: Handles user authentication, token generation, and 2FA operations
- **RbacService**: Manages roles, permissions, and access control
- **Authentication Middleware**: Express middleware for protecting routes
- **User Service Database**: Stores user accounts, sessions, and RBAC data

### Key Files

- `backend/services/AuthenticationService.ts` - Core authentication logic
- `backend/services/RbacService.ts` - Role and permission management
- `backend/middleware/authentication.ts` - Authentication and authorization middleware
- `backend/databases/user-service/schema.prisma` - Database schema

## Dependencies

```json
{
  "jsonwebtoken": "^9.0.2",  // JWT token generation and verification
  "bcryptjs": "^2.4.3",     // Password hashing
  "speakeasy": "^2.0.0",    // TOTP for 2FA
  "qrcode": "^1.5.3"        // QR code generation for 2FA setup
}
```

## Database Schema

### User Model

```prisma
model User {
  id                String           @id @default(uuid())
  email             String           @unique
  username          String?          @unique
  passwordHash      String?
  role              UserRole         @default(USER)
  status            UserStatus       @default(PENDING_VERIFICATION)
  twoFactorEnabled  Boolean          @default(false)
  twoFactorMethod   TwoFactorMethod  @default(NONE)
  twoFactorSecret   String?
  loginAttempts     Int              @default(0)
  lockedUntil       DateTime?
  // ... other fields
}
```

### RBAC Models

```prisma
model Role {
  id          String           @id @default(uuid())
  name        String           @unique
  description String?
  scope       PermissionScope  @default(GLOBAL)
  isSystem    Boolean          @default(false)
  isActive    Boolean          @default(true)
  permissions RolePermission[]
  userAssignments UserRoleAssignment[]
}

model Permission {
  id          String           @id @default(uuid())
  name        String           @unique
  description String?
  resource    ResourceType
  action      String
  scope       PermissionScope  @default(GLOBAL)
  isSystem    Boolean          @default(false)
  isActive    Boolean          @default(true)
  rolePermissions RolePermission[]
}

model UserRoleAssignment {
  id        String   @id @default(uuid())
  userId    String
  roleId    String
  assignedBy String
  isActive  Boolean  @default(true)
  expiresAt DateTime?
  user      User     @relation(fields: [userId], references: [id])
  role      Role     @relation(fields: [roleId], references: [id])
}
```

### Session Model

```prisma
model UserSession {
  id           String   @id @default(uuid())
  userId       String
  token        String   @unique
  refreshToken String?  @unique
  userAgent    String?
  ipAddress    String?
  isActive     Boolean  @default(true)
  expiresAt    DateTime
  user         User     @relation(fields: [userId], references: [id])
}
```

## Authentication Flow

### User Registration

```typescript
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "securePassword123",
  "username": "johndoe",
  "name": "John Doe"
}
```

**Process:**
1. Validate input data
2. Check if user already exists (email/username)
3. Hash password using bcrypt (12 rounds)
4. Create user record with `PENDING_VERIFICATION` status
5. Create user profile
6. Log audit event
7. Return success response

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please verify your email.",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "status": "PENDING_VERIFICATION"
  }
}
```

### User Login

```typescript
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "securePassword123",
  "twoFactorCode": "123456" // Required if 2FA enabled
}
```

**Process:**
1. Find user by email
2. Check account status (active, not locked)
3. Verify password hash
4. Check if 2FA is enabled:
   - If enabled, verify TOTP code
   - Return error if code missing or invalid
5. Reset login attempts on success
6. Create session with JWT tokens
7. Log audit event
8. Return tokens and user data

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "USER"
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

### Token Refresh

```typescript
POST /api/auth/refresh
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Process:**
1. Verify refresh token signature
2. Find active session in database
3. Generate new access token
4. Deactivate old session
5. Create new session
6. Return new tokens

### User Logout

```typescript
POST /api/auth/logout
Headers: {
  "Authorization": "Bearer <access_token>"
}
```

**Process:**
1. Verify access token
2. Deactivate session in database
3. Log audit event
4. Return success response

## Authorization Flow

### Role-Based Access Control (RBAC)

The system implements a flexible RBAC system with the following hierarchy:

**Roles:**
- `USER` - Basic user access
- `ADMIN` - Administrative access
- `SUPER_ADMIN` - Full system access

**Resources:**
- `USER` - User management
- `BILL` - Billing operations
- `PAYMENT` - Payment processing
- `AUDIT` - Audit logs
- `SYSTEM` - System configuration

**Scopes:**
- `READ` - Read-only access
- `WRITE` - Create/update access
- `DELETE` - Delete access
- `ADMIN` - Administrative operations
- `GLOBAL` - All resources
- `PERSONAL` - User's own resources only

### Permission Checking

**Example Permission Check:**
```typescript
{
  resource: ResourceType.USER,
  action: 'read',
  scope: PermissionScope.GLOBAL
}
```

### Middleware Usage

#### Basic Authentication

```typescript
import { authenticate } from '../middleware/authentication';

router.get('/profile', authenticate, async (req, res) => {
  // req.user is available here
  res.json({ user: req.user });
});
```

#### Role-Based Authorization

```typescript
import { requireRole } from '../middleware/authentication';
import { UserRole } from '@prisma/client';

router.delete('/users/:id', 
  authenticate, 
  requireRole(UserRole.ADMIN),
  async (req, res) => {
    // Only admins can access
  }
);
```

#### Permission-Based Authorization

```typescript
import { requirePermission, ResourceType, PermissionScope } from '../middleware/authentication';

router.post('/bills',
  authenticate,
  requirePermission({
    resource: ResourceType.BILL,
    action: 'create',
    scope: PermissionScope.GLOBAL
  }),
  async (req, res) => {
    // Only users with bill:create permission
  }
);
```

#### Self-Access Authorization

```typescript
import { requireSelfAccess } from '../middleware/authentication';

router.get('/users/:userId/profile',
  authenticate,
  requireSelfAccess('userId'),
  async (req, res) => {
    // Users can only access their own profile
  }
);
```

## Two-Factor Authentication

### Enabling 2FA

```typescript
POST /api/auth/2fa/enable
Headers: {
  "Authorization": "Bearer <access_token>"
}
Body: {
  "method": "AUTHENTICATOR_APP"
}
```

**Process:**
1. Generate TOTP secret using speakeasy
2. Generate QR code for authenticator app
3. Generate 10 backup codes
4. Store secret in user record
5. Return secret, QR code, and backup codes

**Response:**
```json
{
  "secret": "JBSWY3DPEHPK3PXP",
  "qrCode": "data:image/png;base64,...",
  "backupCodes": ["ABCD1234", "EFGH5678", ...]
}
```

### Verifying 2FA During Login

When 2FA is enabled, the login flow requires an additional step:

```typescript
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**First Response (if 2FA enabled):**
```json
{
  "success": false,
  "requiresTwoFactor": true,
  "twoFactorMethods": ["AUTHENTICATOR_APP"],
  "error": "Two-factor authentication required"
}
```

**Second Request with 2FA code:**
```typescript
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "securePassword123",
  "twoFactorCode": "123456"
}
```

### 2FA Middleware

#### Require 2FA

```typescript
import { requireTwoFactor } from '../middleware/authentication';

router.post('/sensitive-operation',
  authenticate,
  requireTwoFactor,
  async (req, res) => {
    // Requires valid 2FA code in header
  }
);
```

**Client usage:**
```typescript
Headers: {
  "Authorization": "Bearer <access_token>",
  "x-2fa-code": "123456"
}
```

#### Optional 2FA

```typescript
import { optionalTwoFactor } from '../middleware/authentication';

router.get('/settings',
  authenticate,
  optionalTwoFactor,
  async (req, res) => {
    // Allows access if 2FA not enabled
    // Requires 2FA if enabled
  }
);
```

#### Conditional 2FA for Sensitive Operations

```typescript
import { requireTwoFactorForSensitive } from '../middleware/authentication';

router.delete('/users/:id',
  authenticate,
  requireTwoFactorForSensitive(['delete', 'transfer']),
  async (req, res) => {
    // Requires 2FA only for delete/transfer operations
  }
);
```

## Security Best Practices

### Password Security

- **Hashing**: Uses bcrypt with 12 salt rounds
- **Validation**: Minimum 8 characters, complexity requirements
- **Reset**: Secure token-based password reset flow

### Token Security

- **JWT Secret**: Configured via environment variables
- **Token Expiry**: Access tokens expire in 15 minutes
- **Refresh Tokens**: Expire in 7 days
- **Session Management**: Active sessions tracked in database
- **Token Blacklisting**: Sessions can be deactivated

### Account Security

- **Login Attempts**: Tracks failed login attempts
- **Account Lockout**: Locks account after 5 failed attempts (30 minutes)
- **Status Management**: Multiple account statuses (ACTIVE, SUSPENDED, etc.)
- **Audit Logging**: All authentication events logged

### 2FA Security

- **TOTP**: Time-based one-time passwords (30-second window)
- **Backup Codes**: 10 single-use backup codes
- **Multiple Methods**: Support for authenticator app, SMS, email
- **Grace Period**: 2-window tolerance for clock skew

### RBAC Security

- **Principle of Least Privilege**: Users only get necessary permissions
- **Role Hierarchy**: Built-in role hierarchy (USER < ADMIN < SUPER_ADMIN)
- **Resource Scoping**: Permissions can be scoped to personal vs global
- **Audit Trail**: All permission changes logged
- **System Roles**: System roles cannot be modified/deleted

## Middleware Reference

### Available Middleware Functions

#### Authentication

- `authenticate(req, res, next)` - Requires valid JWT token
- `authenticateToken(req, res, next)` - Alias for authenticate
- `optionalAuth(req, res, next)` - Optional authentication

#### Authorization

- `requireRole(role)` - Requires specific user role
- `requirePermission(check)` - Requires specific permission
- `requireAnyPermission(checks[])` - Requires any of the specified permissions
- `requireAllPermissions(checks[])` - Requires all specified permissions
- `requireResourceAccess(resourceIdParam, check)` - Requires access to specific resource
- `requireSelfAccess(userIdParam)` - Allows users to access only their own resources

#### Two-Factor Authentication

- `requireTwoFactor(req, res, next)` - Requires valid 2FA code
- `optionalTwoFactor(req, res, next)` - Optional 2FA if enabled
- `requireTwoFactorForSensitive(actions[])` - Conditional 2FA for sensitive operations

### Error Responses

#### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

#### 403 Forbidden
```json
{
  "error": "Insufficient permissions",
  "required": {
    "resource": "USER",
    "action": "delete",
    "scope": "GLOBAL"
  }
}
```

#### 2FA Required
```json
{
  "error": "Two-factor authentication code required",
  "requiresTwoFactorCode": true
}
```

## Testing

### Unit Tests

- **Authentication Middleware**: `tests/unit/middleware/authentication.test.ts`
- **2FA Middleware**: `tests/unit/middleware/twoFactor.test.ts`
- **Authentication Service**: `tests/unit/services/AuthenticationService.test.ts`
- **RBAC Service**: `tests/unit/services/RbacService.test.ts`

### Integration Tests

- **Authentication API**: `tests/integration/auth.test.ts`
- **2FA Integration**: Included in auth integration tests
- **RBAC Integration**: Included in auth integration tests

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage
npm run test:coverage
```

## Environment Variables

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-super-secret-refresh-key

# Database
USER_SERVICE_DATABASE_URL=postgresql://user:password@localhost:5432/user_service

# 2FA Configuration (optional defaults available)
TWO_FACTOR_ISSUER=NEPA
TWO_FACTOR_WINDOW=2
```

## Troubleshooting

### Common Issues

**Token expired immediately**
- Check system time synchronization
- Verify JWT_SECRET is consistent across services

**2FA verification fails**
- Ensure device time is synchronized
- Check TOTP secret is stored correctly
- Verify window tolerance settings

**Permission denied unexpectedly**
- Check user role assignments
- Verify permission definitions
- Review role-permission mappings

**Session invalid after login**
- Check session expiration settings
- Verify database connection
- Review session cleanup logic

## Migration Guide

### From Legacy Auth

1. **Update Database**: Run Prisma migrations for new RBAC schema
2. **Update Middleware**: Replace legacy middleware with new auth middleware
3. **Update Controllers**: Use new middleware functions
4. **Update Tests**: Update test cases for new auth flow
5. **Seed Data**: Create default roles and permissions

### Database Migration

```bash
# Generate Prisma client
npx prisma generate --schema=./databases/user-service/schema.prisma

# Run migrations
npx prisma db push --schema=./databases/user-service/schema.prisma
```

### Seed Default Roles and Permissions

```typescript
// Example seeding script
await rbacService.createRole({
  name: 'ADMIN',
  description: 'Administrator role',
  scope: PermissionScope.GLOBAL,
  isSystem: true
});

await rbacService.createPermission({
  name: 'user.manage',
  description: 'Manage users',
  resource: ResourceType.USER,
  action: 'manage',
  scope: PermissionScope.GLOBAL,
  isSystem: true
});
```

## Support and Maintenance

### Monitoring

- Monitor failed login attempts
- Track 2FA adoption rates
- Review permission usage patterns
- Audit role assignment changes

### Regular Tasks

- Review and revoke inactive sessions
- Update permission definitions as needed
- Review role assignments quarterly
- Monitor for suspicious authentication patterns

### Security Updates

- Keep dependencies updated
- Review security advisories
- Test authentication flows after updates
- Update security policies as needed

## Conclusion

This authentication system provides a robust, secure, and flexible foundation for user authentication and authorization in the NEPA application. The combination of JWT tokens, RBAC, and 2FA ensures multiple layers of security while maintaining usability for end users.

For questions or issues, refer to the test files for usage examples or contact the development team.
