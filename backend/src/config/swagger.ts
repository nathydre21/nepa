import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Nepa API",
      version: "1.0.0",
      description: "API documentation for Nepa Billing System",
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Development server",
      },
    ],
    tags: [
      {
        name: "Authentication",
        description: "Authentication and session management endpoints",
      },
      {
        name: "Payments",
        description: "Payment processing endpoints",
      },
      {
        name: "User Management",
        description: "User profile and administrative user management endpoints",
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
        },
      },
      schemas: {
        ErrorDetail: {
          type: "object",
          properties: {
            field: { type: "string", example: "email" },
            issue: { type: "string", example: "\"email\" must be a valid email" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            error: { type: "string", example: "Invalid credentials" },
            message: { type: "string", example: "Internal server error" },
            status: { type: "integer", example: 400 },
            details: {
              type: "array",
              items: { $ref: "#/components/schemas/ErrorDetail" },
            },
            transactionId: { type: "string", example: "txn_1714291200000_k3px8m2ae" },
          },
        },
        AuthUser: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid", example: "2a8e7d12-f0b1-4d85-9ae0-111111111111" },
            email: { type: "string", format: "email", example: "ada@example.com" },
            username: { type: "string", example: "adaelectric" },
            name: { type: "string", example: "Ada Electric" },
            role: { type: "string", example: "USER" },
            walletAddress: { type: "string", nullable: true, example: "GCFXJ4..." },
            status: { type: "string", example: "ACTIVE" },
          },
        },
        RegisterRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email", example: "ada@example.com" },
            password: { type: "string", format: "password", minLength: 8, example: "StrongPass123!" },
            username: { type: "string", example: "adaelectric" },
            name: { type: "string", example: "Ada Electric" },
            phoneNumber: { type: "string", example: "+2348012345678" },
          },
        },
        RegisterSuccessResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "Registration successful. Please verify your email.",
            },
            user: { $ref: "#/components/schemas/AuthUser" },
          },
        },
        LoginRequest: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string", format: "email", example: "ada@example.com" },
            password: { type: "string", format: "password", example: "StrongPass123!" },
            twoFactorCode: { type: "string", example: "123456" },
          },
        },
        WalletLoginRequest: {
          type: "object",
          required: ["walletAddress"],
          properties: {
            walletAddress: {
              type: "string",
              example: "0x1234567890abcdef1234567890abcdef12345678",
            },
          },
        },
        LoginSuccessResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Login successful" },
            user: { $ref: "#/components/schemas/AuthUser" },
            token: { type: "string", example: "eyJhbGciOi..." },
            refreshToken: { type: "string", example: "refresh_token_example" },
          },
        },
        TwoFactorChallengeResponse: {
          type: "object",
          properties: {
            requiresTwoFactor: { type: "boolean", example: true },
            twoFactorMethods: {
              type: "array",
              items: { type: "string", example: "TOTP" },
            },
            error: { type: "string", example: "Two-factor authentication required" },
          },
        },
        RefreshTokenRequest: {
          type: "object",
          required: ["refreshToken"],
          properties: {
            refreshToken: { type: "string", example: "refresh_token_example" },
          },
        },
        RefreshTokenResponse: {
          type: "object",
          properties: {
            token: { type: "string", example: "eyJhbGciOi..." },
            refreshToken: { type: "string", example: "refresh_token_example" },
            user: { $ref: "#/components/schemas/AuthUser" },
          },
        },
        TwoFactorEnableRequest: {
          type: "object",
          required: ["method"],
          properties: {
            method: {
              type: "string",
              enum: ["EMAIL", "SMS", "AUTHENTICATOR_APP"],
              example: "AUTHENTICATOR_APP",
            },
          },
        },
        TwoFactorEnableResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Two-factor authentication enabled" },
            secret: { type: "string", example: "JBSWY3DPEHPK3PXP" },
            qrCode: { type: "string", example: "data:image/png;base64,iVBORw0KGgoAAA..." },
            backupCodes: {
              type: "array",
              items: { type: "string", example: "ABCD-1234" },
            },
          },
        },
        TwoFactorVerifyRequest: {
          type: "object",
          required: ["code"],
          properties: {
            code: { type: "string", example: "123456" },
          },
        },
        CheckAvailabilityResponse: {
          type: "object",
          properties: {
            available: { type: "boolean", example: true },
            message: { type: "string", example: "Email is available" },
          },
        },
        ForgotPasswordRequest: {
          type: "object",
          required: ["email"],
          properties: {
            email: { type: "string", format: "email", example: "ada@example.com" },
          },
        },
        ResetPasswordRequest: {
          type: "object",
          required: ["token", "newPassword"],
          properties: {
            token: { type: "string", example: "reset-token-example" },
            newPassword: { type: "string", format: "password", example: "NewStrongPass123!" },
          },
        },
        VerifyResetTokenRequest: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string", example: "reset-token-example" },
          },
        },
        TokenStatusResponse: {
          type: "object",
          properties: {
            valid: { type: "boolean", example: true },
            expiresAt: { type: "string", format: "date-time", example: "2026-04-28T10:00:00.000Z" },
            timeUntilExpiry: { type: "integer", example: 240000 },
            warningLevel: {
              type: "string",
              enum: ["none", "warning", "critical", "expired"],
              example: "warning",
            },
            message: { type: "string", example: "Your session will expire in less than 5 minutes." },
          },
        },
        UserProfile: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid", example: "2a8e7d12-f0b1-4d85-9ae0-111111111111" },
            email: { type: "string", format: "email", example: "ada@example.com" },
            username: { type: "string", example: "adaelectric" },
            name: { type: "string", example: "Ada Electric" },
            phoneNumber: { type: "string", example: "+2348012345678" },
            avatar: { type: "string", nullable: true, example: "https://cdn.nepa.com/avatars/ada.png" },
            role: { type: "string", example: "USER" },
            status: { type: "string", example: "ACTIVE" },
            walletAddress: { type: "string", nullable: true, example: "GCFXJ4..." },
            isEmailVerified: { type: "boolean", example: true },
            isPhoneVerified: { type: "boolean", example: false },
            twoFactorEnabled: { type: "boolean", example: true },
            twoFactorMethod: { type: "string", nullable: true, example: "AUTHENTICATOR_APP" },
            lastLoginAt: { type: "string", format: "date-time", nullable: true, example: "2026-04-28T08:15:00.000Z" },
            createdAt: { type: "string", format: "date-time", example: "2026-01-10T09:30:00.000Z" },
          },
        },
        UserProfileResponse: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/UserProfile" },
          },
        },
        UpdateProfileRequest: {
          type: "object",
          properties: {
            name: { type: "string", example: "Ada Lovelace" },
            username: { type: "string", example: "adalovelace" },
            phoneNumber: { type: "string", example: "+2348012345678" },
            avatar: { type: "string", format: "uri", example: "https://cdn.nepa.com/avatars/ada.png" },
          },
        },
        UpdateProfileResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Profile updated successfully" },
            user: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid", example: "2a8e7d12-f0b1-4d85-9ae0-111111111111" },
                email: { type: "string", format: "email", example: "ada@example.com" },
                username: { type: "string", example: "adalovelace" },
                name: { type: "string", example: "Ada Lovelace" },
                phoneNumber: { type: "string", example: "+2348012345678" },
                avatar: { type: "string", example: "https://cdn.nepa.com/avatars/ada.png" },
                updatedAt: { type: "string", format: "date-time", example: "2026-04-28T09:00:00.000Z" },
              },
            },
          },
        },
        ChangePasswordRequest: {
          type: "object",
          required: ["currentPassword", "newPassword"],
          properties: {
            currentPassword: { type: "string", format: "password", example: "StrongPass123!" },
            newPassword: { type: "string", format: "password", example: "NewStrongPass123!" },
          },
        },
        MessageResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "Operation completed successfully" },
          },
        },
        AdminUser: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid", example: "2a8e7d12-f0b1-4d85-9ae0-111111111111" },
            email: { type: "string", format: "email", example: "ada@example.com" },
            username: { type: "string", nullable: true, example: "adaelectric" },
            name: { type: "string", nullable: true, example: "Ada Electric" },
            role: { type: "string", example: "USER" },
            status: { type: "string", example: "ACTIVE" },
            walletAddress: { type: "string", nullable: true, example: "GCFXJ4..." },
            isEmailVerified: { type: "boolean", example: true },
            isPhoneVerified: { type: "boolean", example: false },
            twoFactorEnabled: { type: "boolean", example: true },
            lastLoginAt: { type: "string", format: "date-time", nullable: true, example: "2026-04-28T08:15:00.000Z" },
            createdAt: { type: "string", format: "date-time", example: "2026-01-10T09:30:00.000Z" },
            _count: {
              type: "object",
              properties: {
                bills: { type: "integer", example: 3 },
                payments: { type: "integer", example: 12 },
                sessions: { type: "integer", example: 2 },
              },
            },
          },
        },
        AdminUsersResponse: {
          type: "object",
          properties: {
            users: {
              type: "array",
              items: { $ref: "#/components/schemas/AdminUser" },
            },
            pagination: {
              type: "object",
              properties: {
                page: { type: "integer", example: 1 },
                limit: { type: "integer", example: 10 },
                total: { type: "integer", example: 25 },
                pages: { type: "integer", example: 3 },
              },
            },
          },
        },
        UpdateUserRoleRequest: {
          type: "object",
          required: ["role"],
          properties: {
            role: {
              type: "string",
              enum: ["USER", "ADMIN", "SUPER_ADMIN"],
              example: "ADMIN",
            },
            status: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"],
              example: "ACTIVE",
            },
          },
        },
        UpdateUserRoleResponse: {
          type: "object",
          properties: {
            message: { type: "string", example: "User role updated successfully" },
            user: {
              type: "object",
              properties: {
                id: { type: "string", format: "uuid", example: "2a8e7d12-f0b1-4d85-9ae0-111111111111" },
                email: { type: "string", format: "email", example: "ada@example.com" },
                username: { type: "string", nullable: true, example: "adaelectric" },
                name: { type: "string", nullable: true, example: "Ada Electric" },
                role: { type: "string", example: "ADMIN" },
                status: { type: "string", example: "ACTIVE" },
                updatedAt: { type: "string", format: "date-time", example: "2026-04-28T09:00:00.000Z" },
              },
            },
          },
        },
        PaymentProcessRequest: {
          type: "object",
          required: ["billId", "amount", "paymentMethod"],
          properties: {
            billId: { type: "string", example: "bill_10023" },
            amount: { type: "number", format: "float", example: 12500 },
            paymentMethod: {
              type: "string",
              enum: ["BANK_TRANSFER", "CREDIT_CARD", "CRYPTO", "STELLAR"],
              example: "STELLAR",
            },
            stellarSecretKey: {
              type: "string",
              description: "Required when paymentMethod is STELLAR",
              example: "SB3J6K5....",
            },
            recaptchaToken: { type: "string", example: "03AFcWeA..." },
          },
        },
        PaymentProcessResponse: {
          type: "object",
          properties: {
            status: { type: "integer", example: 200 },
            message: { type: "string", example: "Payment processed successfully" },
            data: {
              type: "object",
              properties: {
                transactionId: { type: "string", example: "txn_1714291200000_k3px8m2ae" },
                status: { type: "string", example: "completed" },
                stellarTransactionId: { type: "string", nullable: true, example: "2cfe7fcb..." },
              },
              additionalProperties: true,
            },
          },
        },
      },
      responses: {
        BadRequest: {
          description: "Bad request or validation error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              examples: {
                validation: {
                  value: {
                    error: "\"email\" must be a valid email",
                    status: 400,
                  },
                },
              },
            },
          },
        },
        Unauthorized: {
          description: "Authentication failed or missing credentials",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              examples: {
                auth: {
                  value: {
                    error: "User authentication required",
                    status: 401,
                  },
                },
              },
            },
          },
        },
        Forbidden: {
          description: "Insufficient permissions",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              examples: {
                forbidden: {
                  value: {
                    error: "Insufficient permissions",
                    status: 403,
                  },
                },
              },
            },
          },
        },
        NotFound: {
          description: "Requested resource was not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              examples: {
                missing: {
                  value: {
                    error: "User not found",
                    status: 404,
                  },
                },
              },
            },
          },
        },
        TooManyRequests: {
          description: "Rate limit exceeded",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              examples: {
                throttled: {
                  value: {
                    error: "Too many requests, please try again later",
                    status: 429,
                  },
                },
              },
            },
          },
        },
        InternalServerError: {
          description: "Unexpected server error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ErrorResponse" },
              examples: {
                server: {
                  value: {
                    error: "Internal server error",
                    status: 500,
                  },
                },
              },
            },
          },
        },
      },
    },
    paths: {
      "/api/auth/register": {
        post: {
          tags: ["Authentication"],
          summary: "Register a new user",
          description: "Creates a new user account and returns the created user summary.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RegisterRequest" },
                examples: {
                  default: {
                    value: {
                      email: "ada@example.com",
                      password: "StrongPass123!",
                      username: "adaelectric",
                      name: "Ada Electric",
                      phoneNumber: "+2348012345678",
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: "User registered successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RegisterSuccessResponse" },
                  examples: {
                    success: {
                      value: {
                        message: "Registration successful. Please verify your email.",
                        user: {
                          id: "2a8e7d12-f0b1-4d85-9ae0-111111111111",
                          email: "ada@example.com",
                          username: "adaelectric",
                          name: "Ada Electric",
                          status: "ACTIVE",
                        },
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            429: { $ref: "#/components/responses/TooManyRequests" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Authentication"],
          summary: "Authenticate a user",
          description: "Authenticates a user with email and password and returns access tokens.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginRequest" },
                examples: {
                  default: {
                    value: {
                      email: "ada@example.com",
                      password: "StrongPass123!",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Login successful or a two-factor challenge is required",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      { $ref: "#/components/schemas/LoginSuccessResponse" },
                      { $ref: "#/components/schemas/TwoFactorChallengeResponse" },
                    ],
                  },
                  examples: {
                    success: {
                      value: {
                        message: "Login successful",
                        user: {
                          id: "2a8e7d12-f0b1-4d85-9ae0-111111111111",
                          email: "ada@example.com",
                          username: "adaelectric",
                          name: "Ada Electric",
                          role: "USER",
                          walletAddress: null,
                        },
                        token: "eyJhbGciOi...",
                        refreshToken: "refresh_token_example",
                      },
                    },
                    twoFactorRequired: {
                      value: {
                        requiresTwoFactor: true,
                        twoFactorMethods: ["TOTP"],
                        error: "Two-factor authentication required",
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            429: { $ref: "#/components/responses/TooManyRequests" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/logout": {
        post: {
          tags: ["Authentication"],
          summary: "Log out the current user",
          description: "Invalidates the current bearer token.",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "Logout successful",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MessageResponse" },
                  examples: {
                    success: {
                      value: {
                        message: "Logout successful",
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/wallet": {
        post: {
          tags: ["Authentication"],
          summary: "Authenticate with a wallet address",
          description: "Authenticates a user using a wallet address and returns access tokens.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WalletLoginRequest" },
                examples: {
                  default: {
                    value: {
                      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Wallet login successful",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/LoginSuccessResponse" },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            429: { $ref: "#/components/responses/TooManyRequests" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/refresh": {
        post: {
          tags: ["Authentication"],
          summary: "Refresh an access token",
          description: "Refreshes an expired access token using a refresh token.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/RefreshTokenRequest" },
                examples: {
                  default: {
                    value: {
                      refreshToken: "refresh_token_example",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Token refreshed successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/RefreshTokenResponse" },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/me": {
        get: {
          tags: ["Authentication"],
          summary: "Get the authenticated user profile",
          description: "Returns the currently authenticated user's profile.",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "Profile retrieved successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UserProfileResponse" },
                },
              },
            },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/2fa/enable": {
        post: {
          tags: ["Authentication"],
          summary: "Enable two-factor authentication",
          description: "Enables 2FA for the current user and returns setup data.",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TwoFactorEnableRequest" },
                examples: {
                  totp: {
                    value: {
                      method: "AUTHENTICATOR_APP",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Two-factor authentication enabled",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TwoFactorEnableResponse" },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/2fa/verify": {
        post: {
          tags: ["Authentication"],
          summary: "Verify a two-factor authentication code",
          description: "Verifies the submitted 2FA code for the authenticated user.",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TwoFactorVerifyRequest" },
                examples: {
                  code: {
                    value: {
                      code: "123456",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Two-factor authentication verified",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MessageResponse" },
                  examples: {
                    success: {
                      value: {
                        message: "Two-factor authentication verified",
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/2fa/disable": {
        post: {
          tags: ["Authentication"],
          summary: "Disable two-factor authentication",
          description: "Disables 2FA for the authenticated user.",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "Two-factor authentication disabled",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MessageResponse" },
                  examples: {
                    success: {
                      value: {
                        message: "Two-factor authentication disabled successfully",
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/check-email": {
        get: {
          tags: ["Authentication"],
          summary: "Check whether an email is available",
          parameters: [
            {
              in: "query",
              name: "email",
              required: true,
              schema: { type: "string", format: "email" },
              example: "ada@example.com",
            },
          ],
          responses: {
            200: {
              description: "Availability check completed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CheckAvailabilityResponse" },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/check-username": {
        get: {
          tags: ["Authentication"],
          summary: "Check whether a username is available",
          parameters: [
            {
              in: "query",
              name: "username",
              required: true,
              schema: { type: "string" },
              example: "adaelectric",
            },
          ],
          responses: {
            200: {
              description: "Availability check completed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/CheckAvailabilityResponse" },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/forgot-password": {
        post: {
          tags: ["Authentication"],
          summary: "Start the password reset flow",
          description: "Sends a reset email if the account exists.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ForgotPasswordRequest" },
                examples: {
                  default: {
                    value: {
                      email: "ada@example.com",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Reset request accepted",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MessageResponse" },
                  examples: {
                    success: {
                      value: {
                        message: "Password reset email sent if the account exists",
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            429: { $ref: "#/components/responses/TooManyRequests" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/reset-password": {
        post: {
          tags: ["Authentication"],
          summary: "Reset a password using a reset token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ResetPasswordRequest" },
                examples: {
                  default: {
                    value: {
                      token: "reset-token-example",
                      newPassword: "NewStrongPass123!",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Password reset completed",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MessageResponse" },
                  examples: {
                    success: {
                      value: {
                        message: "Password reset successful",
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            429: { $ref: "#/components/responses/TooManyRequests" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/verify-reset-token": {
        post: {
          tags: ["Authentication"],
          summary: "Verify a password reset token",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/VerifyResetTokenRequest" },
                examples: {
                  default: {
                    value: {
                      token: "reset-token-example",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Reset token verification completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      valid: { type: "boolean", example: true },
                      message: { type: "string", example: "Reset token is valid" },
                    },
                  },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/auth/token-status": {
        get: {
          tags: ["Authentication"],
          summary: "Get the status of the current access token",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "Token status retrieved successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/TokenStatusResponse" },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/user/profile": {
        get: {
          tags: ["User Management"],
          summary: "Get the current user's profile",
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: "Profile retrieved successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UserProfileResponse" },
                },
              },
            },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
        put: {
          tags: ["User Management"],
          summary: "Update the current user's profile",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateProfileRequest" },
                examples: {
                  default: {
                    value: {
                      name: "Ada Lovelace",
                      username: "adalovelace",
                      phoneNumber: "+2348012345678",
                      avatar: "https://cdn.nepa.com/avatars/ada.png",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Profile updated successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UpdateProfileResponse" },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/user/change-password": {
        post: {
          tags: ["User Management"],
          summary: "Change the current user's password",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ChangePasswordRequest" },
                examples: {
                  default: {
                    value: {
                      currentPassword: "StrongPass123!",
                      newPassword: "NewStrongPass123!",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Password changed successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MessageResponse" },
                  examples: {
                    success: {
                      value: {
                        message: "Password changed successfully",
                      },
                    },
                  },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/admin/users": {
        get: {
          tags: ["User Management"],
          summary: "List users for admin management",
          description: "Returns a paginated user list with optional search and filters.",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "search",
              schema: { type: "string" },
              example: "ada",
            },
            {
              in: "query",
              name: "page",
              schema: { type: "integer", default: 1 },
            },
            {
              in: "query",
              name: "limit",
              schema: { type: "integer", default: 10 },
            },
            {
              in: "query",
              name: "role",
              schema: { type: "string", enum: ["USER", "ADMIN", "SUPER_ADMIN"] },
            },
            {
              in: "query",
              name: "status",
              schema: { type: "string", enum: ["ACTIVE", "INACTIVE", "SUSPENDED", "PENDING_VERIFICATION"] },
            },
          ],
          responses: {
            200: {
              description: "Users retrieved successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/AdminUsersResponse" },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            403: { $ref: "#/components/responses/Forbidden" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/admin/users/{id}/role": {
        put: {
          tags: ["User Management"],
          summary: "Update a user's role or status",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "uuid" },
              example: "2a8e7d12-f0b1-4d85-9ae0-111111111111",
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/UpdateUserRoleRequest" },
                examples: {
                  promote: {
                    value: {
                      role: "ADMIN",
                      status: "ACTIVE",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "User role updated successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/UpdateUserRoleResponse" },
                },
              },
            },
            400: { $ref: "#/components/responses/BadRequest" },
            401: { $ref: "#/components/responses/Unauthorized" },
            403: { $ref: "#/components/responses/Forbidden" },
            404: { $ref: "#/components/responses/NotFound" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/admin/users/{id}": {
        delete: {
          tags: ["User Management"],
          summary: "Soft-delete a user account",
          description: "Marks the user inactive and revokes all active sessions.",
          security: [{ BearerAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string", format: "uuid" },
              example: "2a8e7d12-f0b1-4d85-9ae0-111111111111",
            },
          ],
          responses: {
            200: {
              description: "User deleted successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/MessageResponse" },
                  examples: {
                    success: {
                      value: {
                        message: "User deleted successfully",
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: "#/components/responses/Unauthorized" },
            403: { $ref: "#/components/responses/Forbidden" },
            404: { $ref: "#/components/responses/NotFound" },
            500: { $ref: "#/components/responses/InternalServerError" },
          },
        },
      },
      "/api/payment/process": {
        post: {
          tags: ["Payments"],
          summary: "Process a payment",
          description: "Processes a bill payment and returns the resulting transaction details.",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PaymentProcessRequest" },
                examples: {
                  stellar: {
                    value: {
                      billId: "bill_10023",
                      amount: 12500,
                      paymentMethod: "STELLAR",
                      stellarSecretKey: "SB3J6K5....",
                      recaptchaToken: "03AFcWeA...",
                    },
                  },
                  card: {
                    value: {
                      billId: "bill_10023",
                      amount: 12500,
                      paymentMethod: "CREDIT_CARD",
                      recaptchaToken: "03AFcWeA...",
                    },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: "Payment processed successfully",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/PaymentProcessResponse" },
                  examples: {
                    success: {
                      value: {
                        status: 200,
                        message: "Payment processed successfully",
                        data: {
                          transactionId: "txn_1714291200000_k3px8m2ae",
                          status: "completed",
                          stellarTransactionId: "2cfe7fcb...",
                        },
                      },
                    },
                  },
                },
              },
            },
            400: {
              description: "Payment validation or processing error",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                  examples: {
                    invalidAmount: {
                      value: {
                        status: 400,
                        error: "Payment amount must be greater than 0",
                      },
                    },
                    stellarFailure: {
                      value: {
                        status: 400,
                        error: "Stellar payment processing failed",
                        details: "Stellar secret key is required for Stellar payments",
                        transactionId: "txn_1714291200000_k3px8m2ae",
                      },
                    },
                  },
                },
              },
            },
            401: { $ref: "#/components/responses/Unauthorized" },
            429: { $ref: "#/components/responses/TooManyRequests" },
            500: {
              description: "Payment processing failed unexpectedly",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/ErrorResponse" },
                  examples: {
                    server: {
                      value: {
                        status: 500,
                        error: "Payment processing failed",
                        message: "Unexpected billing service error",
                        transactionId: "txn_1714291200000_k3px8m2ae",
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: ["./**/*.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);

export function getVersionedSwaggerSpec(version: string = "v1"): any {
  const versionedOptions = {
    ...options,
    definition: {
      ...options.definition,
      info: {
        ...options.definition?.info,
        version: version === "v2" ? "2.0.0" : "1.0.0",
        title: `Nepa API ${version.toUpperCase()}`,
        description: `API documentation for Nepa Billing System - ${version.toUpperCase()}`,
      },
      servers: [
        {
          url: `http://localhost:3000/api/${version}`,
          description: `Development server (${version})`,
        },
        ...(version === "v1"
          ? [
              {
                url: "https://api.nepa.com/v1",
                description: "Production server (v1)",
              },
            ]
          : [
              {
                url: "https://api.nepa.com/v2",
                description: "Production server (v2)",
              },
            ]),
      ],
    },
    apis: version === "v2" ? ["./**/*.v2.ts", "./**/v2/**/*.ts"] : ["./**/*.ts"],
  };

  return swaggerJsdoc(versionedOptions);
}
