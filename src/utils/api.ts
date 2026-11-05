/**
 * Secure HTTP Request Header utilities for TalentLens.
 *
 * STRICT PRODUCTION POLICY:
 * In production (import.meta.env.PROD === true), mock and simulated role headers
 * (x-simulated-role, x-mock-role) are NEVER attached under any circumstances.
 *
 * In development, if no Firebase Bearer token is active, x-simulated-role is provided
 * to support frictionless role simulation in the developer sandbox.
 */

export const createRequestHeaders = (
  token: string | null,
  simulatedRole?: string
): Record<string, string> => {
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (!import.meta.env.PROD && simulatedRole) {
    headers['x-simulated-role'] = simulatedRole;
  }
  return headers;
};

export const createJsonHeaders = (
  token: string | null,
  simulatedRole?: string
): Record<string, string> => {
  return {
    'Content-Type': 'application/json',
    ...createRequestHeaders(token, simulatedRole),
  };
};
