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
import {
  careerStats,
  JERSEY_COLORS,
  currentSeason,
  energyOn,
  gamesPlayed,
  goalReachedRecently,
  PET_NAME_MAX,
  PET_STATE_LABEL,
  petSays,
  petState,
  unseenGames,
  validatePetLook,
  type PetGame,
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

export function PetCard({ athlete, logs, tests, results, save, onChange, startEditing = false }: PetCardProps) {
  const [detailOpen, setDetailOpen] = useState(startEditing);
  const { look } = save;
  useEffect(() => preloadPetFrames(look), [look]);

  const now = new Date();
  const { name } = look;
  const energy = energyOn(athlete, logs, now);
  const games = gamesPlayed(athlete, logs, save.startedOn, now);
  const season = currentSeason(games);
  const unseen = unseenGames(games, save.seenThrough);
  const lastGame = games[games.length - 1];
  const state = petState({
    athlete,
    logs,
    today: now,
    goalJustReached: goalReachedRecently(tests, results, athlete.id, now),
    unseenWin: unseen.some((g) => g.won),
  });
  const says = petSays(athlete, logs, now);
  const markSeen = () => onChange({ ...save, seenThrough: lastGame.day });

  return (
    <Card className="pet-card" aria-labelledby="pet-name">
      <div className="pet-card__main">
        <button
          type="button"
          className="pet-card__sprite"
          onClick={() => setDetailOpen(true)}
          aria-label={`Open ${name}'s details`}
        >
          <PetSprite state={state} look={look} width={100} />
        </button>
        <div className="stack-sm pet-card__info">
          <div className="stack-xs">
            <h2 id="pet-name" className="title">
              {name}
            </h2>
            <div className="small muted">
              {PET_STATE_LABEL[state]} &middot; Season {season.number}: {season.wins}&ndash;{season.losses}
            </div>
          </div>
          <p className="pet-card__bubble small" aria-live="polite">
            {says}
          </p>
          <div className="stack-xs">
            <div className="spread small strong">
              <span>Energy for tonight&rsquo;s game</span>
              <span>{energy}%</span>
            </div>
            <ProgressBar percent={energy} />
          </div>
        </div>
      </div>

      {unseen.length > 0 ? (
        <Recap games={unseen} season={season} onDone={markSeen} />
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
          <PetSprite state={state} look={preview} width={200} />
        </div>
        <p className="pet-card__bubble small">{says}</p>

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
          <fieldset className="chip-group">
            <legend className="label">Jersey color</legend>
            <div className="pet-swatches">
              {JERSEY_COLORS.map((c) => (
                <label key={c.value} className="pet-swatch" title={c.label}>
                  <input
                    type="radio"
                    className="visually-hidden"
                    name="pet-jersey"
                    checked={draft.jersey === c.value}
                    onChange={() => setDraft({ ...draft, jersey: c.value })}
                    aria-label={c.label}
                  />
                  <span style={{ background: c.value }} />
                </label>
              ))}
            </div>
          </fieldset>
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
