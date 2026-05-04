# JobAgent — Stateless Orchestrator Architecture

## Technical Specification for a Solo Builder

Version: 1.0
Architecture: Stateless Orchestrator + Plugin Agent Registry + HITL Morning Digest + Persistent Watchers
Stack: TypeScript / Node.js / PostgreSQL / Redis / BullMQ / Playwright

---

## 0. Framing: HITL, Not Stealth

The original brief asked for a fully autonomous agent that submits applications overnight and presents itself as the user. That design is not built here, for two reasons:

1. **Platform ToS.** LinkedIn, Indeed, Workday, and most ATS-hosted portals explicitly forbid automated submissions. Detection means account bans, IP blacklisting, and being silently filtered at companies the user actually wants to work at. The downside is uncapped.
2. **Personal reputation.** ATS vendors (Greenhouse, Lever, Ashby, Workday) are increasingly bot-aware. A flagged application becomes a permanent strike against the candidate's name at that company. One bad submission can close a door for years.

The architecture below replaces "stealth submit" with **morning HITL**: the agent does discovery, matching, drafting, and pre-fills submissions overnight; the user spends 5–10 minutes from their phone the next morning approving each one. Applications go out under the user's name, with the user's review, on the user's authority. The leverage is preserved (volume goes up 5–10x) without the deception or ban risk.

This is the same HITL pattern Mining AI uses, applied to a different domain.

---

## 1. Architecture Overview

JobAgent runs as a **stateless cron-triggered pipeline** with two persistent watcher loops on the side. State lives in PostgreSQL. Discovery runs nightly. Approval happens in a morning batch. Inbox and calendar watchers run continuously.

### Core Design Principles

- **One profile, many runs.** The user has one long-lived `Profile` (resume variants, target roles, comp band, location prefs, exclusion list). Every nightly run reads from this profile.
- **Daily idempotent batches.** A run is identified by `run_date`. Running the same date twice produces the same set of candidates and drafts. Safe to retry.
- **Approval before every submission.** No application leaves the system without an explicit `approved_at` timestamp from the user.
- **Watchers are independent.** Inbox monitoring and calendar sync run as their own loops, not part of the nightly pipeline. They can fail without breaking discovery.
- **Plugin agents.** Sources (Greenhouse, Lever, Ashby, Adzuna, etc.), submission handlers (API vs. Playwright), and notification channels are all plugins. Adding a new source is a config change.

---

## 2. System Components

```
┌──────────────────────────────────────────────────────────┐
│                User (Morning Digest on Phone)             │
│  Approve · Reject · Edit · Skip · Comment                 │
└──────────────────────┬───────────────────────────────────┘
                       │ REST / Push
                       ▼
┌──────────────────────────────────────────────────────────┐
│                      API Gateway                         │
│        Auth · Approval Endpoints · Profile CRUD          │
└──────────┬──────────────────────────────────┬────────────┘
           │                                  │
           ▼                                  ▼
┌─────────────────────┐       ┌────────────────────────────┐
│   HITL Gateway      │◄─────►│   Notification Service     │
│   Pending Queue     │       │   Push · Email · SMS       │
│   Approve · Reject  │       └────────────────────────────┘
└──────────┬──────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│         Stateless Orchestrator (cron-triggered)          │
│  Nightly Run: discovery → match → draft → queue          │
│  Morning Run: deliver digest                             │
│  Approval Run: submit approved drafts                    │
│                                                          │
│  Reads pipeline.yaml. Knows nothing about agent guts.    │
└──────────┬──────────────────────────────────┬────────────┘
           │                                  │
           ▼                                  ▼
┌─────────────────────┐       ┌────────────────────────────┐
│   Agent Registry    │       │      Pipeline Config       │
│   Plugin map        │       │      pipeline.yaml         │
└──────────┬──────────┘       └────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│                    Sub-Agent Pool                         │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │Discovery │ │ Matching │ │ Drafting │ │Submission│   │
│  │  Agent   │ │  Agent   │ │  Agent   │ │  Agent   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ Dedup    │ │Authentic │ │ Profile  │ │ Digest   │   │
│  │  Agent   │ │ Verifier │ │  Tuner   │ │  Builder │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │
└──────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│              Persistent Watcher Loops                     │
│                                                          │
│  ┌──────────────────┐         ┌──────────────────┐      │
│  │ Inbox Watcher    │         │ Calendar Sync    │      │
│  │ Gmail Push API   │◄───────►│ Google Calendar  │      │
│  │ Classify · Parse │         │ Create Events    │      │
│  └──────────────────┘         └──────────────────┘      │
└──────────────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│                 Shared Persistence Layer                  │
│                                                          │
│  PostgreSQL · Redis (BullMQ + locks) · S3 (resumes/PDFs)│
└──────────────────────────────────────────────────────────┘
```

