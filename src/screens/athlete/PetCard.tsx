/*
  Player Pet on the Today screen. Only the athlete sees it.
  A small companion card; tapping the player opens a bigger detail view.
  The rules (energy, games, which sprite shows) live in src/domain/pet.ts.
*/
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { PetSprite, preloadPetFrames } from '../../components/PetSprite';
import { ProgressBar } from '../../components/ProgressBar';
import { useToast } from '../../components/Toast';
import { addDays, dayKey } from '../../domain/dates';
import { doneOnDay } from '../../domain/logs';
import {
  careerStats,
  currentSeason,
  energyOn,
  gamesPlayed,
  JERSEY_COLORS,
  latestGoalReachedAt,
  PET_NAME_MAX,
  PET_STATE_LABEL,
  petSays,
  petState,
  reactionToExercise,
  SKIN_TONES,
  unseenGames,
  validatePetLook,
  type PetGame,
  type PetReaction,
} from '../../domain/pet';
import type { Athlete, ExerciseLog, MilestoneTest, TestResult } from '../../domain/types';
import { newPetSave, type PetSave } from '../../store/petSave';

interface PetCardProps {
  athlete: Athlete;
  logs: ExerciseLog[];
  tests: MilestoneTest[];
  results: TestResult[];
  save: PetSave;
  onChange: (save: PetSave) => void;
  /** Open the detail view with the name box right away (first time the pet is turned on). */
  startEditing?: boolean;
}

/** "Beat the Hawks 24–17" or "Lost to the Wolves 10–17". */
function gameLine(game: PetGame): string {
  const score = `${game.ourScore}–${game.theirScore}`;
  return game.won ? `Beat the ${game.opponent} ${score}` : `Lost to the ${game.opponent} ${score}`;
}

function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
}

/** How long a reaction (cheer or celebration) lasts before he goes back to his resting pose. */
const REACTION_MS = 3500;

