import { type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";

const WORD_LENGTH = 5;
const MAX_GUESSES = 5;
const KEY_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

const ANSWERS = [
  "WRONG",
  "OIL",
  "TARRIFS"
];

type ShipStop = {
  angle: number;
  x: number;
  y: number;
};

const SHIP_START: ShipStop = { x: 142, y: 292, angle: -30 };
const FIXED_FINAL_STOPS: ShipStop[] = [
  { x: 356, y: 164, angle: -18 },
  { x: 466, y: 124, angle: -8 },
  { x: 544, y: 212, angle: 12 },
];

type LetterState = "empty" | "absent" | "present" | "correct";
type GameStatus = "playing" | "won" | "lost";

type ScoredLetter = {
  letter: string;
  state: LetterState;
};

function makeEmptyTiles(length = WORD_LENGTH): ScoredLetter[] {
  return Array.from({ length }, () => ({
    letter: "",
    state: "empty" as const,
  }));
}

function getRandomAnswer() {
  return ANSWERS[Math.floor(Math.random() * ANSWERS.length)];
}

function scoreGuess(guess: string, answer: string): LetterState[] {
  const score: LetterState[] = Array(answer.length).fill("absent");
  const remaining: Record<string, number> = {};

  for (let index = 0; index < answer.length; index += 1) {
    const guessLetter = guess[index];
    const answerLetter = answer[index];

    if (guessLetter === answerLetter) {
      score[index] = "correct";
    } else {
      remaining[answerLetter] = (remaining[answerLetter] ?? 0) + 1;
    }
  }

  for (let index = 0; index < answer.length; index += 1) {
    const guessLetter = guess[index];

    if (score[index] === "correct") {
      continue;
    }

    if (remaining[guessLetter] > 0) {
      score[index] = "present";
      remaining[guessLetter] -= 1;
    }
  }

  return score;
}

function getKeyStates(guesses: ScoredLetter[][]) {
  const rank: Record<LetterState, number> = {
    empty: 0,
    absent: 1,
    present: 2,
    correct: 3,
  };
  const states: Record<string, LetterState> = {};

  for (const row of guesses) {
    for (const tile of row) {
      const currentState = states[tile.letter] ?? "empty";

      if (rank[tile.state] > rank[currentState]) {
        states[tile.letter] = tile.state;
      }
    }
  }

  return states;
}

function getDisplayTiles(
  guesses: ScoredLetter[][],
  currentGuess: string,
  answer: string,
): ScoredLetter[] {
  const correctLetters = getLockedCorrectLetters(guesses, answer.length);
  let typedIndex = 0;

  if (currentGuess) {
    return Array.from({ length: answer.length }, (_, index) => {
      if (correctLetters[index]) {
        return correctLetters[index];
      }

      const letter = currentGuess[typedIndex] ?? "";
      typedIndex += 1;

      return {
        letter,
        state: "empty" as const,
      };
    });
  }

  const lastGuess = guesses[guesses.length - 1] ?? makeEmptyTiles(answer.length);

  return Array.from({ length: answer.length }, (_, index) =>
    correctLetters[index] ?? lastGuess[index] ?? {
      letter: "",
      state: "empty" as const,
    },
  );
}

function getCorrectSlots(guesses: ScoredLetter[][], answerLength: number) {
  return Array.from({ length: answerLength }, (_, index) =>
    guesses.some((guess) => guess[index]?.state === "correct"),
  );
}

function getLockedCorrectLetters(guesses: ScoredLetter[][], answerLength: number) {
  return Array.from({ length: answerLength }, (_, index) => {
    const correctGuess = guesses.find((guess) => guess[index]?.state === "correct");
    return correctGuess?.[index] ?? null;
  });
}

function mergeGuessWithLockedLetters(
  guess: string,
  lockedLetters: Array<ScoredLetter | null>,
) {
  let guessIndex = 0;

  return lockedLetters
    .map((tile) => {
      if (tile) {
        return tile.letter;
      }

      const letter = guess[guessIndex] ?? "";
      guessIndex += 1;
      return letter;
    })
    .join("");
}

function interpolateShipStop(from: ShipStop, to: ShipStop, ratio: number): ShipStop {
  return {
    angle: from.angle + (to.angle - from.angle) * ratio,
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
  };
}

function getDynamicShipPath(answerLength: number) {
  const totalStops = answerLength + 1;
  const fixedStops = FIXED_FINAL_STOPS.slice(-Math.min(FIXED_FINAL_STOPS.length, totalStops));
  const flexibleCount = totalStops - fixedStops.length;

  if (flexibleCount <= 0) {
    return fixedStops;
  }

  const firstFixedStop = fixedStops[0];
  const flexibleStops = Array.from({ length: flexibleCount }, (_, index) => {
    const ratio = flexibleCount === 1 ? 0 : index / flexibleCount;
    return interpolateShipStop(SHIP_START, firstFixedStop, ratio);
  });

  return [...flexibleStops, ...fixedStops];
}

function getTrailSegment(from: ShipStop, to: ShipStop) {
  const controlOneX = from.x + (to.x - from.x) * 0.42;
  const controlOneY = from.y + (to.y - from.y) * 0.2;
  const controlTwoX = from.x + (to.x - from.x) * 0.72;
  const controlTwoY = from.y + (to.y - from.y) * 0.82;

  return `M${from.x} ${from.y}C${controlOneX} ${controlOneY} ${controlTwoX} ${controlTwoY} ${to.x} ${to.y}`;
}

function HormuzMap({
  answerLength,
  correctSlots,
  guessesLeft,
  status,
}: {
  answerLength: number;
  correctSlots: boolean[];
  guessesLeft: number;
  status: GameStatus;
}) {
  const targetProgress = status === "won"
    ? answerLength
    : correctSlots.filter(Boolean).length;
  const [displayedProgress, setDisplayedProgress] = useState(targetProgress);
  const shipPath = useMemo(() => getDynamicShipPath(answerLength), [answerLength]);
  const progress = Math.min(displayedProgress, shipPath.length - 1);
  const ship = shipPath[progress];
  const isMoving = progress > 0 && status !== "lost";
  const rocketIsArmed = status === "playing" && guessesLeft === 1;
  const rocketIsLaunching = status === "lost";
  const rocketStyle = {
    "--rocket-end-x": `${ship.x}px`,
    "--rocket-end-y": `${ship.y}px`,
  } as CSSProperties;

  useEffect(() => {
    if (targetProgress < displayedProgress) {
      setDisplayedProgress(targetProgress);
      return;
    }

    if (targetProgress === displayedProgress) {
      return;
    }

    const movementTimer = window.setTimeout(() => {
      setDisplayedProgress((currentProgress) =>
        Math.min(currentProgress + 1, targetProgress),
      );
    }, 520);

    return () => window.clearTimeout(movementTimer);
  }, [displayedProgress, targetProgress]);

  return (
    <div
      className={`hormuz-map ${status}`}
      role="img"
      aria-label="Map of the Strait of Hormuz"
    >
      <img src={`${import.meta.env.BASE_URL}hormuz-map.png`} alt="" aria-hidden="true" />
      <svg className="map-overlay" viewBox="0 0 768 420" aria-hidden="true">
        {status === "won" && (
          <g transform="translate(468 54)">
            <g className="toll-arrow">
              <rect className="toll-arrow-sign" x="-35" y="-26" width="70" height="52" rx="8" />
              <path className="toll-arrow-shaft" d="M-20 0H12" />
              <path className="toll-arrow-head" d="M6 -14L24 0L6 14Z" />
            </g>
          </g>
        )}
        {(rocketIsArmed || rocketIsLaunching) && (
          <g
            className={`rocket ${rocketIsLaunching ? "launching" : "armed"}`}
            style={rocketStyle}
          >
            <text x="0" y="0">
              🚀
            </text>
          </g>
        )}
        {shipPath.slice(0, -1).map((stop, index) => (
          <path
            className={`ship-trail ${
              index < progress ? "visible" : ""
            } ${status === "lost" ? "blocked" : ""}`}
            d={getTrailSegment(stop, shipPath[index + 1])}
            key={`trail-${index}`}
          />
        ))}
        <g
          className={`ship ${status} ${isMoving ? "beeping" : ""}`}
          transform={`translate(${ship.x} ${ship.y}) rotate(${ship.angle})`}
        >
          <circle className="radar-ring" cx="0" cy="0" r="28" />
          <path className="ship-wake" d="M-26 10C-17 15 -8 15 2 10" />
          <path className="ship-body" d="M-24 -10L24 0L-24 10L-14 0Z" />
          <path className="ship-cabin" d="M-9 -5L5 0L-9 5Z" />
          {status === "lost" && (
            <g className="ship-explosion">
              <circle className="blast core" cx="0" cy="0" r="18" />
              <circle className="blast glow" cx="0" cy="0" r="34" />
              <path className="blast-flame" d="M0 -46L12 -14L44 -22L20 4L42 30L8 18L-10 48L-14 16L-46 24L-22 0L-40 -28L-10 -14Z" />
              <circle className="smoke smoke-one" cx="-28" cy="-16" r="12" />
              <circle className="smoke smoke-two" cx="26" cy="-22" r="14" />
              <circle className="smoke smoke-three" cx="18" cy="26" r="11" />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}

export default function App() {
  const [answer, setAnswer] = useState(getRandomAnswer);
  const [currentGuess, setCurrentGuess] = useState("");
  const [guesses, setGuesses] = useState<ScoredLetter[][]>([]);
  const [status, setStatus] = useState<GameStatus>("playing");
  const [message, setMessage] = useState("Clear the Strait of Hormuz.");

  const displayTiles = useMemo(
    () => getDisplayTiles(guesses, currentGuess, answer),
    [answer, guesses, currentGuess],
  );
  const keyStates = useMemo(() => getKeyStates(guesses), [guesses]);
  const correctSlots = useMemo(
    () => getCorrectSlots(guesses, answer.length),
    [answer, guesses],
  );
  const lockedLetters = useMemo(
    () => getLockedCorrectLetters(guesses, answer.length),
    [answer, guesses],
  );
  const guessStripStyle = {
    "--answer-length": answer.length,
    "--tile-gap-count": Math.max(answer.length - 1, 0),
  } as CSSProperties;
  const openSlots = lockedLetters.filter((tile) => tile === null).length;
  const guessesLeft = MAX_GUESSES - guesses.length;

  const resetGame = useCallback(() => {
    setAnswer(getRandomAnswer());
    setCurrentGuess("");
    setGuesses([]);
    setStatus("playing");
    setMessage("Clear the Strait of Hormuz.");
  }, []);

  const submitGuess = useCallback(() => {
    if (status !== "playing") {
      return;
    }

    if (currentGuess.length < openSlots) {
      setMessage("Not enough letters.");
      return;
    }

    const fullGuess = mergeGuessWithLockedLetters(currentGuess, lockedLetters);
    const score = scoreGuess(fullGuess, answer);
    const scoredGuess = fullGuess.split("").map((letter, index) => ({
      letter,
      state: score[index],
    }));
    const nextGuesses = [...guesses, scoredGuess];

    setGuesses(nextGuesses);
    setCurrentGuess("");

    if (fullGuess === answer) {
      setStatus("won");
      setMessage("You passed through Hormuz.");
      return;
    }

    if (nextGuesses.length === MAX_GUESSES) {
      setStatus("lost");
      setMessage(`Passage blocked. The word was ${answer}.`);
      return;
    }

    setMessage("Keep steering.");
  }, [answer, currentGuess, guesses, lockedLetters, openSlots, status]);

  const handleInput = useCallback(
    (key: string) => {
      if (key === "ENTER") {
        submitGuess();
        return;
      }

      if (key === "BACKSPACE") {
        if (status === "playing") {
          setCurrentGuess((guess) => guess.slice(0, -1));
        }
        return;
      }

      if (/^[A-Z]$/.test(key) && status === "playing") {
        setCurrentGuess((guess) =>
          guess.length < openSlots ? `${guess}${key}` : guess,
        );
      }
    },
    [openSlots, status, submitGuess],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        handleInput("ENTER");
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        handleInput("BACKSPACE");
        return;
      }

      const key = event.key.toUpperCase();

      if (/^[A-Z]$/.test(key)) {
        handleInput(key);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleInput]);

  return (
    <main className="app">
      <section className="game" aria-label="Free the Tanker game">
        <header className="game-header">
          <div>
            <h1>Free the Tanker</h1>
          </div>
          <button className="reset-button" type="button" onClick={resetGame}>
            New game
          </button>
        </header>

        <section className="hormuz-card" aria-label="Hormuz passage">
          <HormuzMap
            answerLength={answer.length}
            correctSlots={correctSlots}
            guessesLeft={guessesLeft}
            status={status}
          />

          <p className={`message ${status}`}>{message}</p>
          <p className="guess-counter">
            You have {guessesLeft} {guessesLeft === 1 ? "guess" : "guesses"} left out of{" "}
            {MAX_GUESSES}.
          </p>

          <div
            className="guess-strip"
            style={guessStripStyle}
            aria-label="Current guess"
          >
            {displayTiles.map((tile, tileIndex) => (
              <div
                className={`tile ${tile.state} ${tile.letter ? "filled" : ""}`}
                key={`tile-${tileIndex}`}
              >
                {tile.letter}
              </div>
            ))}
          </div>
        </section>

        <div className="keyboard" aria-label="Keyboard">
          {KEY_ROWS.map((row, rowIndex) => (
            <div className="keyboard-row" key={row}>
              {rowIndex === 2 && (
                <button
                  className="key action-key"
                  type="button"
                  onClick={() => handleInput("ENTER")}
                >
                  Enter
                </button>
              )}
              {row.split("").map((letter) => (
                <button
                  className={`key ${keyStates[letter] ?? ""}`}
                  key={letter}
                  type="button"
                  onClick={() => handleInput(letter)}
                >
                  {letter}
                </button>
              ))}
              {rowIndex === 2 && (
                <button
                  className="key action-key"
                  type="button"
                  onClick={() => handleInput("BACKSPACE")}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