---

## 3. The Three Run Modes

Unlike Mining (one continuous pipeline per project), JobAgent has three distinct invocation patterns. All share the same orchestrator code; the difference is which part of `pipeline.yaml` they execute.

### 3.1 Nightly Discovery Run (e.g., 2:00 AM local)

Triggered by cron. Walks the discovery → drafting half of the pipeline for every active source.

```
1. Acquire lock for run_date
2. Load Profile from DB
3. For each active source plugin:
     - DiscoveryAgent fetches new postings (last 24h + new since last run)
4. DedupAgent merges duplicates across sources by canonical job key
5. AuthenticityVerifier flags suspicious listings
6. MatchingAgent scores each candidate against Profile → keep top N
7. DraftingAgent produces cover letter + resume variant + answers to common
   screening questions for each kept candidate
8. Write everything to `application_drafts` with status = 'pending_review'
9. Release lock
```

If the orchestrator crashes mid-run, the watchdog restarts it; idempotency means already-drafted jobs are skipped on retry.

### 3.2 Morning Digest Delivery (e.g., 7:00 AM local)

```
1. Query application_drafts WHERE status = 'pending_review'
2. DigestBuilder formats them: company, role, score, tldr, draft preview
3. Notification Service sends push + email with one-tap action links
4. State transitions to 'awaiting_approval'
```

### 3.3 Approval-Triggered Submission (event-driven)

When the user taps Approve on a draft:

```
1. API receives POST /drafts/:id/approve
2. HITL Gateway sets status = 'approved'
3. Orchestrator picks up approved drafts on next poll (every 30s)
4. SubmissionAgent resolves the right submission strategy:
     - Has a known ATS API (Greenhouse, Lever, Ashby) → API submit
     - Workday or custom portal → Playwright submit (with user's
       browser session imported, slow human-paced timing)
     - CAPTCHA, MFA, or unsupported flow → mark as 'manual_required'
       and surface to user with deep link
5. On success: status = 'submitted', store submission_receipt
6. On failure: status = 'submission_failed', error details to user
```

---

## 4. Stateless Orchestrator Loop

Same pattern as Mining. Pseudocode — adapted for the job domain:

```typescript
async function processRun(runId: string): Promise<void> {
  const lock = await redis.acquireLock(`run:${runId}`, 300_000);
  if (!lock) return;

  try {
    const run = await db.runs.findById(runId);
    if (run.state === 'completed' || run.state === 'awaiting_approval') return;

    const pipeline = loadPipelineConfig();
    const phase = pipeline.phases[run.currentPhase];
    const nextStep = phase.steps[run.currentStepIndex];

    if (!nextStep) {
      await advancePhase(run);
      return;
    }

    // Skip if already done (idempotency)
    const existing = await db.stepOutputs.findOne({
      runId, stepName: nextStep.name,
    });
    if (existing) {
      await db.runs.update(runId, {
        currentStepIndex: run.currentStepIndex + 1,
      });
      return;
    }

    const agent = agentRegistry.get(nextStep.agent);
    const input = await buildAgentInput(run, nextStep);

    await db.runs.update(runId, { state: 'agent_running' });

    const output = await agent.execute(input);

    await db.stepOutputs.create({
      runId,
      stepName: nextStep.name,
      output: output.data,
      metadata: output.metadata,
    });

    await db.runs.update(runId, {
      state: nextStep.hitl ? 'awaiting_approval' : 'ready',
      currentStepIndex: run.currentStepIndex + 1,
    });

    if (nextStep.hitl) {
      await notify.sendDigest(run.userId, output);
    }
  } finally {
    await redis.releaseLock(lock);
  }
}
```

