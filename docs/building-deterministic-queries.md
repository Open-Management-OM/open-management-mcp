# Building Deterministic Queries

Once your MCP is live and you've moved your first data into Neon, don't just start asking Claude freeform questions-- you'll get different answers on different days because Claude will guess at your business definitions. Instead, **lock in one business term at a time** as a verified SQL definition in `src/warehouse-guide.ts`. Then every future query uses that same definition.

This doc gives you copy-paste prompts to use **inside Claude.ai** (not Claude Code) to build deterministic queries interactively. Claude runs the SQL via your MCP, shows you the output, you verify, then Claude drafts the warehouse-guide entry you commit.

## Why this matters

The first time a stakeholder asks "how many new leads did we get last month?", three things can go wrong:

1. **Claude picks a wrong definition** -- maybe it counts anyone with `lifecycle_stage='lead'`, including stale leads from 3 years ago.
2. **Claude picks a reasonable-but-different-from-yours definition** -- the number looks plausible and you ship it, but it doesn't match what your stakeholder meant.
3. **Claude picks the right definition today, a different one tomorrow** -- nothing's locked in, so the same question gives different answers across sessions.

The fix: define your business terms once, precisely, with SQL, and put them in `src/warehouse-guide.ts` with a "NEVER re-derive" rule. Claude reads this file at the start of every session via the `get_warehouse_guide` tool and uses your definition.

## The workflow (what Claude does when you use these prompts)

