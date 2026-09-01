/**
 * OneRoster filter grammar.
 *
 *   filter=<field><op>'<value>'
 *   filter=<field><op>'<value>' AND <field><op>'<value>'
 *
 * Operators: = != > < >= <= ~   (~ is "contains")
 * Logical:   AND OR             (single level; the spec does not have brackets)
 *
 * The parser exists rather than a regex-and-concatenate because this string
 * arrives from a client and ends up in SQL. Fields are checked against an
 * allow-list and values are always bound, never interpolated.
 */

export type Operator = "=" | "!=" | ">" | "<" | ">=" | "<=" | "~";

export interface Predicate {
  field: string;
  operator: Operator;
  value: string;
}

export interface ParsedFilter {
  predicates: Predicate[];
  joiner: "AND" | "OR";
}

export class FilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilterError";
  }
}

const OPERATOR_PATTERN = /(>=|<=|!=|=|>|<|~)/;

export function parseFilter(raw: string): ParsedFilter {
  const trimmed = raw.trim();
  if (trimmed === "") throw new FilterError("filter is empty");

  // Split on AND/OR, but only outside quoted values.
  const parts: string[] = [];
  const joiners: ("AND" | "OR")[] = [];
  let buffer = "";
  let inQuote = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i] as string;
    if (char === "'") {
      inQuote = !inQuote;
      buffer += char;
      continue;
    }
    if (!inQuote) {
      const ahead = trimmed.slice(i);
      const andMatch = /^\s+AND\s+/i.exec(ahead);
      const orMatch = /^\s+OR\s+/i.exec(ahead);
      const match = andMatch ?? orMatch;
      if (match) {
        parts.push(buffer);
        joiners.push(andMatch ? "AND" : "OR");
        buffer = "";
        i += match[0].length - 1;
        continue;
      }
    }
    buffer += char;
  }
  parts.push(buffer);

  if (inQuote) throw new FilterError("unterminated quoted value in filter");

  // The specification does not define precedence, so a filter mixing AND with
  // OR is ambiguous. Rejecting it is more honest than picking an order.
  const distinct = new Set(joiners);
  if (distinct.size > 1) {
    throw new FilterError("mixing AND with OR in one filter is not supported");
  }

  const predicates = parts.map((part) => parsePredicate(part.trim()));
  return { predicates, joiner: joiners[0] ?? "AND" };
}

function parsePredicate(part: string): Predicate {
  const match = OPERATOR_PATTERN.exec(part);
  if (!match || match.index === undefined) {
    throw new FilterError(`no operator found in predicate: ${part}`);
  }
  const operator = match[0] as Operator;
  const field = part.slice(0, match.index).trim();
  let value = part.slice(match.index + operator.length).trim();

  if (field === "") throw new FilterError(`missing field in predicate: ${part}`);

  if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
    value = value.slice(1, -1);
  }
  return { field, operator, value };
}

/**
 * Renders a parsed filter to a parameterised SQL fragment.
 *
 * `columns` maps OneRoster field names to physical columns. A field that is
 * not in the map is rejected, which both satisfies the specification (unknown
 * field is a client error) and closes the injection route.
 */
export function toSql(
  filter: ParsedFilter,
  columns: Record<string, string>,
): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  for (const predicate of filter.predicates) {
    const column = columns[predicate.field];
    if (!column) {
      throw new FilterError(`unknown field in filter: ${predicate.field}`);
    }
    if (predicate.operator === "~") {
      clauses.push(`${column} LIKE ?`);
      params.push(`%${predicate.value}%`);
    } else {
      clauses.push(`${column} ${predicate.operator} ?`);
      params.push(predicate.value);
    }
  }

  return { sql: clauses.join(` ${filter.joiner} `), params };
}