Crash recovery, multi-instance deployment, distributed locks — identical to Mining's orchestrator. Reuse the code if you can.

---

## 5. Pipeline Configuration

```yaml
# pipeline.yaml — JobAgent

phases:

  # ── Phase A: Nightly Discovery (cron-triggered) ──
  nightly:
    trigger: cron
    schedule: "0 2 * * *"   # 2 AM daily
    steps:
      - name: discovery
        agent: DiscoveryAgent
        hitl: false
        config:
          sources: [greenhouse, lever, ashby, adzuna, workable, ycombinator_jobs]
          lookback_hours: 24
          max_per_source: 100

      - name: dedup
        agent: DedupAgent
        hitl: false
        config:
          canonical_key: [company_normalized, role_normalized, location]
          fuzzy_threshold: 0.92

      - name: authenticity_check
        agent: AuthenticityVerifier
        hitl: false
        config:
          flag_signals:
            - missing_company_domain
            - generic_email_only
            - upfront_payment_request
            - copy_paste_listing
            - new_company_no_history

      - name: matching
        agent: MatchingAgent
        hitl: false
        config:
          keep_top_n: 15
          min_score: 0.70
          weights:
            role_match: 0.30
            stack_match: 0.25
            seniority: 0.15
            location: 0.15
            comp: 0.10
            company_quality: 0.05

      - name: drafting
        agent: DraftingAgent
        hitl: false
        config:
          generate_cover_letter: true
          select_resume_variant: true
          answer_common_screening_questions: true
          max_drafts_per_run: 10

      - name: digest_build
        agent: DigestBuilder
        hitl: false

  # ── Phase B: Morning Delivery (cron-triggered) ──
  morning:
    trigger: cron
    schedule: "0 7 * * *"   # 7 AM daily
    steps:
      - name: deliver
        agent: DeliveryAgent
        hitl: true            # ← The HITL gate. Waits for user approval.

  # ── Phase C: Submission (event-triggered, per draft) ──
  submission:
    trigger: event
    event: draft_approved
    steps:
      - name: prepare
        agent: SubmissionPrepAgent
        hitl: false

      - name: submit
        agent: SubmissionAgent
        hitl: false
        config:
          strategies:
            greenhouse: api
            lever: api
            ashby: api
            workday: playwright
            custom: playwright
            unknown: manual_handoff
          playwright_timing: human_paced   # 800-2200ms per action
          max_retries: 2

      - name: confirm
        agent: ConfirmationAgent
        hitl: false

# ── Persistent Watchers (long-lived, not pipeline steps) ──
watchers:
  inbox:
    agent: InboxWatcherAgent
    interval_seconds: 60
    sources: [gmail_push_api]

  calendar:
    agent: CalendarSyncAgent
    triggered_by: inbox.interview_detected

global:
  max_retries: 3
  retry_backoff_ms: [5000, 15000, 45000]
  lock_ttl_ms: 300000
  approval_timeout_hours: 48
```

---

## 6. Sub-Agent Specifications

### 6.1 DiscoveryAgent

**Pulls listings from external sources.** One plugin per source. Each source plugin is a small class that knows how to call its API or scrape its site.

- **Greenhouse, Lever, Ashby, Workable** — public job board APIs (free, well-documented). These cover thousands of YC + tech companies.
- **Adzuna** — aggregator API with broad coverage (free tier with API key).
- **YC Work at a Startup** — Algolia-backed search.
- **LinkedIn** — do not include in v1. Their ToS is the most restrictive and detection is the most aggressive. Add only if you get formal partner API access.
- **Indeed** — same caution as LinkedIn.

