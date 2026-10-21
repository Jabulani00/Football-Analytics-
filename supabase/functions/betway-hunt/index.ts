import { captureBetwaySnapshotWithRetries } from '../_shared/betwaySnapshot.ts';
import { createRpcClient, privateWorkerRequest, serviceEnvironment } from '../_shared/supabaseService.ts';

type ApplyResult = { status: string; run_id: string; fixture_count: number; [key: string]: unknown };

Deno.serve(async (request: Request) => {
  const rejected = privateWorkerRequest(request);
  if (rejected) return rejected;
  const environment = serviceEnvironment();
  if (!environment) return Response.json({ error: 'Supabase service environment is missing' }, { status: 500 });
  const rpc = createRpcClient(environment.url, environment.key);
  try {
    const snapshot = await captureBetwaySnapshotWithRetries({ runBudgetMs: 120_000, maxAttempts: 3 });
    const applied = await rpc<ApplyResult>('apply_betway_snapshot', { p_snapshot: snapshot });
    if (!applied || applied.status !== 'complete') {
      throw new Error('Betway persistence RPC returned an unexpected result');
    }
    return Response.json({ ok: true, ...applied }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await rpc<string>('record_betway_crawl_failure', { p_error: message.slice(0, 2_000) });
    } catch (loggingError) {
      console.error('Could not record Betway crawl failure', loggingError);
    }
    return Response.json({ ok: false, error: message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
});
