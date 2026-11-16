import { describe, expect, it } from 'vitest';
import {
  buildProposal,
  sanitizeProposal,
  savedSummary,
  type PlanContext,
  type Proposal,
} from '../../supabase/functions/trainer-assistant/plan';
import { planNumbers, toHistory, withAnswer, type AssistantTurn } from './assistant';

const VIDEO = 'dQw4w9WgXcQ';

function context(): PlanContext {
  return {
    athletes: [{ id: 'a-maya', name: 'Maya Torres' }],
    injuries: [{ id: 'i-ankle', name: 'Ankle sprain', body_region: 'Ankle' }],
    exercises: [
      { id: 'e-calf', name: 'Double-leg calf raise', video_url: 'https://www.youtube.com/watch?v=cqDMYUaIXvw' },
      { id: 'e-balance', name: 'Single-leg balance', video_url: null },
    ],
    videos: new Map([[VIDEO, { title: 'Copenhagen plank how-to' }]]),
  };
}

/** Unwraps a result the test expects to succeed. */
function ok<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('buildProposal', () => {
  it('assigns catalog exercises to an athlete', () => {
    const plan = ok(buildProposal(
      { athlete_id: 'a-maya', injury: { id: 'i-ankle' }, exercises: [{ id: 'e-calf', sets: 3, reps: 15 }, { id: 'e-balance', sets: 3, hold_seconds: 30 }] },
      context(),
    ));
    expect(plan.athlete).toEqual({ id: 'a-maya', name: 'Maya Torres' });
    expect(plan.injury).toEqual({ id: 'i-ankle', name: 'Ankle sprain', bodyRegion: 'Ankle' });
    expect(plan.exercises.map((e) => [e.name, e.sets, e.reps, e.holdSeconds])).toEqual([
      ['Double-leg calf raise', 3, 15, null],
      ['Single-leg balance', 3, null, 30],
    ]);
  });

  it('refuses an athlete the trainer does not have', () => {
    const result = buildProposal({ athlete_id: 'a-someone-else', injury: { id: 'i-ankle' }, exercises: [{ id: 'e-calf' }] }, context());
    expect(result.ok).toBe(false);
  });

  it('refuses ids that are not in the catalogs', () => {
    expect(buildProposal({ athlete_id: 'a-maya', injury: { id: 'i-made-up' }, exercises: [{ id: 'e-calf' }] }, context()).ok).toBe(false);
    expect(buildProposal({ athlete_id: 'a-maya', injury: { id: 'i-ankle' }, exercises: [{ id: 'e-made-up' }] }, context()).ok).toBe(false);
  });

  it('adds a new injury and a new exercise with the video the search found', () => {
    const plan = ok(buildProposal(
      {
        athlete_id: 'a-maya',
        injury: { name: 'Groin strain', body_region: 'Hip' },
        exercises: [{ name: 'Copenhagen plank', description: 'Side plank with the top leg on a bench. Hold.', video_id: VIDEO, sets: 3, hold_seconds: 20 }],
      },
      context(),
    ));
    expect(plan.injury).toEqual({ id: null, name: 'Groin strain', bodyRegion: 'Hip' });
    expect(plan.exercises[0]).toMatchObject({
      id: null,
      name: 'Copenhagen plank',
      videoUrl: `https://www.youtube.com/watch?v=${VIDEO}`,
      videoTitle: 'Copenhagen plank how-to',
    });
  });

  it('drops a video the search never returned, so a made-up link cannot be saved', () => {
    const plan = ok(buildProposal(
      { exercises: [{ name: 'Copenhagen plank', description: 'Side plank on a bench.', video_id: 'AAAAAAAAAAA' }] },
      context(),
    ));
    expect(plan.exercises[0].videoUrl).toBeNull();
  });

  it('treats a "new" injury or exercise with an existing name as the existing one', () => {
    const plan = ok(buildProposal(
      { athlete_id: 'a-maya', injury: { name: '  ankle  SPRAIN ' }, exercises: [{ name: 'double-leg calf raise', description: 'x' }] },
      context(),
    ));
    expect(plan.injury?.id).toBe('i-ankle');
    expect(plan.exercises[0].id).toBe('e-calf');
    // The catalog's own video, not one from the AI.
    expect(plan.exercises[0].videoUrl).toBe('https://www.youtube.com/watch?v=cqDMYUaIXvw');
  });

  it('needs a how-to for a new exercise', () => {
    expect(buildProposal({ exercises: [{ name: 'Copenhagen plank' }] }, context()).ok).toBe(false);
  });

  it('keeps one copy of an exercise listed twice', () => {
    const plan = ok(buildProposal({ athlete_id: 'a-maya', injury: { id: 'i-ankle' }, exercises: [{ id: 'e-calf' }, { name: 'Double-leg calf raise' }] }, context()));
    expect(plan.exercises).toHaveLength(1);
  });

  it('ignores numbers that are not whole and positive', () => {
    const plan = ok(buildProposal({ athlete_id: 'a-maya', injury: { id: 'i-ankle' }, exercises: [{ id: 'e-calf', sets: 0, reps: 2.5, hold_seconds: -4 }] }, context()));
    expect(plan.exercises[0]).toMatchObject({ sets: null, reps: null, holdSeconds: null });
  });

  it('needs an injury and an exercise to assign to an athlete', () => {
    expect(buildProposal({ athlete_id: 'a-maya', exercises: [{ id: 'e-calf' }] }, context()).ok).toBe(false);
    expect(buildProposal({ athlete_id: 'a-maya', injury: { id: 'i-ankle' }, exercises: [] }, context()).ok).toBe(false);
  });

  it('with no athlete, only accepts a plan that adds something to the catalogs', () => {
    expect(buildProposal({ injury: { id: 'i-ankle' }, exercises: [{ id: 'e-calf' }] }, context()).ok).toBe(false);
    expect(buildProposal({ injury: { name: 'Turf toe', body_region: 'Foot' }, exercises: [] }, context()).ok).toBe(true);
  });
});