Output: array of normalized `JobPosting` records:
```typescript
interface JobPosting {
  source: string;
  source_id: string;
  company: string;
  company_domain: string | null;
  role_title: string;
  location: string;
  remote: 'fully' | 'hybrid' | 'onsite' | 'unknown';
  posted_at: Date;
  apply_url: string;
  apply_method: 'greenhouse_api' | 'lever_api' | 'ashby_api' | 'workday_form' | 'external';
  description_md: string;
  comp_range: { min: number; max: number; currency: string } | null;
  raw: any;
}
```

### 6.2 DedupAgent

Merges duplicate postings across sources. A job posted to LinkedIn, Greenhouse, and the company site is one job, not three. Canonical key: `(normalized_company, normalized_role, location)`. Fuzzy match titles with embedding similarity above 0.92.

### 6.3 AuthenticityVerifier

**Critical agent — protects the user from scams.** Job scams are rampant. Flag and exclude listings that match:

- No corporate domain (only Gmail/Yahoo contact)
- "Pay for training," "send equipment fee," any upfront payment
- Description copy-pasted across multiple unrelated companies
- Company has no LinkedIn presence, no website older than 30 days
- Suspicious salary outliers (e.g., $200k for entry-level data entry)
- Recruiter asks for SSN, bank info, or photo ID before interview

For positive verification: company domain resolves, has Crunchbase or LinkedIn page, posting also exists on company's own careers page.

### 6.4 MatchingAgent

Scores each candidate posting against the user's `Profile`. The Profile is the single source of truth for user preferences:

```typescript
interface Profile {
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  location: { city: string; country: string; timezone: string };
  work_authorization: string[];   // e.g., ['US_citizen', 'EU_eligible']

  target_roles: string[];          // e.g., ['Senior Backend Engineer', 'Tech Lead']
  excluded_roles: string[];        // e.g., ['Manager', 'PM']
  stack: string[];                 // e.g., ['TypeScript', 'Postgres', 'Kubernetes']
  seniority: 'junior' | 'mid' | 'senior' | 'staff' | 'principal';

  comp_band: { min: number; preferred: number; currency: string };
  location_prefs: {
    remote: 'required' | 'preferred' | 'open';
    cities: string[];
    timezone_overlap_hours: number;
  };

  excluded_companies: string[];    // e.g., past employers, ethical exclusions
  excluded_industries: string[];   // e.g., ['gambling', 'adtech', 'defense']

  resume_variants: ResumeVariant[];   // pool of pre-tailored resumes
  cover_letter_voice_sample: string;  // 200 words of user's actual writing

  links: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
}
```

Scoring uses the weights from `pipeline.yaml`. Output a 0–1 score plus a per-criterion breakdown so the user can see *why* something matched.

### 6.5 DraftingAgent

Generates submission materials per matched job:

1. **Resume variant selection** — picks from the user's pool. The user maintains 3–5 variants (e.g., "backend-heavy", "infra-heavy", "founder-leaning"). Agent picks the closest match. It does **not** rewrite the resume from scratch.
2. **Cover letter** — generates in the user's voice using `cover_letter_voice_sample` as the style anchor. Pulls 2–3 specifics from the job description so it doesn't read generic. ~250 words.
3. **Screening question pre-fills** — answers to common ATS questions (work authorization, salary expectations, notice period, willingness to relocate) based on Profile. The user reviews these in the digest.

Outputs are *drafts*, not submissions. Stored with `status = 'pending_review'`.

### 6.6 DigestBuilder + DeliveryAgent

`DigestBuilder` formats the night's drafts into a single digest record. `DeliveryAgent` pushes it via the user's preferred channel (push notification, email, both). Each draft gets one-tap action links:

- **Approve & submit** — moves to submission phase
- **Edit then approve** — opens the draft for inline editing
- **Reject** — discards (with optional reason: "wrong seniority," "comp too low")
- **Skip** — leaves in queue for tomorrow