1. Check `get_warehouse_guide` to see if the term is already defined. If yes, show the existing definition and ask if you want to change it.
2. Take your plain-English definition and translate it to SQL.
3. Run the SQL against your Neon DB via `run_sql`.
4. Show you sample rows + a count. Explicitly ask: "Do these numbers look right?"
5. **Only after you confirm**, draft the warehouse-guide entry (term + definition + exact SQL + "NEVER re-derive" anti-patterns + your name and today's date).
6. You paste the entry into `src/warehouse-guide.ts`, commit, redeploy.

If the output doesn't match what you expected, iterate on the definition-- don't ship it.

---

## Prompt template (use for any term)

Copy this, fill in the bracketed parts, paste into Claude.ai:

```
I want to lock in how "[TERM]" is defined in our warehouse so every
future query uses the same logic. Here's MY definition, in plain English:

- [criterion 1]
- [criterion 2]
- [criterion 3]
- (exclude: [what it's NOT])

Please:
1. Call get_warehouse_guide and check if "[TERM]" is already defined. If
   yes, show me the current definition and flag any differences from mine.
2. If not defined (or differs): write the SQL that implements my
   definition. Use my warehouse's real table and column names (call
   describe_schema if needed).
3. Run it and show me: (a) a count, (b) 5-10 sample rows, (c) the
   oldest and newest record so I can sanity-check the date range.
4. Wait for me to confirm the numbers look right. Do NOT write anything
   to the warehouse guide until I say "ship it."
5. Once I confirm: draft the block I should paste into
   src/warehouse-guide.ts. Include: the term, the plain-English
   definition, the exact SQL, 2-3 "NEVER re-derive" anti-patterns, and
   "Verified by: [my name] on [today's date]".
```

---

## Example 1: "New lead"

```
I want to lock in how "new lead" is defined in our warehouse. Here's MY definition:

- Contact was created in the last 30 days
- lifecycle_stage = 'lead' (NOT 'customer', NOT 'opportunity', NOT 'prospect')
- Has NOT been assigned to a sales rep yet (assigned_rep_id IS NULL)
- Source IS NOT 'employee_referral' or 'internal_test'
- Not a duplicate (duplicate_of_id IS NULL)

Please follow the standard deterministic-query workflow: check the
warehouse guide, write SQL, run it, show me sample + count + date
range, wait for my confirmation before drafting the guide entry.
```

## Example 2: "Reactive ticket" (MSP / PSA context)

```
I want to lock in "reactive ticket" for our managed services board.
Definition:

- board_name IN ('Managed Services', 'Help Desk', 'After Hours')
- type IN ('Service Request', 'Incident') AND subtype NOT IN ('Onboarding', 'Planned Change')
- priority_level IN (1, 2) OR subtype = 'Emergency'
- Linked to an agreement where agreement_type = 'Managed' (NOT T&M, project, or consulting)
- NOT marked as internal (is_internal = false)
- Exclude tickets opened by automation accounts (opened_by NOT IN ('automation@co.com', 'alert@co.com'))

Standard workflow-- check the guide, write SQL, show me a count by
ticket_status, sample 10 rows with priority + board + customer_name,
wait for me to confirm before finalizing.
```

## Example 3: "MRR" (Monthly Recurring Revenue)

```
I want to lock in "MRR" for board reporting. Definition:

- Sum the monthly_recurring_amount_cents column from the active_agreements view
- Only agreements where status = 'Active' AS OF the end of the month
  being measured (not current status-- historical snapshot)
- Exclude agreements flagged as trial = true
- Exclude agreements where customer.type = 'Internal' (our own company,
  test accounts)
- Prorate partial months: if an agreement was active for only 10 days of
  a 30-day month, count 10/30 of its amount
- Currency: all agreements are already in cents, but verify this before
  trusting the sum

Standard workflow: check the guide, write SQL that computes MRR for
the LAST complete month (not current month-in-progress). Show me the
total, top-10 agreements by contribution, and a MoM % change vs the
prior month. I want to manually verify against last month's board
deck before confirming.
```

## Example 4: "At-risk account"

```
I want to lock in "at-risk account". Definition:

- Active customer (has at least one agreement with status = 'Active')
- In the last 90 days, ANY of:
  - Opened 3+ P1 tickets
  - Had an NPS survey response <= 6 (detractor)
  - Missed 2+ scheduled payments
  - Requested a cancellation discussion (ticket_type = 'Retention' or agreement.status_change_requested IS NOT NULL)
  - Had 2+ escalations in the manager-override log
- NOT already flagged as 'Churned' or 'Offboarding' in customer.lifecycle_stage

Standard workflow. Show me the count, list the 20 accounts currently
at-risk with the specific criterion(ia) they tripped, and sort by MRR
so I can see which ones matter most. I want to manually verify 3-5 of
them with my account manager before shipping the definition.
```

## Example 5: "Overdue ticket"

```
I want to lock in "overdue ticket". Definition:

- status IN ('Open', 'In Progress', 'Waiting on Client', 'On Hold')
- age = NOW() - created_at; overdue is defined PER priority:
  - P1: age > 4 hours
  - P2: age > 1 business day
  - P3: age > 3 business days
  - P4: age > 5 business days
- Exclude tickets waiting on client where the last client response was
  more than 48 hours ago (those are STALE but not overdue -- we count
  stale separately)
- Business hours: Monday 8am - Friday 6pm America/Chicago. Weekends
  and holidays don't count toward age.

This one's tricky because of business hours. Standard workflow, but
specifically call out how the business-hours calculation is handled
in SQL-- a Postgres function, a joined calendar table, or inline? I
need to understand before I confirm. Show me the count broken down
by priority AND the 10 oldest currently-overdue tickets.
```

## Example 6: "Profitable customer" (for a quarterly review)

```
I want to lock in "profitable customer" for our QBR. Definition:

- Over the last 12 months:
  - Revenue = sum of invoiced amounts (NOT quoted, NOT accrued)
  - Cost = sum of labor cost (billable hours * tech cost rate) + parts cost + escalation overhead (flat $100 per P1)
  - Profit = Revenue - Cost
  - Profitable IF profit > 0 AND profit / revenue >= 0.15 (15% margin floor)
- Include only customers with at least $10k annual revenue (below that,
  margin % is misleading)
- Exclude customers flagged as 'Strategic' in customer.tags -- those
  are intentionally break-even or loss-leader

Standard workflow. Show me the list of profitable customers with
their profit %, plus a list of 5 UNPROFITABLE customers currently
over $50k revenue (we probably want to review their contracts). I'll
confirm numbers with my CFO before shipping.
```

---

## Generic template -- "define my own term"

If you have a business term that doesn't match any of the examples above, use this:

```
I want to lock in how "[MY TERM]" is defined. Here's MY definition in plain English:

[Write 3-7 bullet criteria. Be SPECIFIC about:
- Date windows (last 30 days? calendar month? fiscal quarter?)
- Inclusions (what counts)
- Exclusions (what does NOT count)
- Tiebreakers (what to do when a record matches multiple criteria)
- Edge cases (NULL handling, timezone, default values)]

Also, here's what I expect roughly:
- [Approximate count or range: "around 50-100 records" or "between $1M and $2M"]
- [A known-good example: "Jane Smith at Acme Corp should qualify"]
- [A known-bad example: "anyone in the 'test_accounts' customer group should NOT qualify"]

Standard deterministic-query workflow. Check the guide first. If my
definition conflicts with an existing entry, flag it before writing any
SQL. Show me counts and samples. Wait for my confirmation before
drafting the guide entry.
```

---

## Anti-patterns -- definitions to AVOID

These definitions LOOK okay but produce inconsistent numbers over time. If Claude suggests one, push back.

1. **"Recent" without a window**. "Recent leads" = what? 7 days? 30 days? "Recent" drifts every session. Always pin the window.

2. **Current status instead of historical snapshot**. "Active customers last month" computed with `WHERE status = 'Active'` gives you CURRENTLY-active customers, not customers who were active last month. Use `WHERE status_at('2026-03-31') = 'Active'` or a state-history table.

3. **NULL handled inconsistently**. "Assigned rep" vs "unassigned" -- does `assigned_rep_id IS NULL` mean unassigned, or does a sentinel like `'UNASSIGNED'` also exist? Pick one, enforce it.

4. **Mixing calendar and business days**. "Open 3 days" can mean 3 calendar days OR 3 business days. Those are very different for a Friday-opened ticket. Explicit.

5. **Using computed fields downstream of un-refreshed ETL**. If `customer_tenure_months` is computed in an ETL job that runs nightly, don't use it for "as of now" queries-- use `(NOW() - customer.created_at)` directly.

6. **Case-sensitive string comparisons on human-entered fields**. `WHERE board_name = 'Managed Services'` will miss `'managed services'` and `'MANAGED SERVICES'`. Either normalize in the ETL or use `ILIKE` / `LOWER()`.

7. **Hardcoded date ranges that need to change**. `WHERE created_at >= '2026-01-01'` will break in 2027. Use relative windows: `created_at >= DATE_TRUNC('year', NOW())`.

8. **Currency conversion done inline**. If some amounts are in cents and others in dollars, a plain `SUM(amount)` is nonsense. Normalize in the ETL, not in every query.

---

## Integrating the answer back into `src/warehouse-guide.ts`

When Claude drafts the guide entry, it should look roughly like this:

```markdown
## Business Term: "Reactive ticket"

**Definition:** A service-request ticket opened against a Managed Services
board, priority 1 or 2, linked to a Managed agreement, not an internal or
automation-originated ticket.

**Verified by:** Matt Weir, 2026-04-23

**Exact SQL -- NEVER re-derive inline:**
```sql
SELECT t.id, t.summary, t.priority_level, t.board_name, c.name AS customer_name
FROM tickets t
JOIN agreements a ON t.agreement_id = a.id
JOIN customers c ON a.customer_id = c.id
WHERE t.board_name IN ('Managed Services', 'Help Desk', 'After Hours')
  AND t.type IN ('Service Request', 'Incident')
  AND (t.subtype NOT IN ('Onboarding', 'Planned Change') OR t.subtype IS NULL)
  AND (t.priority_level IN (1, 2) OR t.subtype = 'Emergency')
  AND a.agreement_type = 'Managed'
  AND t.is_internal = false
  AND t.opened_by NOT IN ('automation@co.com', 'alert@co.com');
```

**NEVER:**
- NEVER include tickets from project or T&M boards -- they're not managed services
- NEVER count internal tickets (is_internal = true) -- those are us working on our own tooling
- NEVER filter by status -- "reactive" is about ticket TYPE, not whether it's open or closed
```

1. Paste the entry into `src/warehouse-guide.ts` inside the template-literal string, in the "Business Logic & KPI Definitions" section.
2. Commit: `git commit -m "warehouse-guide: lock in 'reactive ticket' definition"`.
3. Redeploy Vercel (or let auto-deploy handle it).
4. In your next Claude.ai session, verify: "what's our current reactive ticket count?" should use the exact SQL you just locked in.

Over time, you'll accumulate 10-30 of these. That's where the real leverage is-- Claude stops guessing, stakeholders stop getting different numbers, and onboarding a new analyst is "read the warehouse guide, that's how we define everything."
