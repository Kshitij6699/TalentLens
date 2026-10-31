type SeedStatus = {
  status: 'idle' | 'failed' | 'success' | 'files-not-found';
  timestamp: string | null;
  errorMessage: string;
  resolvedEmployeePath: string | null;
  resolvedMentorPath: string | null;
  triedPaths: string[];
};

const seedUnavailableMessage = 'Excel synchronization is unavailable because its importer module is missing. Existing PostgreSQL records are unchanged.';

let seedStatus: SeedStatus = {
  status: 'idle',
  timestamp: null,
  errorMessage: seedUnavailableMessage,
  resolvedEmployeePath: null,
  resolvedMentorPath: null,
  triedPaths: [],
};

export const getSeedStatus = (): SeedStatus => seedStatus;

export const seedFromExcelFiles = async (_force = false): Promise<void> => {
  seedStatus = {
    ...seedStatus,
    status: 'failed',
    timestamp: new Date().toISOString(),
  };
  throw new Error(seedUnavailableMessage);
};

export const mapExcelLevelToDesignation = (level: unknown): string => {
  const designation = String(level ?? '').trim();
  return designation || 'Consultant';
};

export const getDesignationRank = (designation: unknown): number => {
  const value = String(designation ?? '').toLowerCase();
  if (value.includes('manager') && value.includes('senior')) return 6;
  if (value.includes('manager')) return 5;
  if (value.includes('assistant manager') || value === 'am') return 4;
  if (value.includes('senior') || value.includes('consultant') || value === 'con') return 3;
  if (value.includes('executive') || value.includes('associate consultant') || value === 'acon') return 2;
  return 1;
};