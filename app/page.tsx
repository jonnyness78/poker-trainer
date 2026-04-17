'use client';

import React, { useState, useEffect, useCallback } from 'react';

// --- CONFIG ---

const POSITIONS = ['UTG', 'EP', 'MP', 'CO', 'BTN', 'SB', 'BB'];

const SEAT_POSITIONS = {
  BB:  { left: '50%', top: '85%' },
  UTG: { left: '30%', top: '75%' },
  EP:  { left: '10%', top: '50%' },
  MP:  { left: '30%', top: '25%' },
  CO:  { left: '50%', top: '15%' },
  BTN: { left: '70%', top: '25%' },
  SB:  { left: '80%', top: '70%' }
};

const TIMER_PRESETS = [60, 30, 15, 10];

const ACTIONS = [
  { label: 'Fold', color: 'bg-red-600' },
  { label: 'Call', color: 'bg-blue-600' },
  { label: 'Raise 3x', color: 'bg-green-600' }
];

const STACKS = [25, 40, 100, 200];

// --- HELPERS ---

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPlayerType() {
  const types = [
    { label: "Unknown", weight: 30 },
    { label: "TAG Reg", weight: 20 },
    { label: "LAG Reg", weight: 10 },
    { label: "Trying Rec", weight: 10 },
    { label: "Passive Fish", weight: 15 },
    { label: "Aggro Fish", weight: 10 },
    { label: "Whale", weight: 5 }
  ];

  const total = types.reduce((sum, t) => sum + t.weight, 0);
  let r = Math.random() * total;

  for (let t of types) {
    if (r < t.weight) return t.label;
    r -= t.weight;
  }

  return "Unknown";
}

function generateHand() {
  const RANGE = [
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33',
    'AKs','AQs','AJs','ATs','KQs','KJs','QJs','JTs',
    'AKo','AQo','AJo','ATo','KQo','KJo','QJo',
    'A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'T9s','98s','87s','76s','65s'
  ];

  const hand = RANGE[Math.floor(Math.random() * RANGE.length)];
  const suits = ['♠','♥','♦','♣'];
  const pickSuit = () => suits[Math.floor(Math.random() * suits.length)];

  const r1 = hand[0];
  const r2 = hand[1];

  if (hand.endsWith('s')) {
    const suit = pickSuit();
    return [`${r1}${suit}`, `${r2}${suit}`];
  }

  if (hand.endsWith('o')) {
    let s1 = pickSuit();
    let s2 = pickSuit();
    while (s1 === s2) s2 = pickSuit();
    return [`${r1}${s1}`, `${r2}${s2}`];
  }

  let s1 = pickSuit();
  let s2 = pickSuit();
  while (s1 === s2) s2 = pickSuit();

  return [`${r1}${s1}`, `${r2}${s2}`];
}

function generateTable(heroPos, heroStack) {
  return POSITIONS.map(pos => {
    if (pos === heroPos) return { position: pos, type: "You", stack: heroStack };
    return {
      position: pos,
      type: weightedPlayerType(),
      stack: randomItem(STACKS)
    };
  });
}

// --- SCENARIO ENGINE ---

function generateScenario() {
  const heroStack = randomItem(STACKS);

  let base;
  const r = Math.random();

  if (r < 0.5) {
    base = { type: "open", heroPos: randomItem(["CO","BTN"]) };
  } else if (r < 0.9) {
    base = {
      type: "vs_open",
      heroPos: "BTN",
      openerPos: randomItem(["UTG","EP","MP","CO"])
    };
  } else {
    base = {
      type: "multiway",
      heroPos: "BTN",
      openerPos: "UTG",
      callerPos: "MP"
    };
  }

  const table = generateTable(base.heroPos, heroStack);
  const getPlayer = pos => table.find(p => p.position === pos);

  let history = [];
  let text = "";
  let pot = 1.5;

  if (base.type === "open") {
    text = `Folds to you on ${base.heroPos}`;
  }

  if (base.type === "vs_open") {
    const opener = getPlayer(base.openerPos);

    if (opener.type.includes("Fish") && Math.random() < 0.4) {
      history.push({ pos: base.openerPos, type: 'LIMP', amount: 1 });
      text = `${base.openerPos} (${opener.type}) limps — you're on ${base.heroPos}`;
      pot += 1;
    } else {
      const size = Math.random() < 0.5 ? 2.5 : 3;
      history.push({ pos: base.openerPos, type: 'RAISE', amount: size });
      text = `${base.openerPos} (${opener.type}) raises ${size}BB — you're on ${base.heroPos}`;
      pot += size;
    }
  }

  if (base.type === "multiway") {
    const opener = getPlayer(base.openerPos);
    const caller = getPlayer(base.callerPos);

    history.push({ pos: base.openerPos, type: 'RAISE', amount: 3 });
    history.push({ pos: base.callerPos, type: 'CALL', amount: 3 });

    text = `${base.openerPos} (${opener.type}) raises, ${base.callerPos} (${caller.type}) calls — you're on ${base.heroPos}`;
    pot += 6;
  }

  return {
    heroPos: base.heroPos,
    hand: generateHand(),
    history,
    pot,
    table,
    text
  };
}

