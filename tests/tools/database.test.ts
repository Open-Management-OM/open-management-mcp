import { describe, it, expect } from "vitest";
import { isReadOnly } from "@/tools/database";

describe("SQL read-only validation", () => {
  // Allowed queries
  it("allows simple SELECT", () => {
    expect(isReadOnly("SELECT * FROM users").safe).toBe(true);
  });

  it("allows SELECT with WHERE", () => {
    expect(isReadOnly("SELECT id, name FROM tickets WHERE status = 'open'").safe).toBe(true);
  });

  it("allows CTEs (WITH)", () => {
    expect(isReadOnly("WITH recent AS (SELECT * FROM logs WHERE created > NOW() - INTERVAL '1 day') SELECT * FROM recent").safe).toBe(true);
  });

  it("allows EXPLAIN", () => {
    expect(isReadOnly("EXPLAIN SELECT * FROM users").safe).toBe(true);
  });

  it("allows SHOW", () => {
    expect(isReadOnly("SHOW tables").safe).toBe(true);
  });

  it("allows case-insensitive SELECT", () => {
    expect(isReadOnly("select * from users").safe).toBe(true);
  });

  // Blocked queries
  it("blocks INSERT", () => {
    const result = isReadOnly("INSERT INTO users (name) VALUES ('evil')");
    expect(result.safe).toBe(false);
  });

  it("blocks UPDATE", () => {
    const result = isReadOnly("UPDATE users SET name = 'evil'");
    expect(result.safe).toBe(false);
  });

  it("blocks DELETE", () => {
    const result = isReadOnly("DELETE FROM users");
    expect(result.safe).toBe(false);
  });

  it("blocks DROP TABLE", () => {
    const result = isReadOnly("DROP TABLE users");
    expect(result.safe).toBe(false);
  });

  it("blocks CREATE TABLE", () => {
    const result = isReadOnly("CREATE TABLE evil (id int)");
    expect(result.safe).toBe(false);
  });

  it("blocks ALTER TABLE", () => {
    const result = isReadOnly("ALTER TABLE users ADD COLUMN evil text");
    expect(result.safe).toBe(false);
  });

  it("blocks TRUNCATE", () => {
    const result = isReadOnly("TRUNCATE TABLE users");
    expect(result.safe).toBe(false);
  });

  it("blocks GRANT", () => {
    const result = isReadOnly("GRANT ALL ON users TO evil");
    expect(result.safe).toBe(false);
  });

  // Injection attempts
  it("blocks SELECT with hidden DELETE via semicolon", () => {
    const result = isReadOnly("SELECT 1; DELETE FROM users");
    expect(result.safe).toBe(false);
  });

  it("blocks SELECT with hidden DROP via semicolon", () => {
    const result = isReadOnly("SELECT 1; DROP TABLE users");
    expect(result.safe).toBe(false);
  });

  it("blocks DELETE hidden in SQL comment", () => {
    const result = isReadOnly("/* harmless */ DELETE FROM users");
    expect(result.safe).toBe(false);
  });

  it("blocks UPDATE hidden after line comment", () => {
    const result = isReadOnly("-- just a comment\nUPDATE users SET x = 1");
    expect(result.safe).toBe(false);
  });

  it("blocks SELECT containing UPDATE keyword", () => {
    const result = isReadOnly("SELECT * FROM users; UPDATE users SET x = 1");
    expect(result.safe).toBe(false);
  });
});