export function PetCard({ athlete, logs, tests, results, save, onChange, startEditing = false }: PetCardProps) {
  const [detailOpen, setDetailOpen] = useState(startEditing);
  const [reaction, setReaction] = useState<(PetReaction & { id: number }) | null>(null);
  const { look } = save;
  useEffect(() => preloadPetFrames(look), [look]);

  const now = new Date();
  const { name } = look;
  const energy = energyOn(athlete, logs, now);
  const exercisesLeft = athlete.assignedExerciseIds.length - doneOnDay(athlete, logs, now);
  const games = gamesPlayed(athlete, logs, save.startedOn, now);
  const season = currentSeason(games);
  const unseen = unseenGames(games, save.seenThrough);
  const lastGame = games[games.length - 1];
  const goalAt = latestGoalReachedAt(tests, results, athlete.id, now);

  function react(next: PetReaction) {
    setReaction({ ...next, id: Date.now() });
  }

  // He goes back to his resting pose after a moment.
  useEffect(() => {
    if (!reaction) return;
    const timer = setTimeout(() => setReaction(null), REACTION_MS);
    return () => clearTimeout(timer);
  }, [reaction]);

  // An exercise was just logged: energy went up, so he cheers (or celebrates a finished plan).
  const lastEnergy = useRef(energy);
  useEffect(() => {
    if (energy > lastEnergy.current) react(reactionToExercise(lastEnergy.current, energy, exercisesLeft));
    lastEnergy.current = energy;
  }, [energy, exercisesLeft]);

  // A milestone goal he hasn't celebrated yet. Each goal gets one celebration.
  useEffect(() => {
    if (goalAt && (!save.celebratedGoalAt || goalAt > save.celebratedGoalAt)) {
      react({ state: 'celebrating', text: 'You hit a milestone goal! That is huge!' });
      onChange({ ...save, celebratedGoalAt: goalAt });
    }
  }, [goalAt]); // only re-check when a newer goal shows up

  const resting = petState({ athlete, logs, today: now });
  const state = reaction?.state ?? resting;
  const says = reaction?.text ?? petSays(athlete, logs, now);

  function closeRecap() {
    const wins = unseen.filter((g) => g.won).length;
    if (wins > 0) {
      react({
        state: 'celebrating',
        text: unseen.length === 1 ? 'We won! Thanks for the energy.' : `We won ${wins} of ${unseen.length} while you were away!`,
      });
    }
    onChange({ ...save, seenThrough: lastGame.day });
  }

  return (
    <Card className="pet-card" aria-labelledby="pet-name">
      {/* Name above him; his speech box rises beside the name so its tail points at his head. */}
      <div className="pet-card__main">
        <h2 id="pet-name" className="title pet-card__name">
          {name}
        </h2>
        <button
          type="button"
          className={`pet-card__sprite${reaction ? ' pet-card__sprite--react' : ''}`}
          onClick={() => setDetailOpen(true)}
          aria-label={`Open ${name}'s details`}
        >
          <PetSprite state={state} look={look} />
          {reaction?.badge && (
            <span key={reaction.id} className="pet-card__badge" aria-hidden="true">
              {reaction.badge}
            </span>
          )}
        </button>
        <PetSpeech text={says} excited={reaction !== null} />
      </div>
      <div className="small muted">
        {PET_STATE_LABEL[state]} &middot; Season {season.number}: {season.wins}&ndash;{season.losses}
      </div>

      <div className="stack-xs">
        <div className="spread small strong">
          <span>Energy for tonight&rsquo;s game</span>
          <span>{energy}%</span>
        </div>
        <ProgressBar percent={energy} />
      </div>

      {unseen.length > 0 ? (
        <Recap games={unseen} season={season} onDone={closeRecap} />
      ) : (
        <p className="small muted">
          {lastGame ? `Last game: ${gameLine(lastGame)}.` : `First game is tonight.`} Tap {name} for more.
        </p>
      )}

      {detailOpen && (
        <PetDetail
          state={state}
          says={says}
          energy={energy}
          games={games}
          save={save}
          onChange={onChange}
          startEditing={startEditing}
          onClose={() => setDetailOpen(false)}
        />
      )}
    </Card>
  );
}

/**
 * What he says, in a white retro game text box with a pixel arrow pointing
 * at him. aria-live lets screen readers announce his reactions.
 */
function PetSpeech({ text, excited = false, tail = 'left' }: { text: string; excited?: boolean; tail?: 'left' | 'up' }) {
  return (
    <p className={`pet-speech pet-speech--${tail}${excited ? ' pet-speech--excited' : ''}`} aria-live="polite">
      {tail === 'left' ? (
        // A short triangle stub under the box's bottom-left corner, pointing at his head, drawn as pixels.
        <svg className="pet-speech__tail" viewBox="0 0 9 6" shapeRendering="crispEdges" aria-hidden="true">
          <path d="M2 4h1v1H2zM3 3h1v1H3zM3 4h1v1H3zM3 5h1v1H3zM4 3h1v1H4zM4 4h1v1H4zM5 3h1v1H5zM5 4h1v1H5zM6 2h1v1H6zM6 3h1v1H6zM6 4h1v1H6zM7 2h1v1H7zM7 3h1v1H7zM8 2h1v1H8zM8 3h1v1H8z" fill="#00000040" />
          <path d="M1 2h1v1H1zM2 1h1v1H2zM2 3h1v1H2zM3 0h1v1H3zM3 2h1v1H3zM4 2h1v1H4zM5 2h1v1H5zM6 1h1v1H6zM7 1h1v1H7zM8 0h1v1H8z" fill="#14141c" />
          <path d="M2 2h1v1H2zM3 1h1v1H3zM4 0h1v1H4zM4 1h1v1H4zM5 0h1v1H5zM5 1h1v1H5zM6 0h1v1H6zM7 0h1v1H7z" fill="#ffffff" />
        </svg>
      ) : (
        // A small arrow on top, pointing up at him.
        <svg className="pet-speech__tail" viewBox="0 0 5 7" shapeRendering="crispEdges" aria-hidden="true">
          <path d="M4 0h1v1H4zM3 1h1v1H3zM2 2h1v1H2zM1 3h1v1H1zM2 4h1v1H2zM3 5h1v1H3zM4 6h1v1H4z" fill="#14141c" />
          <path d="M4 1h1v5H4zM3 2h1v3H3zM2 3h1v1H2z" fill="#ffffff" />
        </svg>
      )}
      {text}
    </p>
  );
}

