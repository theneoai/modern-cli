import { createSession } from "../utils/history.js";

describe("createSession", () => {
  it("creates a session with a unique ID", () => {
    const s1 = createSession();
    const s2 = createSession();
    expect(s1.id).not.toBe(s2.id);
  });

  it("creates session with default title when no message given", () => {
    const session = createSession();
    expect(session.title).toBe("New conversation");
    expect(session.messages).toHaveLength(0);
  });

  it("truncates long first message to 50 chars", () => {
    const longMsg = "a".repeat(100);
    const session = createSession(longMsg);
    expect(session.title.length).toBeLessThanOrEqual(51); // 50 + ellipsis
    expect(session.title).toContain("…");
  });

  it("uses short message as title without truncation", () => {
    const msg = "Short message";
    const session = createSession(msg);
    expect(session.title).toBe(msg);
  });

  it("includes timestamps", () => {
    const session = createSession();
    expect(typeof session.createdAt).toBe("string");
    expect(typeof session.updatedAt).toBe("string");
    // Valid ISO dates
    expect(() => new Date(session.createdAt)).not.toThrow();
    expect(() => new Date(session.updatedAt)).not.toThrow();
  });
});
