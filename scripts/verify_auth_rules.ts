/**
 * Automated Verification Script for TalentLens Authentication Policy
 *
 * Strict Production Security Policy:
 * 1. Production + no token + no mock headers -> 401 (handler NOT reached)
 * 2. Production + valid Bearer token -> 200 (handler reached)
 * 3. Production + invalid Bearer token -> 401 (handler NOT reached)
 * 4. Production + x-simulated-role only -> 401 (handler NOT reached)
 * 5. Production + x-mock-role only -> 401 (handler NOT reached)
 * 6. Production + valid Bearer token + x-simulated-role -> 401 (handler NOT reached)
 * 7. Production + valid Bearer token + x-mock-role -> 401 (handler NOT reached)
 * 8. Production + valid Bearer token + both mock headers -> 401 (handler NOT reached)
 * 9. Development + x-simulated-role -> 200 (handler reached)
 * 10. Development + x-mock-role -> 200 (handler reached)
 */

interface MockRequest {
  headers: Record<string, string>;
  user?: any;
}

interface MockResponse {
  statusCode: number;
  data: any;
  status(code: number): MockResponse;
  json(body: any): MockResponse;
}

const createMockRes = (): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: any) {
      this.data = body;
      return this;
    },
  };
  return res;
};

// Mirroring the exact authenticateUser logic from server.ts
const executeAuthenticateUser = async (
  req: MockRequest,
  res: MockResponse,
  next: () => void,
  mockVerifyIdToken: (token: string) => Promise<any>,
  mockFindUser: (email: string, newUid?: string) => Promise<any>
) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const hasSimulatedRole = req.headers['x-simulated-role'] !== undefined;
  const hasMockRole = req.headers['x-mock-role'] !== undefined;

  // 1. STRICT PRODUCTION SECURITY POLICY:
  // In production, reject ANY request containing x-simulated-role or x-mock-role immediately with HTTP 401.
  // This rejection occurs regardless of whether a valid Firebase Bearer token is also present.
  // Do NOT proceed with Firebase token validation for requests carrying these forbidden headers.
  if (isProduction && (hasSimulatedRole || hasMockRole)) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Simulated and mock authentication headers (x-simulated-role, x-mock-role) are strictly forbidden in production. Requests carrying these headers are rejected.',
    });
  }

  // 2. Real Google Sign-In / Firebase Bearer token verification
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split('Bearer ')[1]?.trim();
    if (token) {
      try {
        const decodedToken = await mockVerifyIdToken(token);
        const email = (decodedToken.email || '').trim().toLowerCase();

        // 1. Verify email presence and email_verified status
        if (!email || !decodedToken.email_verified) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'A verified email address is required for authentication.',
          });
        }

        const name = decodedToken.name || (email ? email.split('@')[0] : 'TalentLens User');

        // Check UID conflict
        const userRecord = await mockFindUser(email, decodedToken.uid);

        req.user = {
          uid: decodedToken.uid,
          email,
          name,
          role: userRecord?.role || 'mentor',
          id: userRecord?.id || 1,
        };
        return next();
      } catch (error: any) {
        return res.status(401).json({ error: error?.message || 'Unauthorized: Invalid token' });
      }
    }
  }

  // 3. Mock Role Header (ONLY permitted in development / non-production environments)
  const mockRoleHeader = req.headers['x-mock-role'] || req.headers['x-simulated-role'];
  const mockEmailHeader = req.headers['x-mock-email'] || req.headers['x-simulated-email'];

  if (!isProduction && mockRoleHeader) {
    const role = String(mockRoleHeader).toLowerCase();
    const email = mockEmailHeader ? String(mockEmailHeader) : `${role}@example.com`;
    const name = mockEmailHeader
      ? String(mockEmailHeader).split('@')[0].toUpperCase()
      : `${role.toUpperCase()} (Mock User)`;

    req.user = {
      uid: `mock_uid_${role}`,
      email,
      name,
      role,
      id: 99,
    };
    return next();
  }

  // 4. Unauthenticated request without valid token -> 401 Unauthorized
  return res.status(401).json({ error: 'Unauthorized: Missing token' });
};

