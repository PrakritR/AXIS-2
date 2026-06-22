import { vi } from "vitest";

export const mockSupabaseAuth = {
  admin: {
    createUser: vi.fn(),
    listUsers: vi.fn(),
    updateUserById: vi.fn(),
  },
};

export const mockSupabaseFrom = vi.fn();

export function createMockSupabaseClient() {
  return {
    auth: mockSupabaseAuth,
    from: mockSupabaseFrom,
  };
}

export function resetSupabaseMocks() {
  mockSupabaseAuth.admin.createUser.mockReset();
  mockSupabaseAuth.admin.listUsers.mockReset();
  mockSupabaseAuth.admin.updateUserById.mockReset();
  mockSupabaseFrom.mockReset();
}
