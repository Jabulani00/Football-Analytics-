import { captureBetwaySnapshotWithRetries } from '../../supabase/functions/_shared/betwaySnapshot';

const snapshot = await captureBetwaySnapshotWithRetries();
console.log(JSON.stringify({
  complete: snapshot.complete,
  captured_at: snapshot.captured_at,
  pages_captured: snapshot.pages_captured,
  source_event_count: snapshot.source_event_count,
  excluded_event_count: snapshot.excluded_event_count,
  fixture_count: snapshot.fixtures.length,
}, null, 2));
