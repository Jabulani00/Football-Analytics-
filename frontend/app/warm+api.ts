// Starts the OddAlerts cache warmer and runs one pass.
// Vercel Hobby cron hits GET /warm once a day. The in-process loop keeps the
// cache fresh while the server is running.
// The long-lived Expo server also starts the same loop from oddalerts+api.ts.

import { startOddAlertsWarmer, warmOnce } from '../services/oddAlertsWarmer';

export async function GET(): Promise<Response> {
  startOddAlertsWarmer();
  const rows = await warmOnce();
  return Response.json({ warmed: rows });
}
