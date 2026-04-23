/**
 * Data Warehouse Guide
 *
 * This is injected into the LLM context so it can write correct SQL
 * against the warehouse on the first try, without needing to call
 * get_database_tables or describe_table_schema first.
 *
 * HOW TO BUILD YOUR WAREHOUSE GUIDE:
 *
 * This file is the single most important file in your MCP server. It's
 * the "cheat sheet" that tells the AI everything it needs to know about
 * YOUR data -- table names, column meanings, business logic, and query
 * patterns. Without it, the AI has to guess or make expensive schema
 * discovery calls on every question.
 *
 * You build this guide from "user stories" -- plain-English questions
 * that real people at the company actually need answered. The format is:
 *
 *   "As a [role], I want to know [question] so I can [action]."
 *
 * EXAMPLES:
 *
 *   "As a [role], I want to know [question] so I can [take action]."
 *    -- Apps: [which systems have the data]
 *    -- People: [who needs the answer]
 *
 * For example:
 *
 *   "As a CEO, I want to know our monthly revenue trend by service
 *    line so I can decide where to invest next quarter."
 *    -- Apps: accounting, CRM
 *    -- People: CEO, CFO
 *
 *   "As a service manager, I want to know average ticket resolution
 *    time by technician so I can identify training opportunities."
 *    -- Apps: PSA
 *    -- People: Service Manager, techs
 *
 * Each user story tells you:
 *   1. Which TABLES you need to sync (PSA tickets, agreements, time entries)
 *   2. Which COLUMNS matter (MRR, ticket count, billable hours)
 *   3. What BUSINESS LOGIC needs to be defined ("declining MRR" = what exactly?)
 *   4. What QUERIES to pre-build as examples in this guide
 *
 * Start with 5-10 user stories. Add more as your team asks new questions.
 * The guide grows organically -- you don't need to document everything
 * on day one.
 *
 * =========================================================
 * HOW A USER STORY BECOMES A WAREHOUSE GUIDE ENTRY
 * =========================================================
 *
 * Create a user-stories.md file for each dashboard or focus area.
 * Each story gets an ID, links to a SQL file, and lists key metrics.
 * Here's the format:
 *
 * ---- user-stories.md ----
 *
 * ## Primary Personas
 * - **Jane** (CEO) -- board reporting, financial health
 * - **Tom** (Service Manager) -- team performance, SLA compliance
 *
 * ### US-01-01: Monthly Revenue by Service Line
 *
 * **Story:** As **Jane**, I want to see monthly revenue broken down
 * by service line so that I can identify which lines are growing and
 * which need attention.
 *
 * **Answered by:** `01-revenue-by-service-line.sql`
 *
 * **Key metrics:** Monthly grain. Columns: month, service_line,
 * revenue, mom_change_pct. Joins: invoices + agreement_additions.
 * Expected ~60 rows (12 months x 5 service lines).
 *
 * ### US-01-02: Ticket Resolution Time by Tech
 *
 * **Story:** As **Tom**, I want to see average resolution time per
 * technician this quarter so that I can identify who needs coaching
 * and who deserves recognition.
 *
 * **Answered by:** `02-resolution-by-tech.sql`
 *
 * **Key metrics:** Quarterly grain. Columns: tech_name, avg_hours,
 * ticket_count, sla_met_pct. Source: tickets + time_entries.
 *
 * ## Gaps (Unanswered Questions)
 *
 * | Question | Blocker | Priority |
 * |----------|---------|----------|
 * | Cost per acquisition by channel | No ad spend data synced yet | HIGH |
 * | Customer satisfaction score | No survey integration | MEDIUM |
 *
 * ---- end example ----
 *
 * Then the warehouse guide entry for US-01-01 would look like:
 *
 *   **`analytics.monthly_revenue`** -- revenue by service line
 *   | Column | Type | Description |
 *   |--------|------|-------------|
 *   | month | DATE | First day of month |
 *   | service_line | TEXT | managed, project, consulting, cloud, security |
 *   | revenue_cents | INT | Total invoiced revenue in cents |
 *
 *   Common query:
 *   ```sql
 *   SELECT service_line, DATE_TRUNC('month', invoice_date) AS month,
 *          SUM(amount_cents) AS revenue
 *   FROM analytics.invoices
 *   GROUP BY 1, 2 ORDER BY month DESC;
 *   ```
 *
 * That's the full loop: story >> SQL file >> warehouse guide entry.
 */

