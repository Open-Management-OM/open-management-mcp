export type ResourceCategory =
  | "work"
  | "people"
  | "financial"
  | "content"
  | "config"
  | "reporting"
  | "uncategorized";

export const CATEGORY_HINTS: Record<string, string[]> = {
  work: [
    "task", "ticket", "issue", "deal", "opportunity", "project", "order",
    "job", "request", "card", "board", "sprint", "milestone", "incident",
    "case", "workflow", "pipeline", "stage", "appointment", "booking",
  ],
  people: [
    "contact", "lead", "company", "account", "customer", "client", "member",
    "user", "person", "org", "team", "employee", "vendor", "partner",
    "participant", "attendee", "subscriber", "audience",
  ],
  financial: [
    "invoice", "payment", "billing", "charge", "expense", "subscription",
    "price", "quote", "estimate", "credit", "refund", "payout", "revenue",
    "tax", "discount", "coupon", "plan", "balance", "transaction", "ledger",
  ],
  content: [
    "document", "file", "email", "campaign", "template", "page", "post",
    "message", "note", "asset", "media", "attachment", "folder", "form",
    "survey", "article", "snippet", "draft", "notification",
  ],
  config: [
    "setting", "config", "webhook", "integration", "api_key", "permission",
    "role", "automation", "rule", "trigger", "schema", "migration",
    "plugin", "extension", "secret", "credential", "oauth",
  ],
  reporting: [
    "report", "analytics", "dashboard", "export", "metric", "stat",
    "summary", "insight", "log", "audit", "history", "usage",
    "consumption", "forecast",
  ],
};

export function classifyPrefix(prefix: string): ResourceCategory {
  const normalized = prefix.replace(/-$/, "").toLowerCase();

  for (const [category, hints] of Object.entries(CATEGORY_HINTS)) {
    if (hints.some((hint) => normalized.includes(hint))) {
      return category as ResourceCategory;
    }
  }

  return "uncategorized";
}
