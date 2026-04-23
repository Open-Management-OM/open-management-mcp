import type { AuditEntry } from "@/types";
import { redact } from "@/http/redactor";

type LogSink = (line: string) => void;
export type AuditLogInput = Omit<AuditEntry, "audit" | "timestamp">;

export interface AuditLogger {
  log(entry: AuditLogInput): void;
}

export function createAuditLogger(sink?: LogSink): AuditLogger {
  const writeLine = sink || ((line: string) => process.stdout.write(line + "\n"));
  return {
    log(input: AuditLogInput) {
      const entry: AuditEntry = {
        audit: true,
        timestamp: new Date().toISOString(),
        ...input,
      };
      const safe = redact(entry);
      writeLine(JSON.stringify(safe));
    },
  };
}
