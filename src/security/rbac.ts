import type { ResourceCategory } from "@/security/categories";
import { classifyPrefix } from "@/security/categories";

export type Verb = "read" | "create" | "update" | "delete" | "*";

export interface Permission {
  category: string; // ResourceCategory or "*"
  verb: Verb;
}

export interface RoleDefinition {
  permissions: Permission[];
  inherits?: string;
}

export type RoleMap = Record<string, RoleDefinition>;

export const DEFAULT_ROLES: RoleMap = {
  admin: { permissions: [{ category: "*", verb: "*" }] },
  lead: {
    permissions: [
      { category: "work", verb: "*" },
      { category: "people", verb: "*" },
      { category: "content", verb: "*" },
      { category: "reporting", verb: "read" },
    ],
  },
  member: {
    permissions: [
      { category: "work", verb: "*" },
      { category: "people", verb: "read" },
      { category: "content", verb: "read" },
    ],
  },
  finance: {
    permissions: [
      { category: "financial", verb: "*" },
      { category: "people", verb: "read" },
      { category: "reporting", verb: "read" },
    ],
  },
  external: {
    permissions: [
      { category: "work", verb: "read" },
      { category: "content", verb: "read" },
    ],
  },
  viewer: { permissions: [{ category: "*", verb: "read" }] },
};

/**
 * Follows the inheritance chain for a role and returns all permissions.
 */
export function resolvePermissions(role: string, roles: RoleMap): Permission[] {
  const visited = new Set<string>();
  const permissions: Permission[] = [];

  let current: string | undefined = role;
  while (current && !visited.has(current)) {
    visited.add(current);
    const def: RoleDefinition | undefined = roles[current];
    if (!def) break;
    permissions.push(...def.permissions);
    current = def.inherits;
  }

  return permissions;
}

/**
 * Checks if a role can perform a verb on a category.
 */
export function isAllowed(
  category: ResourceCategory | string,
  verb: Verb | string,
  role: string,
  roles: RoleMap,
): boolean {
  const permissions = resolvePermissions(role, roles);
  if (permissions.length === 0) return false;

  return permissions.some((p) => {
    const categoryMatch = p.category === "*" || p.category === category;
    const verbMatch = p.verb === "*" || p.verb === verb;
    return categoryMatch && verbMatch;
  });
}

/**
 * Maps HTTP method to RBAC verb.
 */
export function methodToVerb(httpMethod: string): Verb {
  switch (httpMethod.toLowerCase()) {
    case "get":
      return "read";
    case "post":
      return "create";
    case "put":
    case "patch":
      return "update";
    case "delete":
      return "delete";
    default:
      return "read";
  }
}

export interface FilterableTool {
  name: string;
  prefix: string;
  method: string;
}

/**
 * Filters a tool list to those allowed for a given role.
 */
export function filterTools(
  tools: FilterableTool[],
  role: string,
  roles: RoleMap,
): FilterableTool[] {
  return tools.filter((tool) => {
    const category = classifyPrefix(tool.prefix);
    const verb = methodToVerb(tool.method);
    return isAllowed(category, verb, role, roles);
  });
}