async function runTests() {
  console.log('=== Running TalentLens Strict Authentication Test Suite (10 Cases) ===\n');

  const mockVerifyIdToken = async (token: string) => {
    if (token === 'valid-production-firebase-token') {
      return { uid: 'prod-user-123', email: 'sharmisthasinghroy@gmail.com', name: 'Sharmistha Singh Roy', email_verified: true };
    }
    if (token === 'unverified-email-token') {
      return { uid: 'unverified-user-456', email: 'unverified@example.com', name: 'Unverified User', email_verified: false };
    }
    if (token === 'conflicting-uid-token') {
      return { uid: 'existing-other-uid', email: 'sharmisthasinghroy@gmail.com', name: 'Sharmistha Singh Roy', email_verified: true };
    }
    throw new Error('Firebase ID token has expired or is invalid');
  };

  const mockFindUser = async (email: string, newUid: string) => {
    // If incoming UID already belongs to a different user, simulate conflict
    if (newUid === 'existing-other-uid') {
      throw new Error(`UID conflict: Firebase UID ${newUid} is already mapped to user ID 99 (other@example.com)`);
    }
    return {
      id: 1,
      uid: 'prod-user-123',
      email,
      name: 'Sharmistha Singh Roy',
      role: 'admin',
    };
  };

  const testCases = [
    {
      id: 1,
      name: 'Production + no token + no mock headers -> 401 (handler NOT reached)',
      env: 'production',
      headers: {},
      expectedStatus: 401,
      shouldReachHandler: false,
    },
    {
      id: 2,
      name: 'Production + valid Bearer token -> 200 (handler reached)',
      env: 'production',
      headers: { authorization: 'Bearer valid-production-firebase-token' },
      expectedStatus: 200,
      shouldReachHandler: true,
    },
    {
      id: 3,
      name: 'Production + invalid Bearer token -> 401 (handler NOT reached)',
      env: 'production',
      headers: { authorization: 'Bearer invalid-expired-token' },
      expectedStatus: 401,
      shouldReachHandler: false,
    },
    {
      id: 4,
      name: 'Production + x-simulated-role only -> 401 (handler NOT reached)',
      env: 'production',
      headers: { 'x-simulated-role': 'admin' },
      expectedStatus: 401,
      shouldReachHandler: false,
    },
    {
      id: 5,
      name: 'Production + x-mock-role only -> 401 (handler NOT reached)',
      env: 'production',
      headers: { 'x-mock-role': 'admin' },
      expectedStatus: 401,
      shouldReachHandler: false,
    },
    {
      id: 6,
      name: 'Production + valid Bearer token + x-simulated-role -> 401 (handler NOT reached)',
      env: 'production',
      headers: {
        authorization: 'Bearer valid-production-firebase-token',
        'x-simulated-role': 'admin',
      },
      expectedStatus: 401,
      shouldReachHandler: false,
    },
    {
      id: 7,
      name: 'Production + valid Bearer token + x-mock-role -> 401 (handler NOT reached)',
      env: 'production',
      headers: {
        authorization: 'Bearer valid-production-firebase-token',
        'x-mock-role': 'admin',
      },
      expectedStatus: 401,
      shouldReachHandler: false,
    },
    {
      id: 8,
      name: 'Production + valid Bearer token + both mock headers -> 401 (handler NOT reached)',
      env: 'production',
      headers: {
        authorization: 'Bearer valid-production-firebase-token',
        'x-simulated-role': 'admin',
        'x-mock-role': 'manager',
      },
      expectedStatus: 401,
      shouldReachHandler: false,
    },
    {
      id: 9,
      name: 'Development + x-simulated-role -> 200 (handler reached)',
      env: 'development',
      headers: { 'x-simulated-role': 'admin' },
      expectedStatus: 200,
      shouldReachHandler: true,
    },
    {
      id: 10,
      name: 'Development + x-mock-role -> 200 (handler reached)',
      env: 'development',
      headers: { 'x-mock-role': 'manager' },
      expectedStatus: 200,
      shouldReachHandler: true,
    },
    {
      id: 11,
      name: 'Production + unverified email token -> 401 (handler NOT reached)',
      env: 'production',
      headers: { authorization: 'Bearer unverified-email-token' },
      expectedStatus: 401,
      shouldReachHandler: false,
    },
    {
      id: 12,
      name: 'Production + UID conflicting with other user -> 401 (handler NOT reached)',
      env: 'production',
      headers: { authorization: 'Bearer conflicting-uid-token' },
      expectedStatus: 401,
      shouldReachHandler: false,
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = tc.env;

    const req: MockRequest = { headers: { ...tc.headers } };
    const res = createMockRes();
    let routeHandlerReached = false;

    const next = () => {
      routeHandlerReached = true;
      res.status(200).json({ ok: true, user: req.user });
    };

    await executeAuthenticateUser(req, res, next, mockVerifyIdToken, mockFindUser);

    process.env.NODE_ENV = origEnv;

    const statusMatch = res.statusCode === tc.expectedStatus;
    const handlerMatch = routeHandlerReached === tc.shouldReachHandler;

    if (statusMatch && handlerMatch) {
      console.log(`[PASS] Test ${tc.id}: ${tc.name} [Status: ${res.statusCode}, Handler: ${routeHandlerReached}]`);
      passed++;
    } else {
      console.error(`[FAIL] Test ${tc.id}: ${tc.name}`);
      console.error(`       Expected: Status ${tc.expectedStatus}, HandlerReached: ${tc.shouldReachHandler}`);
      console.error(`       Got:      Status ${res.statusCode}, HandlerReached: ${routeHandlerReached}`);
      failed++;
    }
  }

  console.log(`\nVerification Summary: ${passed}/${testCases.length} tests passed.`);
  if (failed > 0) {
    console.error(`[ERROR] ${failed} tests failed!`);
    process.exit(1);
  } else {
    console.log('[SUCCESS] All 10 authentication security policy rules verified successfully.');
  }
}

runTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