function Recap({
  games,
  season,
  onDone,
}: {
  games: PetGame[];
  season: ReturnType<typeof currentSeason>;
  onDone: () => void;
}) {
  // Show the latest few; a long break would otherwise make a long list.
  const shown = games.slice(-3);
  const hidden = games.length - shown.length;
  return (
    <section className="panel" aria-labelledby="pet-recap">
      <div id="pet-recap" className="strong">
        While you were away
      </div>
      <GameList games={shown} />
      {hidden > 0 && <p className="small muted">Plus {hidden} earlier game{hidden === 1 ? '' : 's'}.</p>}
      {season.justFinished && (
        <p className="small strong">
          Season {season.justFinished.number} final: {season.justFinished.wins}&ndash;{season.justFinished.losses}.
          Season {season.number} starts tonight!
        </p>
      )}
      <Button variant="primary" className="align-start" onClick={onDone}>
        Nice!
      </Button>
    </section>
  );
}

function GameList({ games }: { games: PetGame[] }) {
  return (
    <ul className="pet-recap">
      {games.map((g) => (
        <li key={g.day}>
          <span className={g.won ? 'pet-recap__win' : 'pet-recap__loss'}>{g.won ? 'W' : 'L'}</span>
          <span>
            <span className="strong">{gameLine(g)}</span>
            <span className="small muted">
              {' '}
              &middot; {shortDay(g.day)} &middot; {g.touchdowns} TD, {g.yards} yds &middot; {g.energy}% energy
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The bigger view: large sprite, stats, recent games, rename, turn off. */
function PetDetail({
  state,
  says,
  energy,
  games,
  save,
  onChange,
  startEditing,
  onClose,
}: {
  state: ReturnType<typeof petState>;
  says: string;
  energy: number;
  games: PetGame[];
  save: PetSave;
  onChange: (save: PetSave) => void;
  startEditing: boolean;
  onClose: () => void;
}) {
  const { notify } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(save.look);
  // Keep the number as typed text so the box can be empty while editing.
  const [numberText, setNumberText] = useState(String(save.look.number));
  const preview = { ...draft, number: numberText === '' ? save.look.number : Number(numberText) };
  const season = currentSeason(games);
  const career = careerStats(games);

  // showModal() makes it a real modal: focus moves in, Escape closes it, the page behind is inert.
  // (Leaving the page removes it, so there's nothing to clean up.)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function saveLook(event: FormEvent) {
    event.preventDefault();
    const result = validatePetLook({ ...draft, number: numberText === '' ? NaN : Number(numberText) });
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    onChange({ ...save, look: result.value });
    notify(`Saved. Looking good, ${result.value.name}!`);
  }

  return (
    <dialog
      ref={dialogRef}
      className="pet-dialog"
      aria-labelledby="pet-dialog-title"
      onClose={onClose}
      // Clicking the dark area outside the box closes it.
      onClick={(e) => e.target === dialogRef.current && dialogRef.current?.close()}
    >
      <div className="pet-dialog__body">
        <div className="spread">
          <div className="stack-xs">
            <h2 id="pet-dialog-title" className="title">
              {save.look.name}
            </h2>
            <span className="small muted">{PET_STATE_LABEL[state]}</span>
          </div>
          <Button onClick={() => dialogRef.current?.close()} aria-label="Close">
            &times;
          </Button>
        </div>

        <div className="pet-dialog__stage">
          <PetSprite state={state} look={preview} scale={3} />
        </div>
        <PetSpeech text={says} tail="up" />

        <div className="stack-xs">
          <div className="spread small strong">
            <span>Energy for tonight&rsquo;s game</span>
            <span>{energy}%</span>
          </div>
          <ProgressBar percent={energy} />
        </div>

        <dl className="pet-stats">
          <div>
            <dt>Season {season.number}</dt>
            <dd>
              {season.wins}&ndash;{season.losses}
            </dd>
          </div>
          <div>
            <dt>Career wins</dt>
            <dd>{career.wins}</dd>
          </div>
          <div>
            <dt>Touchdowns</dt>
            <dd>{career.touchdowns}</dd>
          </div>
          <div>
            <dt>Yards</dt>
            <dd>{career.yards.toLocaleString()}</dd>
          </div>
        </dl>

        {games.length > 0 && (
          <section className="stack-sm" aria-label="Recent games">
            <div className="label">Recent games</div>
            <GameList games={games.slice(-5).reverse()} />
          </section>
        )}

        <form className="stack-sm" onSubmit={saveLook} aria-label="Customize your player">
          <div className="pet-editor__fields">
            <label className="stack-xs">
              <span className="label">Name</span>
              <input
                className="field"
                value={draft.name}
                maxLength={PET_NAME_MAX}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus={startEditing}
              />
            </label>
            <label className="stack-xs">
              <span className="label">Number</span>
              <input
                className="field"
                inputMode="numeric"
                value={numberText}
                maxLength={2}
                onChange={(e) => setNumberText(e.target.value.replace(/\D/g, ''))}
              />
            </label>
          </div>
          <Swatches
            legend="Jersey color"
            name="pet-jersey"
            options={JERSEY_COLORS}
            value={draft.jersey}
            onPick={(jersey) => setDraft({ ...draft, jersey })}
          />
          <Swatches
            legend="Skin tone"
            name="pet-skin"
            options={SKIN_TONES}
            value={draft.skin}
            onPick={(skin) => setDraft({ ...draft, skin })}
          />
          <Button type="submit" variant="primary" className="align-start">
            Save
          </Button>
        </form>

        <hr className="pet-dialog__rule" />
        <div className="spread pet-dialog__off">
          <span className="small muted">Not for you? You can turn it back on at the bottom of Today.</span>
          <Button onClick={() => onChange({ ...save, enabled: false })}>Turn off Player Pet</Button>
        </div>
      </div>
    </dialog>
  );
}

/** A row of round color choices (radio buttons). */
function Swatches({
  legend,
  name,
  options,
  value,
  onPick,
}: {
  legend: string;
  name: string;
  options: readonly { label: string; value: string }[];
  value: string;
  onPick: (value: string) => void;
}) {
  return (
    <fieldset className="chip-group">
      <legend className="label">{legend}</legend>
      <div className="pet-swatches">
        {options.map((c) => (
          <label key={c.value} className="pet-swatch" title={c.label}>
            <input
              type="radio"
              className="visually-hidden"
              name={name}
              checked={value === c.value}
              onChange={() => onPick(c.value)}
              aria-label={c.label}
            />
            <span style={{ background: c.value }} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The small "turn it on" card shown at the bottom of Today while the pet is off. */
export function PetOffCard({ save, onChange }: { save: PetSave | null; onChange: (save: PetSave, firstTime: boolean) => void }) {
  function turnOn() {
    const today = new Date();
    if (save) {
      // Coming back: keep the player, skip the recap of games from while it was off.
      onChange({ ...save, enabled: true, seenThrough: dayKey(addDays(today, -1)) }, false);
    } else {
      onChange(newPetSave(today), true);
    }
  }
  return (
    <Card className="pet-off">
      <div className="spread">
        <div className="stack-xs">
          <div className="strong">Player Pet</div>
          <p className="small muted">
            A player who plays a game every night. Your exercises give him the energy to win.
          </p>
        </div>
        <Button onClick={turnOn}>Turn on</Button>
      </div>
    </Card>
  );
}
