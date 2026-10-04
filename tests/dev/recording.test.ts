import { describe, expect, it } from 'vitest';
import {
  frameLine,
  isRecordingManifest,
  parseFrames,
  recordingFolderName,
  type RecordingManifest,
} from '../../src/dev/recording.ts';
import { createReplayPlayer, missing, type ReplayPayload } from '../../src/dev/replay.ts';
import { nascar } from '../../src/dev/sources/nascar.ts';

const manifest: RecordingManifest = {
  format: 'spotter-recording',
  version: 1,
  source: 'nascar',
  title: 'NASCAR Cup - Test 100 - Race',
  startedAt: 0,
  intervalMs: 5000,
  feeds: {
    'live-feed': 'https://cf.nascar.com/live/feeds/live-feed.json',
    'live-points': 'https://cf.nascar.com/live/feeds/live-points.json',
  },
};

describe('recording files', () => {
  it('round-trips frames and skips a partial last line', () => {
    const text =
      frameLine(2000, { lap_number: 2 }) + frameLine(1000, { lap_number: 1 }) + '{"t":30';
    expect(parseFrames(text)).toEqual([
      [1000, { lap_number: 1 }],
      [2000, { lap_number: 2 }],
    ]);
  });

  it('recognizes manifests', () => {
    expect(isRecordingManifest(manifest)).toBe(true);
    expect(isRecordingManifest({ colSpec: [] })).toBe(false);
    expect(isRecordingManifest(null)).toBe(false);
  });

  it('names folders safely', () => {
    const at = new Date(2026, 9, 4, 18, 5);
    expect(recordingFolderName(at, 'NASCAR Cup - A/B: "400"  - Race.')).toBe(
      '2026-10-04 18-05 NASCAR Cup - AB 400 - Race',
    );
    expect(recordingFolderName(at, '')).toBe('2026-10-04 18-05');
  });
});

describe('nascar source', () => {
  it('maps featured and per-series URLs to feeds', () => {
    expect(nascar.feedForUrl('https://cf.nascar.com/live/feeds/live-feed.json')).toBe('live-feed');
    expect(nascar.feedForUrl('https://cf.nascar.com/live/feeds/series_1/5630/live_feed.json')).toBe(
      'live-feed',
    );
    expect(nascar.feedForUrl('https://cf.nascar.com/live/feeds/series_2/1/live_points.json')).toBe(
      'live-points',
    );
    expect(nascar.feedForUrl('https://cf.nascar.com/cacher/drivers.json')).toBeNull();
  });

  it('titles and finishes from the feed header', () => {
    const body = { series_id: 1, run_name: 'South Point 400', run_type: 3, flag_state: 9 };
    expect(nascar.title(body)).toBe('NASCAR Cup - South Point 400 - Race');
    expect(nascar.isFinished(body)).toBe(true);
    expect(nascar.isFinished({ flag_state: 1 })).toBe(false);
  });
});

describe('replay player', () => {
  const payload: ReplayPayload = {
    kind: 'recording',
    manifest,
    feeds: {
      'live-feed': [
        [10_000, { lap_number: 1 }],
        [20_000, { lap_number: 2 }],
        [40_000, { lap_number: 3 }],
      ],
      'live-points': [[25_000, { points: 'a' }]],
    },
  };
  const feedUrl = manifest.feeds['live-feed']!;
  const pointsUrl = manifest.feeds['live-points']!;

  it('plays every feed on one clock at the requested speed', () => {
    const player = createReplayPlayer(payload, { name: 'x', speed: 10, startLap: 0 }, 0);
    expect(player.frameFor(feedUrl, 0)).toEqual({ lap_number: 1 });
    expect(player.frameFor(pointsUrl, 0)).toBeUndefined(); // not recorded yet
    expect(player.frameFor(feedUrl, 1000)).toEqual({ lap_number: 2 }); // 10 s recorded
    expect(player.frameFor(pointsUrl, 1500)).toEqual({ points: 'a' });
    expect(player.frameFor(feedUrl, 99_000)).toEqual({ lap_number: 3 }); // holds the last
  });

  it('fast-forwards to a lap', () => {
    const player = createReplayPlayer(payload, { name: 'x', speed: 1, startLap: 2 }, 0);
    expect(player.frameFor(feedUrl, 0)).toEqual({ lap_number: 2 });
    expect(player.frameFor(feedUrl, 19_999)).toEqual({ lap_number: 2 });
    expect(player.frameFor(feedUrl, 20_000)).toEqual({ lap_number: 3 });
  });

  it('leaves unrecorded feeds to the network', () => {
    const player = createReplayPlayer(payload, { name: 'x', speed: 1, startLap: 0 }, 0);
    expect(player.frameFor('https://cf.nascar.com/cacher/drivers.json', 0)).toBe(missing);
  });
});
