import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type ProgressPayload = {
  episodeId?: string;
  animeId?: string;
  positionSeconds?: number;
  durationSeconds?: number | null;
  completed?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as ProgressPayload;
    const episodeId = String(body.episodeId || '');
    const animeId = String(body.animeId || '');
    const positionSeconds = Number(body.positionSeconds || 0);
    const rawDuration = body.durationSeconds == null ? null : Number(body.durationSeconds);
    const durationSeconds = rawDuration != null && Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null;
    const completed = Boolean(body.completed);

    if (!episodeId || !animeId || !Number.isFinite(positionSeconds) || positionSeconds < 0) {
      return NextResponse.json({ error: 'invalid_progress_payload' }, { status: 400 });
    }

    const db = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });
    }

    const { error } = await db.from('playback_progress').upsert({
      user_id: user.id,
      episode_id: episodeId,
      anime_id: animeId,
      position_seconds: Math.max(0, positionSeconds),
      duration_seconds: durationSeconds,
      completed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,episode_id' });

    if (error) {
      console.error('[player-progress] upsert failed', error.code, error.message);
      return NextResponse.json({ error: 'progress_save_failed' }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error('[player-progress] request failed', error);
    return NextResponse.json({ error: 'progress_save_failed' }, { status: 500 });
  }
}
