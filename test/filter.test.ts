import { describe, expect, it } from "vitest";
import { FilterError, parseFilter, toSql } from "../src/db/filter.js";

const COLUMNS = {
  role: "role",
  familyName: "family_name",
  dateLastModified: "date_last_modified",
};

describe("parseFilter", () => {
  it("parses a single equality predicate", () => {
    expect(parseFilter("role='teacher'")).toEqual({
      predicates: [{ field: "role", operator: "=", value: "teacher" }],
      joiner: "AND",
    });
  });

  it("parses the delta filter a consumer actually sends", () => {
    const parsed = parseFilter("dateLastModified>'2026-09-01T00:00:00.000Z'");
    expect(parsed.predicates[0]).toEqual({
      field: "dateLastModified",
      operator: ">",
      value: "2026-09-01T00:00:00.000Z",
    });
  });

  it("parses two predicates joined by AND", () => {
    const parsed = parseFilter("role='student' AND familyName~'Garcia'");
    expect(parsed.predicates).toHaveLength(2);
    expect(parsed.joiner).toBe("AND");
  });

  it("does not split on AND inside a quoted value", () => {
    const parsed = parseFilter("familyName='Baker AND Sons'");
    expect(parsed.predicates).toHaveLength(1);
    expect(parsed.predicates[0]?.value).toBe("Baker AND Sons");
  });

  it("rejects a mixed AND/OR filter rather than guessing precedence", () => {
    expect(() => parseFilter("a='1' AND b='2' OR c='3'")).toThrow(FilterError);
  });

  it("rejects an unterminated quote", () => {
    expect(() => parseFilter("familyName='Garcia")).toThrow(FilterError);
  });

  it("rejects a predicate with no operator", () => {
    expect(() => parseFilter("familyName")).toThrow(FilterError);
  });
});

describe("toSql", () => {
  it("binds values rather than interpolating them", () => {
    const { sql, params } = toSql(parseFilter("role='teacher'"), COLUMNS);
    expect(sql).toBe("role = ?");
    expect(params).toEqual(["teacher"]);
  });

  it("maps contains to LIKE with wildcards", () => {
    const { sql, params } = toSql(parseFilter("familyName~'Gar'"), COLUMNS);
    expect(sql).toBe("family_name LIKE ?");
    expect(params).toEqual(["%Gar%"]);
  });

  it("refuses a field that is not in the allow-list", () => {
    expect(() => toSql(parseFilter("password='x'"), COLUMNS)).toThrow(FilterError);
  });

  it("cannot be used to inject SQL", () => {
    const { sql, params } = toSql(
      parseFilter("familyName='x'' OR 1=1 --'"),
      COLUMNS,
    );
    expect(sql).toBe("family_name = ?");
    expect(params[0]).toContain("OR 1=1");
  });
});
