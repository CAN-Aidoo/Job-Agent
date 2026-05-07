import { AgentInput, AgentOutput, JobAgent } from '@jobagent/shared/src/interfaces/agent';
import { dbInbox } from '@jobagent/shared/src/index';
import { getGmailClient } from '../../../api/src/gmail/client';

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
      const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id });
      
      // 3. Create inbox event record
      await dbInbox.create({
        user_id: userId,
        email_id: msg.id,
        received_at: new Date(),
        raw_subject: fullMsg.data.snippet || '',
        classified_as: 'noise' // Using 'noise' as a valid InboxClassification instead of 'processing'
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
