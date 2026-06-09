// Placeholder for now
export async function createInterviewEvent(
  userId: string,
  title: string,
  start: Date,
  _description: string,
): Promise<string | undefined> {
  // const auth = await getAuthClient(userId); // Needs to be refactored
  // const calendar = google.calendar({ version: 'v3', auth });

  console.log(`[Calendar] Creating interview event "${title}" for user ${userId} at ${start.toISOString()}`);

  return 'mock-google-event-id';
}
