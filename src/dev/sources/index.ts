// DEV ONLY. Every recording source, by id. Add other sports here.

import type { RecordingSource } from '../recording.ts';
import { nascar } from './nascar.ts';

export const SOURCES: Record<string, RecordingSource> = { [nascar.id]: nascar };