// --- MAIN COMPONENT ---

function PokerTrainer() {
  const [scenario, setScenario] = useState(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerMax, setTimerMax] = useState(30);
  const [isPaused, setIsPaused] = useState(false);

  const loadNewHand = useCallback(() => {
    setScenario(generateScenario());
    setTimeLeft(timerMax);
    setIsPaused(false);
  }, [timerMax]);

  useEffect(() => {
    if (isPaused) return;

    if (timeLeft <= 0) {
      loadNewHand();
      return;
    }

    const t = setInterval(() => {
      setTimeLeft(t => t - 1);
    }, 1000);

    return () => clearInterval(t);
  }, [timeLeft, isPaused]);

  useEffect(() => {
    loadNewHand();
  }, []);

  if (!scenario) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8">

      <div className="flex justify-between mb-10">
        <h1 className="text-2xl font-bold text-blue-400">PRE-FLOP VOLUMIZER</h1>
        <div className="flex gap-2">
          {TIMER_PRESETS.map(s => (
            <button key={s}
              onClick={() => setTimerMax(s)}
              className={`px-3 py-1 rounded text-xs ${timerMax === s ? 'bg-blue-500' : 'bg-slate-700'}`}>
              {s}s
            </button>
          ))}
        </div>
      </div>

      <div className="relative max-w-4xl mx-auto h-[500px]">
        <div className="absolute inset-0 bg-emerald-800 border-[12px] border-emerald-950 rounded-[200px]" />

        {POSITIONS.map(pos => {
          const player = scenario.table.find(p => p.position === pos);
          const action = scenario.history.find(h => h.pos === pos);
          const isHero = scenario.heroPos === pos;

          let actionLabel = "";
          let actionStyle = "";

          if (action?.type === "RAISE") {
            actionLabel = `Raise ${action.amount}x`;
            actionStyle = "bg-red-900/70 border-red-400 scale-105";
          }
          if (action?.type === "CALL") {
            actionLabel = "Call";
            actionStyle = "bg-blue-900/70 border-blue-400 scale-105";
          }
          if (action?.type === "LIMP") {
            actionLabel = "Limp";
            actionStyle = "bg-yellow-900/70 border-yellow-400 scale-105";
          }

          return (
            <div key={pos}
              className={`absolute p-3 rounded-lg border-2 w-28 text-center transition-all duration-200
              ${isHero 
                ? 'border-yellow-400 bg-slate-800 scale-110' 
                : action 
                  ? actionStyle 
                  : 'border-emerald-700 bg-emerald-900/50'
              }`}
              style={{
                left: SEAT_POSITIONS[pos].left,
                top: SEAT_POSITIONS[pos].top,
                transform: 'translate(-50%, -50%)'
              }}>

              <div className="text-xs">{pos}</div>
              {!isHero && <div className="text-[10px] opacity-70">{player.type}</div>}
              <div className="text-[11px]">{player.stack}BB</div>
              {isHero && <div className="text-sm mt-1">{scenario.hand.join(' ')}</div>}
              {action && <div className="text-[10px] mt-1">{actionLabel}</div>}
            </div>
          );
        })}

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 text-center">
          <div className="text-sm opacity-60">POT SIZE</div>
          <div className="text-3xl">{scenario.pot} BB</div>
        </div>
      </div>

      <div className="text-center mt-6 text-lg">
        {scenario.text}
      </div>

      {/* TIMER */}
      <div className="max-w-xl mx-auto mt-6">
        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              isPaused ? 'bg-gray-500' : 'bg-blue-400'
            }`}
            style={{ width: `${(timeLeft / timerMax) * 100}%` }}
          />
        </div>

        {/* PAUSE BUTTON */}
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setIsPaused(p => !p)}
            className="bg-yellow-600 px-4 py-2 rounded-lg font-bold"
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto mt-8">
        {ACTIONS.map(a => (
          <button key={a.label}
            onClick={loadNewHand}
            className={`${a.color} py-4 rounded-xl font-bold text-xl`}>
            {a.label}
          </button>
        ))}
      </div>

    </div>
  );
}

export default function Page() {
  return <PokerTrainer />;
}