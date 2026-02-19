import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @supabase/supabase-js before importing the module under test
const mockCreateClient = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: mockCreateClient,
}));

// Mock @supabase/ssr
const mockCreateServerClient = vi.fn();
const mockParseCookieHeader = vi.fn();
const mockSerializeCookieHeader = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: mockCreateServerClient,
  parseCookieHeader: mockParseCookieHeader,
  serializeCookieHeader: mockSerializeCookieHeader,
}));

describe("supabase.server", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  describe("getSupabaseAdminClient", () => {
    it("returns a Supabase client", async () => {
      const fakeClient = { from: vi.fn() };
      mockCreateClient.mockReturnValue(fakeClient);

      const { getSupabaseAdminClient } = await import(
        "~/lib/supabase.server"
      );
      const client = getSupabaseAdminClient();

      expect(client).toBe(fakeClient);
      expect(mockCreateClient).toHaveBeenCalledWith(
        "https://test.supabase.co",
        "test-secret-key",
      );
    });

    it("returns singleton on subsequent calls", async () => {
      const fakeClient = { from: vi.fn() };
      mockCreateClient.mockReturnValue(fakeClient);

      const { getSupabaseAdminClient } = await import(
        "~/lib/supabase.server"
      );
      const client1 = getSupabaseAdminClient();
      const client2 = getSupabaseAdminClient();

      expect(client1).toBe(client2);
      expect(mockCreateClient).toHaveBeenCalledTimes(1);
    });
  });

  describe("createSupabaseServerClient", () => {
    it("creates a server client with correct URL and anon key", async () => {
      const fakeServerClient = { auth: { getUser: vi.fn() } };
      mockCreateServerClient.mockReturnValue(fakeServerClient);
      mockParseCookieHeader.mockReturnValue([]);

      const { createSupabaseServerClient } = await import(
        "~/lib/supabase.server"
      );

      const request = new Request("https://example.com", {
        headers: { Cookie: "" },
      });
      const { supabase } = createSupabaseServerClient(request);

      expect(supabase).toBe(fakeServerClient);
      expect(mockCreateServerClient).toHaveBeenCalledWith(
        "https://test.supabase.co",
        "test-anon-key",
        expect.objectContaining({
          cookies: expect.objectContaining({
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          }),
        }),
      );
    });

    it("parses cookies from request headers", async () => {
      const fakeServerClient = { auth: { getUser: vi.fn() } };
      mockCreateServerClient.mockReturnValue(fakeServerClient);
      mockParseCookieHeader.mockReturnValue([
        { name: "sb-token", value: "abc123" },
      ]);

      const { createSupabaseServerClient } = await import(
        "~/lib/supabase.server"
      );

      const request = new Request("https://example.com", {
        headers: { Cookie: "sb-token=abc123" },
      });
      createSupabaseServerClient(request);

      // Get the cookies config that was passed to createServerClient
      const cookiesConfig = mockCreateServerClient.mock.calls[0][2].cookies;
      const cookies = cookiesConfig.getAll();

      expect(mockParseCookieHeader).toHaveBeenCalledWith("sb-token=abc123");
      expect(cookies).toEqual([{ name: "sb-token", value: "abc123" }]);
    });

    it("returns response headers for cookie setting", async () => {
      const fakeServerClient = { auth: { getUser: vi.fn() } };
      mockCreateServerClient.mockReturnValue(fakeServerClient);
      mockParseCookieHeader.mockReturnValue([]);

      const { createSupabaseServerClient } = await import(
        "~/lib/supabase.server"
      );

      const request = new Request("https://example.com");
      const responseHeaders = new Headers();
      const result = createSupabaseServerClient(request, responseHeaders);

      expect(result.headers).toBe(responseHeaders);
    });

    it("sets cookies on response headers via setAll", async () => {
      const fakeServerClient = { auth: { getUser: vi.fn() } };
      mockCreateServerClient.mockReturnValue(fakeServerClient);
      mockParseCookieHeader.mockReturnValue([]);
      mockSerializeCookieHeader.mockReturnValue(
        "sb-token=abc123; Path=/; HttpOnly",
      );

      const { createSupabaseServerClient } = await import(
        "~/lib/supabase.server"
      );

      const request = new Request("https://example.com");
      const responseHeaders = new Headers();
      createSupabaseServerClient(request, responseHeaders);

      // Get the cookies config and call setAll
      const cookiesConfig = mockCreateServerClient.mock.calls[0][2].cookies;
      cookiesConfig.setAll([
        { name: "sb-token", value: "abc123", options: { path: "/" } },
      ]);

      expect(mockSerializeCookieHeader).toHaveBeenCalledWith(
        "sb-token",
        "abc123",
        { path: "/" },
      );
      expect(responseHeaders.get("Set-Cookie")).toBe(
        "sb-token=abc123; Path=/; HttpOnly",
      );
    });
  });
});
