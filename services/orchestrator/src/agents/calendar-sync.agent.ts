import Anthropic from '@anthropic-ai/sdk';
import { JobAgent, AgentInput, AgentOutput } from '@jobagent/shared/src/interfaces/agent';
import { getPool } from '@jobagent/shared/src/db/client';
import { createInterviewEvent } from '../calendar/events';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

export default class CalendarSyncAgent implements JobAgent {
  name = 'CalendarSyncAgent';
  private anthropic: Anthropic | null = null;

  private getAnthropic(): Anthropic {
    if (!this.anthropic) this.anthropic = new Anthropic();
    return this.anthropic;
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const startTime = Date.now();
    const pool = getPool();

    // Find inbox events classified as interview_invite that don't have calendar events
    const { rows: interviews } = await pool.query<{
      id: string; parsed_data: Record<string, unknown>; raw_subject: string;
    }>(`SELECT ie.id, ie.parsed_data, ie.raw_subject
        FROM inbox_events ie
        LEFT JOIN calendar_events ce ON ce.inbox_event_id = ie.id
        WHERE ie.user_id = $1 AND ie.classified_as = 'interview_invite' AND ce.id IS NULL`,
      [input.userId]
    );

    let eventsCreated = 0;

    for (const interview of interviews) {
      const data = interview.parsed_data || {};
      const company = (data.company_name as string) || 'Unknown Company';
      const role = (data.role_name as string) || 'Interview';
      const dateStr = (data.date_str as string) || '';
      const timeStr = (data.time_str as string) || '09:00';

      // Parse date/time
      let scheduledAt: Date;
      try {
        scheduledAt = new Date(`${dateStr} ${timeStr}`);
        if (isNaN(scheduledAt.getTime())) {
          scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default: 1 week from now
        }
      } catch {
        scheduledAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      }

      // Generate prep notes
      const prepNotes = await this.generatePrepNotes(company, role, input.userId);

      const description = `${interview.raw_subject || ''}\n\n---\nPrep Notes:\n${prepNotes}`;

      const eventId = await createInterviewEvent(
        input.userId,
        interview.id
        // Removed unnecessary arguments that caused the type error
      );

      if (eventId) {
        // Update calendar event with prep notes
        await pool.query(
          'UPDATE calendar_events SET prep_notes = $1 WHERE google_event_id = $2',
          [prepNotes, eventId]
        );
        eventsCreated++;
      }
    }

    return {
      data: { events_created: eventsCreated, interviews_found: interviews.length },
      metadata: { execution_time_ms: Date.now() - startTime },
    };
  }

  private async generatePrepNotes(company: string, role: string, userId: string): Promise<string> {
    const pool = getPool();
    const client = this.getAnthropic();

    // Get posting info if available
    const { rows: [draftRow] } = await pool.query<{ data: Record<string, unknown> }>(`
      SELECT jp.data FROM application_drafts ad
      JOIN job_postings jp ON jp.id = ad.posting_id
      WHERE ad.user_id = $1 AND jp.company ILIKE $2
      LIMIT 1
    `, [userId, `%${company}%`]);

    const jobDescription = draftRow ? ((draftRow.data as Record<string, unknown>).description_md as string || '') : '';

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Generate interview prep notes for:
Company: ${company}
Role: ${role}
Job Description (if available): ${jobDescription.slice(0, 1000)}

Include:
1. 3-bullet company overview
2. 5 likely interview questions for this role
3. 3 talking points from the job description

Be concise.`,
      }],
    });

    return response.content
      .filter(block => block.type === 'text')
      .map(block => block.type === 'text' ? block.text : '')
      .join('');
  }

  estimateTime(_input: AgentInput): number {
    return 20_000;
  }
}