This is the only HITL gate in the system. Everything else flows automatically.

### 6.7 SubmissionAgent

Submits an approved draft. Strategy is determined by `apply_method` from the original posting:

- **Greenhouse / Lever / Ashby APIs** — direct POST with the draft, resume PDF, and answers. These are first-party, ToS-compliant, and reliable.
- **Workday** — Playwright, with the user's authenticated session imported via cookie file. Human-paced timing (random 800–2200ms between actions). Logs every step.
- **Custom portals** — Playwright, same approach.
- **CAPTCHA detected, MFA challenge, or unknown flow** — mark `manual_required`, surface to user with deep link to apply themselves. Do not attempt to bypass.

**Important:** even with Playwright, this is the user's own session, the user has approved the specific submission, and the resume PDF is the user's own document. This is closer to "browser automation" than "bot scraping" — it's the same as the user clicking submit themselves, just faster. Still: respect explicit ToS. If a site disallows automation (some Workday tenants do), route to manual.

### 6.8 InboxWatcherAgent

Persistent loop. Watches a dedicated Gmail address (`jobs@yourdomain` recommended — keeps personal inbox clean). Uses the Gmail Push API (Pub/Sub) for low-latency notification.

For each incoming email, runs an LLM classifier:
- `interview_invite` → extract date/time/interviewer/format → trigger CalendarSyncAgent
- `rejection` → update application status, log reason if given
- `recruiter_outreach` → flag for user review
- `screening_response_required` → notify user, do not auto-respond
- `noise` → archive

**Hard rule: never auto-reply to recruiters.** Auto-replies kill candidacies. Surface the email and let the user respond.

### 6.9 CalendarSyncAgent

Triggered when InboxWatcher detects an interview invite. Creates a Google Calendar event with:
- Title: `Interview: {Company} — {Role}`
- Time: parsed from email
- Attendees: interviewer if extractable
- Description: full email body + link to the original application + link to draft prep notes
- Reminder: 24h, 1h, 15min

Optionally generates prep notes (company background, role recap, likely questions) and attaches them to the event.

---

## 7. Database Schema (Highlights)

