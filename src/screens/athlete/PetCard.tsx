/*
  Player Pet card on the Today screen. Only the athlete sees it.
  The rules (energy, games, seasons) live in src/domain/pet.ts.
*/
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { PetSprite } from '../../components/PetSprite';
import { ProgressBar } from '../../components/ProgressBar';
import { useToast } from '../../components/Toast';
import { addDays, dayKey } from '../../domain/dates';
import {
  careerStats,
  currentSeason,
  energyOn,
  gamesPlayed,
  JERSEY_COLORS,
  moodFor,
  PET_NAME_MAX,
  petSays,
  SKIN_TONES,
  TRIM_COLORS,
  unseenGames,
  validatePetLook,
  type PetGame,
  type PetLook,
} from '../../domain/pet';
import type { Athlete, ExerciseLog } from '../../domain/types';
import { newPetSave, type PetSave } from '../../store/petSave';

interface PetCardProps {
  athlete: Athlete;
  logs: ExerciseLog[];
  save: PetSave;
  onChange: (save: PetSave) => void;
  /** Open the customize panel right away (first time the pet is turned on). */
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

export function PetCard({ athlete, logs, save, onChange, startEditing = false }: PetCardProps) {
  const [editing, setEditing] = useState(startEditing);
  const now = new Date();
  const { look } = save;

  const energy = energyOn(athlete, logs, now);
  const mood = moodFor(energy);
  const games = gamesPlayed(athlete, logs, save.startedOn, now);
  const season = currentSeason(games);
  const career = careerStats(games);
  const unseen = unseenGames(games, save.seenThrough);
  const lastGame = games[games.length - 1];

  return (
    <Card className="pet-card" aria-labelledby="pet-name">
      <div className="pet-card__main">
        <div className="pet-card__sprite">
          <PetSprite look={look} mood={mood} size={88} />
        </div>
        <div className="stack-sm pet-card__info">
          <div className="stack-xs">
            <h2 id="pet-name" className="title">
              {look.name} <span className="muted normal">#{look.number}</span>
            </h2>
            <div className="small muted">
              Season {season.number} &middot; {season.wins}&ndash;{season.losses}
            </div>
          </div>
          <p className="pet-card__bubble small" aria-live="polite">
            {petSays(athlete, logs, now)}
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
        <Recap games={unseen} season={season} onDone={() => onChange({ ...save, seenThrough: lastGame.day })} />
      ) : lastGame ? (
        <p className="small muted">Last game: {gameLine(lastGame)}</p>
      ) : (
        <p className="small muted">First game is tonight. Every exercise you log gives {look.name} energy.</p>
      )}

      {editing ? (
        <PetEditor
          look={look}
          onSave={(next) => {
            onChange({ ...save, look: next });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          onTurnOff={() => onChange({ ...save, enabled: false })}
        />
      ) : (
        <div className="spread pet-card__footer">
          <span className="small muted">
            Career: {career.wins} wins &middot; {career.touchdowns} TD &middot; {career.yards.toLocaleString()} yds
          </span>
          <Button onClick={() => setEditing(true)}>Customize</Button>
        </div>
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
      <ul className="pet-recap">
        {shown.map((g) => (
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

function PetEditor({
  look,
  onSave,
  onCancel,
  onTurnOff,
}: {
  look: PetLook;
  onSave: (look: PetLook) => void;
  onCancel: () => void;
  onTurnOff: () => void;
}) {
  const { notify } = useToast();
  const [draft, setDraft] = useState(look);
  // Keep the number as typed text so the box can be empty while editing.
  const [numberText, setNumberText] = useState(String(look.number));
  const preview = { ...draft, number: Number(numberText) || 0 };

  function submit(event: FormEvent) {
    event.preventDefault();
    const result = validatePetLook({ ...draft, number: numberText.trim() === '' ? NaN : Number(numberText) });
    if (!result.ok) {
      notify(result.error, 'error');
      return;
    }
    onSave(result.value);
  }

  return (
    <form className="panel pet-editor" onSubmit={submit} aria-label="Customize your player">
      <div className="pet-editor__preview">
        <PetSprite look={preview} mood="pumped" size={72} />
      </div>
      <div className="pet-editor__fields">
        <label className="stack-xs">
          <span className="label">Name</span>
          <input
            className="field"
            value={draft.name}
            maxLength={PET_NAME_MAX}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            autoFocus
          />
        </label>
        <label className="stack-xs">
          <span className="label">Jersey number</span>
          <input
            className="field pet-editor__number"
            inputMode="numeric"
            value={numberText}
            maxLength={2}
            onChange={(e) => setNumberText(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>
      <Swatches legend="Jersey" name="jersey" options={JERSEY_COLORS} value={draft.jersey} onPick={(jersey) => setDraft({ ...draft, jersey })} />
      <Swatches legend="Trim and number" name="trim" options={TRIM_COLORS} value={draft.trim} onPick={(trim) => setDraft({ ...draft, trim })} />
      <Swatches legend="Skin" name="skin" options={SKIN_TONES} value={draft.skin} onPick={(skin) => setDraft({ ...draft, skin })} />
      <div className="row">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
      <hr className="pet-editor__rule" />
      <div className="spread">
        <span className="small muted">Not for you? You can turn it back on at the bottom of Today.</span>
        <Button onClick={onTurnOff}>Turn off Player Pet</Button>
      </div>
    </form>
  );
}

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
        {options.map((o) => (
          <label key={o.value} className="pet-swatch" title={o.label}>
            <input
              type="radio"
              className="visually-hidden"
              name={`pet-${name}`}
              checked={value === o.value}
              onChange={() => onPick(o.value)}
              aria-label={o.label}
            />
            <span style={{ background: o.value }} />
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
