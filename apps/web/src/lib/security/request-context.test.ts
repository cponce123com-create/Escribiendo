import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/env", () => ({ getServerEnv: () => ({ TRUSTED_PROXY_HOPS: 1 }) }));
import { resolveProxyIp, getRequestContext } from "./request-context";
describe("IP del proxy", () => {
  it("cuenta desde la derecha y no confía en un prefijo del cliente", () => {
    expect(resolveProxyIp("1.2.3.4, 9.9.9.9", 1)).toBe("9.9.9.9");
    expect(resolveProxyIp("8.8.8.8, 1.2.3.4, 9.9.9.9", 1)).toBe("9.9.9.9");
    expect(resolveProxyIp("1.2.3.4, 9.9.9.9", 2)).toBe("1.2.3.4");
    expect(resolveProxyIp("9.9.9.9", 3)).toBe("9.9.9.9");
  });
  it("descarta basura en la posición de confianza sin desplazarla", () => {
    expect(resolveProxyIp("1.2.3.4, basura", 1)).toBeNull();
    expect(resolveProxyIp("1.2.3.4, ", 1)).toBeNull();
    expect(resolveProxyIp("127.0.0.1:3000", 1)).toBeNull();
    expect(resolveProxyIp(null, 1)).toBeNull();
    expect(resolveProxyIp("9.9.9.9", 0)).toBeNull();
  });
  it("normaliza IPv6 equivalente para que no rote el límite", () => {
    expect(resolveProxyIp("2001:0db8:0000:0000:0000:0000:0000:0001", 1)).toBe("2001:db8::1");
  });
  it("sin cabecera no fabrica una IP", async () => {
    expect(await getRequestContext()).toMatchObject({ ip: null, ipHash: null });
  });
});
