import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { dbInbox, getGmailClient } from '@jobagent/shared/src/index';
import { classifyEmail } from './email-classifier';

export default class InboxWatcherAgent implements JobAgent {
  name = 'InboxWatcherAgent';

  async execute(input: AgentInput): Promise<AgentOutput> {
    const userId = input.userId;
    const gmail = await getGmailClient(userId);

    // 1. Fetch unread messages from the last 6 minutes
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread newer_than:6m',
    });

    const messages = response.data.messages || [];
    const processedIds: string[] = [];

    for (const msg of messages) {
      if (!msg.id) continue;
      
      // 2. Fetch full message
      const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id, format: 'full' });
      const subject = fullMsg.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
      const body = fullMsg.data.snippet || '';
      
      // 3. Classify
      const classification = await classifyEmail(subject, body);
      
      // 4. Create inbox event record
      await dbInbox.create({
        user_id: userId,
        email_id: msg.id,
        received_at: new Date(),
        raw_subject: subject,
        classified_as: classification
      });
      processedIds.push(msg.id);
    }

    return {
      data: { processed_count: processedIds.length },
      metadata: { execution_time_ms: 0 },
    };
  }

  estimateTime(_input: AgentInput): number {
    return 10000;
  }
}