```sql
CREATE TABLE profiles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE,
  data            JSONB NOT NULL,        -- full Profile object
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resume_variants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  name            VARCHAR(100) NOT NULL,
  file_path       VARCHAR(500) NOT NULL,
  embedding       VECTOR(1536),           -- for matching to job descriptions
  metadata        JSONB
);

CREATE TABLE runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  run_date        DATE NOT NULL,
  phase           VARCHAR(20) NOT NULL,   -- nightly | morning | submission
  state           VARCHAR(30) NOT NULL,
  current_step    VARCHAR(100),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  UNIQUE(user_id, run_date, phase)
);

CREATE TABLE job_postings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          VARCHAR(50) NOT NULL,
  source_id       VARCHAR(200) NOT NULL,
  canonical_key   VARCHAR(500) NOT NULL,
  company         VARCHAR(200) NOT NULL,
  role_title      VARCHAR(300) NOT NULL,
  data            JSONB NOT NULL,
  authenticity    VARCHAR(20),            -- verified | suspicious | scam
  authenticity_signals JSONB,
  discovered_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(source, source_id)
);

CREATE INDEX idx_postings_canonical ON job_postings(canonical_key);

CREATE TABLE application_drafts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  posting_id      UUID NOT NULL REFERENCES job_postings(id),
  match_score     FLOAT NOT NULL,
  match_breakdown JSONB,
  resume_variant_id UUID REFERENCES resume_variants(id),
  cover_letter    TEXT,
  screening_answers JSONB,
  status          VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    -- pending_review | approved | rejected | submitted
    -- submission_failed | manual_required | expired
  user_feedback   TEXT,
  approved_at     TIMESTAMPTZ,
  submitted_at    TIMESTAMPTZ,
  submission_receipt JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_drafts_pending ON application_drafts(user_id, status)
  WHERE status = 'pending_review';

CREATE TABLE inbox_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  email_id        VARCHAR(200) NOT NULL,
  classified_as   VARCHAR(50),
  related_draft_id UUID REFERENCES application_drafts(id),
  parsed_data     JSONB,
  raw_subject     TEXT,
  raw_from        VARCHAR(300),
  received_at     TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE calendar_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL,
  inbox_event_id  UUID REFERENCES inbox_events(id),
  google_event_id VARCHAR(200),
  scheduled_at    TIMESTAMPTZ NOT NULL,
  title           TEXT NOT NULL,
  prep_notes      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 8. Build Order

Same philosophy as Mining: sequential phases, each unlocking the next. Solo builder estimate.

| Phase | What to Build | Duration |
|---|---|---|
| 1 | DB schema + Profile CRUD + Redis locks + BullMQ setup | 1 week |
| 2 | Agent interface + registry + pipeline.yaml loader (port from Mining) | 3 days |
| 3 | DiscoveryAgent with one source (Greenhouse) + DedupAgent | 1 week |
| 4 | MatchingAgent + AuthenticityVerifier | 1 week |
| 5 | DraftingAgent (cover letter + variant selection) | 1.5 weeks |
| 6 | DigestBuilder + DeliveryAgent + morning push notification | 4 days |
| 7 | Approval API + edit-in-place UI + HITL Gateway | 1 week |
| 8 | SubmissionAgent — Greenhouse/Lever/Ashby APIs only | 1.5 weeks |
| 9 | InboxWatcher + Gmail Push API + email classifier | 1 week |
| 10 | CalendarSyncAgent + Google Calendar integration | 4 days |
| 11 | Add more discovery sources (Lever, Ashby, Workable, Adzuna) | 1 week |
| 12 | Playwright submission for Workday + custom portals | 2 weeks |
| 13 | Stuck-run watchdog + retry logic + observability | 1 week |

**Total: ~12 weeks solo. Working v1 (phases 1–10) at ~8 weeks.**

The first deployable cut is phases 1–7: discovery + matching + drafting + morning digest, with **no auto-submission at all**. The user just gets a great daily list with one-tap copy-paste-into-browser links. Use that for two weeks before adding submission. Two reasons:

1. You'll find out fast whether the matching quality is good. Bad matches mean you ship submission and just spam companies faster — worst possible outcome.
2. Submission is the highest-risk component (ToS, reputation, account bans). Every other phase is reversible. Submission is not.

---

## 9. The Things This Spec Does Not Do

- **No LinkedIn or Indeed scraping.** Add only with formal API access.
- **No fake user-agent spoofing or undetected-chromedriver tricks.** If a site blocks automation, route the application to the user.
- **No auto-replies to recruiters.** Ever.
- **No applying without explicit per-draft approval.** Bulk-approve is fine; default-approve is not.
- **No CAPTCHA solving.** When CAPTCHA appears, hand off to the user with a deep link.
- **No representing the user as something they're not.** The cover letter uses the user's real voice, real experience, real claims. The agent is a force multiplier on writing speed, not a fabricator.

---

## 10. What "Excellence" Looks Like in HITL Mode

The brief asked for the agent to "apply with excellence as if I applied it." That goal is achievable — without the deception. Excellence in this system means:

- The morning digest contains 5–10 well-matched jobs the user wouldn't have found alone.
- Each draft is *better* than what the user would write at 11 PM tired — because the agent has time to research the company, parse the JD carefully, and match it against the resume in detail.
- Approval takes ~30 seconds per draft on a phone.
- Rejections feed back into MatchingAgent's weights so tomorrow's matches are better.
- Interviews land on the calendar automatically with prep notes already attached.
- The user's name never gets flagged at a company they care about.

That's the actual win. Volume goes up 5–10x, quality goes up, and nothing burns.

---

*JobAgent — Stateless orchestrator, plugin agents, HITL by default, no shortcuts that backfire.*