describe('sanitizeProposal', () => {
  const plan: Proposal = {
    athlete: { id: 'a-maya', name: 'Maya Torres' },
    injury: { id: null, name: 'Groin strain', bodyRegion: 'Hip' },
    exercises: [
      { id: null, name: 'Copenhagen plank', description: 'Side plank on a bench.', videoUrl: `https://youtu.be/${VIDEO}`, videoTitle: 'How-to', sets: 3, reps: null, holdSeconds: 20 },
    ],
  };

  it('passes a good plan through, with the video as a plain watch link', () => {
    const clean = ok(sanitizeProposal(JSON.parse(JSON.stringify(plan))));
    expect(clean.exercises[0].videoUrl).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
    expect(clean.athlete?.id).toBe('a-maya');
  });

  it('drops a video link that is not YouTube', () => {
    const tampered = { ...plan, exercises: [{ ...plan.exercises[0], videoUrl: 'https://example.com/watch?v=dQw4w9WgXcQ' }] };
    expect(ok(sanitizeProposal(tampered)).exercises[0].videoUrl).toBeNull();
  });

  it('refuses plans that are the wrong shape', () => {
    expect(sanitizeProposal(null).ok).toBe(false);
    expect(sanitizeProposal({ athlete: plan.athlete, injury: null, exercises: plan.exercises }).ok).toBe(false);
    expect(sanitizeProposal({ athlete: null, injury: plan.injury, exercises: 'all of them' }).ok).toBe(false);
    expect(sanitizeProposal({ athlete: null, injury: null, exercises: [] }).ok).toBe(false);
  });
});

describe('savedSummary', () => {
  it('says who got what and what was added to the catalog', () => {
    const text = savedSummary({
      athlete: { id: 'a-maya', name: 'Maya Torres' },
      injury: { id: null, name: 'Groin strain', bodyRegion: 'Hip' },
      exercises: [
        { id: 'e-calf', name: 'Double-leg calf raise', description: null, videoUrl: null, videoTitle: null, sets: 3, reps: 15, holdSeconds: null },
        { id: null, name: 'Copenhagen plank', description: 'x', videoUrl: null, videoTitle: null, sets: 3, reps: null, holdSeconds: 20 },
      ],
    });
    expect(text).toBe('Assigned 2 exercises to Maya Torres for Groin strain. Added to the catalog: the injury Groin strain and Copenhagen plank.');
  });
});

describe('conversation', () => {
  const proposal: Proposal = {
    athlete: { id: 'a-maya', name: 'Maya Torres' },
    injury: { id: 'i-ankle', name: 'Ankle sprain', bodyRegion: 'Ankle' },
    exercises: [{ id: 'e-calf', name: 'Double-leg calf raise', description: null, videoUrl: null, videoTitle: null, sets: 3, reps: 15, holdSeconds: null }],
  };

  it('marks a waiting plan replaced when a new plan arrives, but not for a plain reply', () => {
    const first = withAnswer([], { reply: 'Here’s the plan.', proposal }, 1);
    expect(first[0].status).toBe('pending');
    expect(withAnswer(first, { reply: 'Which Maya?', proposal: null }, 2)[0].status).toBe('pending');
    const second = withAnswer(first, { reply: 'Updated.', proposal }, 2);
    expect(second.map((t) => t.status)).toEqual(['replaced', 'pending']);
  });

  it('writes each plan and its outcome into the history the AI reads', () => {
    const turns: AssistantTurn[] = [
      { id: 1, from: 'trainer', text: 'Maya rolled her ankle' },
      { id: 2, from: 'assistant', text: 'Here’s the plan.', proposal, status: 'saved' },
    ];
    const history = toHistory(turns);
    expect(history[0]).toEqual({ role: 'user', content: 'Maya rolled her ankle' });
    expect(history[1].role).toBe('assistant');
    expect(history[1].content).toContain('the trainer confirmed it and it is saved');
    expect(history[1].content).toContain('"id":"e-calf"');
  });

  it('treats a visit card like a plan card: a new one replaces one still waiting', () => {
    const visit = {
      athlete: { id: 'a-maya', name: 'Maya Torres' },
      summary: 'Ankle feeling better.',
      pain: 3,
      doneToday: null,
      results: [{ goalId: 'g-balance', name: 'Single-leg balance', unit: 'sec', target: 30, value: 25 }],
      availability: null,
      plan: null,
    };
    const first = withAnswer([], { reply: 'Here’s the plan.', proposal }, 1);
    const second = withAnswer(first, { reply: 'Here’s the visit.', proposal: null, visit }, 2);
    expect(second.map((t) => t.status)).toEqual(['replaced', 'pending']);
    expect(second[1].visit).toEqual(visit);

    const history = toHistory([{ ...second[1], status: 'saved' }]);
    expect(history[0].content).toContain('[Visit shown to trainer (the trainer confirmed it and it is saved)');
    expect(history[0].content).toContain('"goal_id":"g-balance"');
  });
});

describe('planNumbers', () => {
  it('reads like the rest of the app', () => {
    expect(planNumbers(3, 12, null)).toBe('3 sets of 12');
    expect(planNumbers(3, null, 30)).toBe('3 sets of 30 sec');
    expect(planNumbers(3, 10, 5)).toBe('3 sets of 10, 5 sec hold');
    expect(planNumbers(null, null, 45)).toBe('45 sec hold');
    expect(planNumbers(null, null, null)).toBe('');
  });
});
