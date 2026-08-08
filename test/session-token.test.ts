import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
import {
  signSession,
  verifySession,
  bearerFrom,
  isSessionSigningConfigured,
  resetSigningKeyCache,
} from "@/lib/session-token";

// The signing primitive behind both admin and portal auth. Before this
// existed, auth was a comparison against the literal string 'authenticated',
// which made `Authorization: Bearer authenticated` a full admin bypass.

const ORIGINAL = process.env.SESSION_SECRET;

beforeEach(() => {
  process.env.SESSION_SECRET = "unit-test-secret-abcdefghijklmnop";
  resetSigningKeyCache();
});

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = ORIGINAL;
  resetSigningKeyCache();
});

describe("signSession / verifySession", () => {
  it("round-trips an admin token", async () => {
    const token = await signSession("admin", "admin", 60);
    const payload = await verifySession(token, "admin");
    expect(payload?.role).toBe("admin");
    expect(payload?.sub).toBe("admin");
  });

  it("round-trips a portal token carrying the customer id", async () => {
    const token = await signSession("portal", "cust-abc123", 60);
    const payload = await verifySession(token, "portal");
    expect(payload?.sub).toBe("cust-abc123");
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession("admin", "admin", 60);
    process.env.SESSION_SECRET = "a-completely-different-secret-value";
    resetSigningKeyCache();
    expect(await verifySession(token, "admin")).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession("portal", "cust-abc123", 60);
    const [body, sig] = token.split(".");
    // Re-encode the payload claiming to be a different customer, keep the
    // original signature. This is the impersonation attempt the HMAC prevents.
    const forgedBody = btoa(JSON.stringify({ role: "portal", sub: "cust-victim", exp: 9999999999 }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await verifySession(`${forgedBody}.${sig}`, "portal")).toBeNull();
    void body;
  });

  it("rejects an expired token", async () => {
    const token = await signSession("portal", "cust-abc123", -1);
    expect(await verifySession(token, "portal")).toBeNull();
  });

  it("rejects a token presented for the wrong role", async () => {
    const portal = await signSession("portal", "cust-abc123", 60);
    expect(await verifySession(portal, "admin")).toBeNull();
    const admin = await signSession("admin", "admin", 60);
    expect(await verifySession(admin, "portal")).toBeNull();
  });

  it("rejects junk, empty, and marker-string inputs", async () => {
    for (const bad of ["", "authenticated", "Bearer", "a.b", "....", "cust-abc123"]) {
      expect(await verifySession(bad, "admin")).toBeNull();
      expect(await verifySession(bad, "portal")).toBeNull();
    }
    expect(await verifySession(null, "admin")).toBeNull();
    expect(await verifySession(undefined, "portal")).toBeNull();
  });
});

describe("secret configuration", () => {
  it("reports configured when SESSION_SECRET is set", () => {
    expect(isSessionSigningConfigured()).toBe(true);
  });

  it("falls back to the Supabase service-role key so no new env var is needed", () => {
    delete process.env.SESSION_SECRET;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-long-enough-here";
    resetSigningKeyCache();
    expect(isSessionSigningConfigured()).toBe(true);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    resetSigningKeyCache();
  });

  describe("fail-closed when no secret is configured", () => {
    const ORIGINAL_ENV = process.env.NODE_ENV;

    // process.env is a special object in Node — Object.defineProperty throws
    // on it. Plain assignment is the supported way to mutate it.
    const env = process.env as Record<string, string | undefined>;

    function stripSecrets(nodeEnv: string) {
      delete env.SESSION_SECRET;
      delete env.SUPABASE_SERVICE_ROLE_KEY;
      env.NODE_ENV = nodeEnv;
      resetSigningKeyCache();
    }

    afterEach(() => {
      env.NODE_ENV = ORIGINAL_ENV;
      resetSigningKeyCache();
    });

    it("production with no secret: refuses to sign and verifies nothing", async () => {
      stripSecrets("production");
      expect(isSessionSigningConfigured()).toBe(false);
      await expect(signSession("admin", "admin", 60)).rejects.toThrow(/SESSION_SECRET/);
      expect(await verifySession("anything", "admin")).toBeNull();
    });

    it("an unrecognized NODE_ENV also fails closed, not open", async () => {
      // The dev secret is allow-listed by name. A `!== 'production'` check
      // would hand out a publicly-known signing key here, which is the exact
      // bug class this module replaced.
      stripSecrets("staging");
      expect(isSessionSigningConfigured()).toBe(false);
      expect(await verifySession("anything", "admin")).toBeNull();
    });

    it("development with no secret still works so local dev is not blocked", () => {
      stripSecrets("development");
      expect(isSessionSigningConfigured()).toBe(true);
    });
  });
});

describe("bearerFrom", () => {
  it("extracts the token", () => {
    expect(bearerFrom("Bearer abc.def")).toBe("abc.def");
  });
  it("ignores non-Bearer and empty headers", () => {
    expect(bearerFrom("Basic abc")).toBeNull();
    expect(bearerFrom("Bearer ")).toBeNull();
    expect(bearerFrom(null)).toBeNull();
    expect(bearerFrom(undefined)).toBeNull();
  });
});
