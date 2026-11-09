import { useState, type FormEvent } from 'react';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { useToast } from '../../components/Toast';
import { useReturnFocus } from '../../components/useReturnFocus';
import { currentValue, goalPercent, isGoalReached } from '../../domain/goals';
import type { MilestoneTest } from '../../domain/types';
import { formatNumber } from '../../format';
import { useAppStore } from '../../store/AppStore';

/** "8 more seconds to go." For "% of healthy leg" the gap is in percentage points. */
function remainingText(test: MilestoneTest, remaining: number): string {
  const unit = test.unit.startsWith('%') ? 'percentage points' : test.unit;
  return `${formatNumber(remaining)} more ${unit} to go.`;
}

/** One recovery milestone: where the athlete is now, the target, and a way to log a new result. */
export function GoalCard({ test, athleteId }: { test: MilestoneTest; athleteId: string }) {
  const { state, commands } = useAppStore();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const logButtonRef = useReturnFocus(open);

  const current = currentValue(test, state.results, athleteId);
  const percent = goalPercent(test, current);
  const met = isGoalReached(test, state.results, athleteId);
  const change = current - test.baseline;
  const inputId = `result-${test.id}`;

  function close() {
    setOpen(false);
    setValue('');
  }

  // A <form> lets Enter submit. preventDefault stops the browser reloading the page.
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const saved = await commands.recordResult(athleteId, test.id, value);
    setSaving(false);
    if (!saved.ok) {
      notify(saved.error, 'error');
      return;
    }
    const { result, newlyReached } = saved.value;
    const left = test.target - result.value;
    let text = `Saved: ${test.name} ${formatNumber(result.value)} ${test.unit}. `;
    if (newlyReached) text += 'Milestone reached!';
    else if (left <= 0) text += 'Milestone reached.';
    else text += `${formatNumber(left)} to go.`;
    close();
    notify(text);
  }

  return (
    <Card>
      <div className="spread">
        <div className="stack-xs">
          <h2 className="title">{test.name}</h2>
          <div className="muted">{test.description}</div>
        </div>
        <Badge tone={met ? 'solid' : 'outline'}>{met ? 'Reached' : `${percent}% there`}</Badge>
      </div>

      <div className="big-stat">
        <span className="big-stat__num">{formatNumber(current)}</span>
        <span className="muted">
          {test.unit} now &middot; goal {test.target}
        </span>
      </div>
      <ProgressBar percent={percent} size="lg" />
      <div className="strong">{met ? 'Milestone reached.' : remainingText(test, test.target - current)}</div>
      <div className="small muted">
        Week 1: {test.baseline} &rarr; this week: {formatNumber(current)} ({change >= 0 ? 'up' : 'down'}{' '}
        {formatNumber(Math.abs(change))})
      </div>

      {open ? (
        <form className="panel" onSubmit={save} noValidate>
          <label htmlFor={inputId} className="strong">
            New result ({test.unit})
          </label>
          <input
            id={inputId}
            className="field"
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
          />
          <div className="row">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save result'}
            </Button>
            <Button onClick={close}>Cancel</Button>
          </div>
          <div className="small muted">Self-reported. Your trainer confirms it at your next retest.</div>
        </form>
      ) : (
        <Button ref={logButtonRef} className="align-start strong" onClick={() => setOpen(true)}>
          Log new result
        </Button>
      )}
    </Card>
  );
}
