// Starts the OddAlerts cache warmer and runs one pass.
// Vercel cron hits GET /warm each minute so the next device finds a stored body.
// The long-lived Expo server also starts the same loop from oddalerts+api.ts.

import { startOddAlertsWarmer, warmOnce } from '../services/oddAlertsWarmer';

export async function GET(): Promise<Response> {
  startOddAlertsWarmer();
  const rows = await warmOnce();
  return Response.json({ warmed: rows });
}