export const WAREHOUSE_GUIDE = `
# Data Warehouse Guide

## How This Guide Works

This guide tells the AI how to write correct SQL for YOUR data warehouse.
It covers table structures, business definitions, naming conventions, and
common query patterns. The AI reads this before writing any query.

**If a question can be answered using information in this guide, the AI
should write SQL directly -- no need to call get_database_tables or
describe_table_schema first.**

---

## Architecture

<!-- Describe your warehouse layers here. Common patterns: -->
<!-- - Bronze/Silver/Gold (medallion architecture) -->
<!-- - Raw/Staging/Analytics -->
<!-- - Source/Transformed/Reporting -->
<!-- Delete whichever doesn't apply and fill in your own. -->

| Layer | Schema | Purpose | Refresh Cadence |
|-------|--------|---------|-----------------|
| Raw | \`public.*\` | Raw data from source systems | TODO: how often? |
| Analytics | \`analytics.*\` | Cleaned, joined, enriched -- query this first | TODO: how often? |

### Query Routing Rules
<!-- Tell the AI which layer to prefer for which types of questions -->
1. **For business questions** --> Query the analytics/silver layer first
2. **For raw source data not yet transformed** --> Query raw/bronze tables
3. **Never re-derive** what the analytics layer already computes

---

## Tables

<!-- Document each table that matters. For each table, include: -->
<!-- - Full qualified name (schema.table_name) -->
<!-- - Row count (approximate is fine) -->
<!-- - What it represents in plain English -->
<!-- - Key columns with types and descriptions -->
<!-- - Any gotchas (reserved words, type casting, naming quirks) -->

### Example: Customers Table

<!-- This is a REAL EXAMPLE showing the format. Replace with your tables. -->

**\`analytics.customers\`** -- 50K rows, master customer table
| Column | Type | Description |
|--------|------|-------------|
| customer_id | UUID PK | Primary key |
| email | TEXT UNIQUE | Lowercase, deduplicated |
| full_name | TEXT | First + last name |
| signup_date | TIMESTAMPTZ | When they created their account |
| plan_type | TEXT | free, starter, pro, enterprise |
| mrr_cents | INT | Monthly recurring revenue in cents |
| is_active | BOOLEAN | Currently paying and not churned |
| region | TEXT | NA, EMEA, APAC, LATAM |

### Your Tables

<!-- Copy the format above for each of your tables. -->
<!-- Start with the 3-5 tables your team queries most often. -->

<!-- TABLE 1 -->
<!-- **\`schema.table_name\`** -- ~N rows, description -->
<!-- | Column | Type | Description | -->
<!-- |--------|------|-------------| -->
<!-- | col1   | TYPE | What it means | -->

<!-- TABLE 2 -->
<!-- ... -->

---

## Business Logic & KPI Definitions

THIS SECTION IS THE MOST IMPORTANT PART OF THE ENTIRE GUIDE.

Every business has terms that sound simple but have exact, specific
meanings in data. "Active customer", "qualified lead", "launched group",
"reactive ticket", "profitable account" -- these all have precise
definitions that differ from company to company. If you don't define
them here, the AI WILL guess, and it WILL get them wrong.

## HOW TO BUILD THIS SECTION (instructions for Claude):

You do NOT make up definitions. You work with the person building this
to get the REAL definition. The process is:

1. **Collect user stories** -- "As a [role], I want to know [question]
   so I can [action]." These come from the people who will actually
   use this system.

2. **For each user story, identify the business terms** -- What words
   in the story have a specific meaning? "Active", "overdue",
   "profitable", "at risk" -- these all need definitions.

3. **Get the exact definition from the stakeholder** -- Ask: "When you
   say 'active customer', what EXACTLY qualifies? What are the edge
   cases?" Don't assume. Don't infer. Ask.

4. **Write the SQL and VERIFY the output** -- Write the query, run it,
   and show the results to the person who asked. Ask: "Does this look
   right? Are these the numbers you'd expect?" If not, the definition
   is wrong -- go back to step 3.

5. **Lock it in** -- Once verified, put the definition AND the exact
   SQL in this guide. Mark it as "NEVER re-derive" so future queries
   use this definition, not a guess.

**THE VERIFICATION STEP IS NOT OPTIONAL.** A query that returns data
is not the same as a query that returns CORRECT data. The stakeholder
must confirm the output before it goes into the guide.

---

### Pattern: Pre-Computed Column (Best)

When the ETL or a view already computes the answer, tell the AI to
use that column and NEVER re-derive it with a CASE statement or
inline logic. The pre-computed version handles edge cases that an
inline re-derivation will miss.

**Format:**

**Term:** "[Your business term]"
**Use:** \`schema.table.column\` -- NEVER re-derive.
**Definition:** [Exact plain-English definition]
**Verified by:** [Name of person who confirmed the output] on [date]

### Pattern: Exact SQL (When No Pre-Computed Column Exists)

When there's no pre-computed column, write the EXACT SQL -- the
actual WHERE clause, JOINs, and logic. Don't describe it in English
and hope Claude figures out the SQL. Give the SQL directly.

**Format:**

**Term:** "[Your business term]"
**Definition:** [Exact plain-English definition]
**Verified by:** [Name] on [date]

\`\`\`sql
-- [Term]: use this exact query
SELECT ...
FROM ...
WHERE [exact conditions]
\`\`\`

NEVER [what not to do -- specific to this term].
NEVER [another anti-pattern for this term].

---

### Your Definitions

<!-- For each critical business term in your user stories: -->
<!-- 1. Get the definition from the stakeholder (don't guess) -->
<!-- 2. Write the SQL -->
<!-- 3. Run it and show the output to the stakeholder -->
<!-- 4. Get confirmation: "Yes, those numbers are right" -->
<!-- 5. Paste the definition + SQL here -->
<!-- 6. Add NEVER rules for common ways to get it wrong -->

---

## Source System Notes

<!-- Document quirks of your source systems that affect querying. -->
<!-- Common gotchas: -->

<!-- - Timestamps in epoch milliseconds: to_timestamp(col / 1000) -->
<!-- - All columns stored as TEXT: property_createdate::timestamp -->
<!-- - Table names with uppercase MUST be quoted: "MyTable_bronze" -->
<!-- - Reserved words as column names need quoting: "group", "order" -->
<!-- - Schema-qualified names: analytics.my_table (not just my_table) -->

---

## Common Query Patterns

<!-- Add 3-5 queries your team runs most often. -->
<!-- These teach the AI the RIGHT way to query your data. -->

### Example: Monthly signups by region

\`\`\`sql
SELECT region, DATE_TRUNC('month', signup_date) AS month, COUNT(*) AS signups
FROM analytics.customers
WHERE signup_date >= '2026-01-01'
GROUP BY 1, 2
ORDER BY month DESC, signups DESC;
\`\`\`

### Your Queries

<!-- QUERY 1: "What question does this answer?" -->
<!-- \`\`\`sql -->
<!-- YOUR SQL HERE -->
<!-- \`\`\` -->

---

## Anti-Patterns (What NOT to Do)

These rules prevent the AI from writing queries that look correct but
produce wrong numbers. Every time you or a stakeholder catches a bad
query, add the mistake here so it never happens again.

**General rules (apply to every query):**
- NEVER use SELECT * on large tables -- always specify columns
- NEVER re-derive a metric that has a pre-computed column (see Business Logic section)
- NEVER join raw/bronze tables when the analytics layer already has the join
- NEVER write a CASE statement to classify something that has a classification column
- NEVER assume NULL means zero -- use COALESCE explicitly
- NEVER return data without confirming the definition with a stakeholder first

**Your anti-patterns:**
<!-- Every time a query produces wrong results, document WHY here. -->
<!-- Format: NEVER [what looks right] -- because [why it's wrong]. -->
<!-- These accumulate over time. A good guide has 10-20 of these. -->

---

## Helper Functions

<!-- If your warehouse has SQL functions, document them here. -->
<!-- Example: -->
<!-- - \`analytics.classify_source(source, detail1, detail2)\` --> returns source_category -->
<!-- - \`analytics.normalize_name(raw_name)\` --> cleaned name for matching -->

---

## ETL / Data Freshness

<!-- How often is data refreshed? When was the last successful run? -->
<!-- This helps the AI give accurate "as of" caveats in its answers. -->

<!-- Example: -->
<!-- - Analytics layer refreshes 2x daily at 7:30 and 19:30 UTC -->
<!-- - Raw CRM data syncs every 4 hours -->
<!-- - Web analytics has ~4 months rolling window -->
`;
