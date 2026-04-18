'use client';

import React, { useCallback, useEffect, useState } from 'react';

type Position = 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB';
type PlayerType =
  | 'Unknown'
  | 'TAG Reg'
  | 'LAG Reg'
  | 'Trying Rec'
  | 'Passive Fish'
  | 'Aggro Fish'
  | 'Whale'
  | 'You';
type ScenarioType = 'open' | 'vs_open' | 'limp_iso' | 'multiway' | 'facing_3bet';
type ActionType = 'FOLD' | 'CALL' | 'RAISE' | 'LIMP';

type TablePlayer = {
  position: Position;
  type: PlayerType;
  stack: number;
};

type HistoryAction = {
  pos: Position;
  type: ActionType;
  amount: number;
};

type Scenario = {
  heroPos: Position;
  heroStack: number;
  hand: string[];
  handLabel: string;
  history: HistoryAction[];
  pot: number;
  table: TablePlayer[];
  text: string;
  scenarioType: ScenarioType;
  playersLeft: number;
};

type DecisionRecord = {
  action: string;
  heroPos: Position;
  scenarioType: ScenarioType;
  hand: string;
  timestamp: string;
};

const POSITIONS: Position[] = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
const RAISE_OPTIONS = [2.1, 3, 6];

const SEAT_POSITIONS: Record<Position, React.CSSProperties> = {
  MP: { left: '18.5%', top: '24%' },
  CO: { left: '50%', top: '24%' },
  BTN: { left: '81.5%', top: '24%' },
  UTG: { left: '18.5%', top: '77%' },
  BB: { left: '50%', top: '77%' },
  SB: { left: '81.5%', top: '77%' }
};

const STACKS = [25, 40, 100, 200];
const STORAGE_KEY = 'preflop-trainer-decisions';
const REVIEW_STORAGE_KEY = 'preflop-trainer-review-hands';

const POSITION_INDEX: Record<Position, number> = {
  UTG: 0,
  MP: 1,
  CO: 2,
  BTN: 3,
  SB: 4,
  BB: 5
};

const POSITION_OPEN_RANGES: Record<Exclude<Position, 'BB'>, string[]> = {
  UTG: [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88',
    'AKs', 'AQs', 'AJs', 'ATs', 'KQs', 'KJs', 'QJs', 'JTs',
    'AKo', 'AQo'
  ],
  MP: [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77',
    'AKs', 'AQs', 'AJs', 'ATs', 'A5s', 'KQs', 'KJs', 'QJs', 'JTs', 'T9s',
    'AKo', 'AQo', 'AJo', 'KQo'
  ],
  CO: [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A5s', 'A4s', 'KQs', 'KJs', 'KTs', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s',
    'AKo', 'AQo', 'AJo', 'ATo', 'KQo', 'KJo', 'QJo'
  ],
  BTN: [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'QJs', 'QTs', 'Q9s', 'JTs', 'J9s', 'T9s', '98s', '87s', '76s', '65s', '54s',
    'AKo', 'AQo', 'AJo', 'ATo', 'A9o', 'KQo', 'KJo', 'QJo', 'JTo'
  ],
  SB: [
    'AA', 'KK', 'QQ', 'JJ', 'TT', '99', '88', '77', '66', '55', '44', '33', '22',
    'AKs', 'AQs', 'AJs', 'ATs', 'A9s', 'A8s', 'A7s', 'A6s', 'A5s', 'A4s', 'A3s', 'A2s',
    'KQs', 'KJs', 'KTs', 'K9s', 'QJs', 'QTs', 'JTs', 'T9s', '98s', '87s', '76s', '65s',
    'AKo', 'AQo', 'AJo', 'ATo', 'KQo', 'KJo', 'QJo'
  ]
};

const HERO_RESPONSE_RANGE: Record<Position, string[]> = {
  UTG: POSITION_OPEN_RANGES.UTG,
  MP: POSITION_OPEN_RANGES.MP,
  CO: [...POSITION_OPEN_RANGES.CO, 'A7s', 'KTo'],
  BTN: [...POSITION_OPEN_RANGES.BTN, 'A8o', 'KTo', 'QTo', '97s'],
  SB: [...POSITION_OPEN_RANGES.SB, 'KTo', 'QTo', 'JTo'],
  BB: [...POSITION_OPEN_RANGES.BTN, 'T8s', '97s', '86s', 'A7o', 'KTo', 'QTo']
};

const PLAYER_TYPE_WEIGHTS: Array<{ label: Exclude<PlayerType, 'You'>; weight: number }> = [
  { label: 'Unknown', weight: 30 },
  { label: 'TAG Reg', weight: 20 },
  { label: 'LAG Reg', weight: 10 },
  { label: 'Trying Rec', weight: 10 },
  { label: 'Passive Fish', weight: 15 },
  { label: 'Aggro Fish', weight: 10 },
  { label: 'Whale', weight: 5 }
];

const PLAYER_PROFILES: Record<Exclude<PlayerType, 'You'>, {
  limpChance: number;
  openRangeShift: number;
  flatVsOpen: number;
  raiseSizes: number[];
}> = {
  Unknown: { limpChance: 0.14, openRangeShift: 0, flatVsOpen: 0.18, raiseSizes: [2.5, 3] },
  'TAG Reg': { limpChance: 0.03, openRangeShift: -6, flatVsOpen: 0.12, raiseSizes: [2.2, 2.5] },
  'LAG Reg': { limpChance: 0.06, openRangeShift: 8, flatVsOpen: 0.18, raiseSizes: [2.2, 2.5, 3] },
  'Trying Rec': { limpChance: 0.2, openRangeShift: 4, flatVsOpen: 0.28, raiseSizes: [2.5, 3] },
  'Passive Fish': { limpChance: 0.58, openRangeShift: 10, flatVsOpen: 0.4, raiseSizes: [3] },
  'Aggro Fish': { limpChance: 0.16, openRangeShift: 12, flatVsOpen: 0.22, raiseSizes: [3, 3.5, 4.5] },
  Whale: { limpChance: 0.5, openRangeShift: 18, flatVsOpen: 0.45, raiseSizes: [3, 4, 5] }
};

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick<T>(items: Array<{ item: T; weight: number }>): T {
  const total = items.reduce((sum, current) => sum + current.weight, 0);
  let roll = Math.random() * total;

  for (const current of items) {
    if (roll < current.weight) return current.item;
    roll -= current.weight;
  }

  return items[0].item;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function weightedPlayerType(): Exclude<PlayerType, 'You'> {
  return weightedPick(PLAYER_TYPE_WEIGHTS.map((entry) => ({ item: entry.label, weight: entry.weight })));
}

function getOpenRange(position: Exclude<Position, 'BB'>, playerType: Exclude<PlayerType, 'You'>) {
  const baseRange = POSITION_OPEN_RANGES[position];
  const shift = PLAYER_PROFILES[playerType].openRangeShift;
  const targetSize = clamp(baseRange.length + shift, 8, baseRange.length + 18);
  return baseRange.slice(0, targetSize);
}

function getFacingRange(heroPos: Position, scenarioType: ScenarioType) {
  const base = HERO_RESPONSE_RANGE[heroPos];

  if (scenarioType === 'open') return base;
  if (scenarioType === 'limp_iso') return base.slice(0, clamp(base.length - 10, 12, base.length));
  if (scenarioType === 'multiway') return base.slice(0, clamp(base.length - 16, 10, base.length));
  if (scenarioType === 'facing_3bet') return base.slice(0, clamp(base.length - 22, 8, base.length));
  return base.slice(0, clamp(base.length - 8, 12, base.length));
}

function generateHandFromPool(pool: string[]) {
  const hand = randomItem(pool);
  const suits = ['♠', '♥', '♦', '♣'];
  const pickSuit = () => randomItem(suits);
  const r1 = hand[0];
  const r2 = hand[1];

  if (hand.endsWith('s')) {
    const suit = pickSuit();
    return { label: hand, cards: [`${r1}${suit}`, `${r2}${suit}`] };
  }

  if (hand.endsWith('o')) {
    let s1 = pickSuit();
    let s2 = pickSuit();
    while (s1 === s2) s2 = pickSuit();
    return { label: hand, cards: [`${r1}${s1}`, `${r2}${s2}`] };
  }

  let s1 = pickSuit();
  let s2 = pickSuit();
  while (s1 === s2) s2 = pickSuit();

  return { label: hand, cards: [`${r1}${s1}`, `${r2}${s2}`] };
}

function generateTable(heroPos: Position, heroStack: number) {
  return POSITIONS.map((pos) => {
    if (pos === heroPos) return { position: pos, type: 'You' as const, stack: heroStack };
    return {
      position: pos,
      type: weightedPlayerType(),
      stack: randomItem(STACKS)
    };
  });
}

function getPlayersLeftToAct(heroPos: Position) {
  return POSITIONS.filter((pos) => POSITION_INDEX[pos] > POSITION_INDEX[heroPos]).length;
}

function getPlayer(table: TablePlayer[], pos: Position) {
  return table.find((player) => player.position === pos)!;
}

function getOpenWeight(player: TablePlayer) {
  if (player.type === 'You' || player.position === 'BB') return 0;
  return getOpenRange(player.position, player.type).length;
}

function pickBehaviorDrivenOpener(table: TablePlayer[], heroPos: Position) {
  const candidates = table
    .filter((player) => POSITION_INDEX[player.position] < POSITION_INDEX[heroPos] && player.position !== 'BB')
    .map((player) => ({
      item: player.position,
      weight: Math.max(getOpenWeight(player), 1)
    }));

  return weightedPick(candidates);
}

function pickBehaviorDrivenLimper(table: TablePlayer[], heroPos: Position) {
  const candidates = table
    .filter((player) => POSITION_INDEX[player.position] < POSITION_INDEX[heroPos] && player.position !== 'BB')
    .map((player) => {
      const profile = PLAYER_PROFILES[player.type as Exclude<PlayerType, 'You'>];
      const looseness = getOpenWeight(player) / 8;
      return {
        item: player.position,
        weight: Math.max(profile.limpChance * 100 + looseness, 1)
      };
    });

  return weightedPick(candidates);
}

function createOpenScenario(): Scenario {
  const heroPos = weightedPick<Position>([
    { item: 'CO', weight: 30 },
    { item: 'BTN', weight: 35 },
    { item: 'SB', weight: 18 },
    { item: 'MP', weight: 17 }
  ]);
  const heroStack = randomItem(STACKS);
  const table = generateTable(heroPos, heroStack);
  const handData = generateHandFromPool(getFacingRange(heroPos, 'open'));

  return {
    heroPos,
    heroStack,
    hand: handData.cards,
    handLabel: handData.label,
    history: [],
    pot: 1.5,
    table,
    text: `Folds to you on ${heroPos}. ${getPlayersLeftToAct(heroPos)} player${getPlayersLeftToAct(heroPos) === 1 ? '' : 's'} left behind.`,
    scenarioType: 'open',
    playersLeft: getPlayersLeftToAct(heroPos)
  };
}

function createVsOpenScenario(): Scenario {
  const heroPos = weightedPick<Position>([
    { item: 'BTN', weight: 45 },
    { item: 'CO', weight: 18 },
    { item: 'SB', weight: 17 },
    { item: 'BB', weight: 20 }
  ]);

  const possibleOpeners = POSITIONS.filter(
    (pos) => pos !== 'BB' && POSITION_INDEX[pos] < POSITION_INDEX[heroPos]
  ) as Exclude<Position, 'BB'>[];
  const heroStack = randomItem(STACKS);
  const table = generateTable(heroPos, heroStack);
  const openerPos = possibleOpeners.length === 1 ? possibleOpeners[0] : pickBehaviorDrivenOpener(table, heroPos);
  const opener = getPlayer(table, openerPos);
  const profile = PLAYER_PROFILES[opener.type as Exclude<PlayerType, 'You'>];
  const size = randomItem(profile.raiseSizes);
  const handData = generateHandFromPool(getFacingRange(heroPos, 'vs_open'));

  return {
    heroPos,
    heroStack,
    hand: handData.cards,
    handLabel: handData.label,
    history: [{ pos: openerPos, type: 'RAISE', amount: size }],
    pot: Number((1.5 + size).toFixed(1)),
    table,
    text: `${openerPos} (${opener.type}) opens to ${size}BB. You act on ${heroPos} with ${getPlayersLeftToAct(heroPos)} player${getPlayersLeftToAct(heroPos) === 1 ? '' : 's'} left behind.`,
    scenarioType: 'vs_open',
    playersLeft: getPlayersLeftToAct(heroPos)
  };
}

function createLimpIsoScenario(): Scenario {
  const heroPos = weightedPick<Position>([
    { item: 'CO', weight: 25 },
    { item: 'BTN', weight: 45 },
    { item: 'SB', weight: 10 },
    { item: 'BB', weight: 20 }
  ]);
  const limpers = POSITIONS.filter(
    (pos) => pos !== 'BB' && POSITION_INDEX[pos] < POSITION_INDEX[heroPos]
  ) as Exclude<Position, 'BB'>[];
  const heroStack = randomItem(STACKS);
  const table = generateTable(heroPos, heroStack);
  const limperPos = limpers.length === 1 ? limpers[0] : pickBehaviorDrivenLimper(table, heroPos);
  const limper = getPlayer(table, limperPos);
  const handData = generateHandFromPool(getFacingRange(heroPos, 'limp_iso'));

  return {
    heroPos,
    heroStack,
    hand: handData.cards,
    handLabel: handData.label,
    history: [{ pos: limperPos, type: 'LIMP', amount: 1 }],
    pot: 2.5,
    table,
    text: `${limperPos} (${limper.type}) limps. You can isolate from ${heroPos}.`,
    scenarioType: 'limp_iso',
    playersLeft: getPlayersLeftToAct(heroPos)
  };
}

function createMultiwayScenario(): Scenario {
  const heroPos: Position = 'BTN';
  const openerOptions: Exclude<Position, 'BB'>[] = ['UTG', 'MP', 'CO'];
  const heroStack = randomItem(STACKS);
  const table = generateTable(heroPos, heroStack);
  const behaviorOpener = pickBehaviorDrivenOpener(table, heroPos) as Exclude<Position, 'BB'>;
  const openerPos = openerOptions.includes(behaviorOpener) ? behaviorOpener : randomItem(openerOptions);
  const opener = getPlayer(table, openerPos);
  const openerProfile = PLAYER_PROFILES[opener.type as Exclude<PlayerType, 'You'>];
  const size = randomItem(openerProfile.raiseSizes);

  const callers = POSITIONS.filter(
    (pos) => POSITION_INDEX[pos] > POSITION_INDEX[openerPos] && POSITION_INDEX[pos] < POSITION_INDEX[heroPos]
  ) as Position[];
  const likelyCallers = callers.filter((pos) => {
    const profile = PLAYER_PROFILES[getPlayer(table, pos).type as Exclude<PlayerType, 'You'>];
    return Math.random() < profile.flatVsOpen;
  });
  const callerPos = likelyCallers[0] ?? callers[0];
  const caller = getPlayer(table, callerPos);
  const handData = generateHandFromPool(getFacingRange(heroPos, 'multiway'));

  return {
    heroPos,
    heroStack,
    hand: handData.cards,
    handLabel: handData.label,
    history: [
      { pos: openerPos, type: 'RAISE', amount: size },
      { pos: callerPos, type: 'CALL', amount: size }
    ],
    pot: Number((1.5 + size + size).toFixed(1)),
    table,
    text: `${openerPos} (${opener.type}) opens ${size}BB, ${callerPos} (${caller.type}) flats. You act on BTN.`,
    scenarioType: 'multiway',
    playersLeft: 0
  };
}

function createFacing3BetScenario(): Scenario {
  const heroPos: Position = 'CO';
  const heroStack = randomItem(STACKS);
  const table = generateTable(heroPos, heroStack);
  const button = getPlayer(table, 'BTN');
  const handData = generateHandFromPool(getFacingRange(heroPos, 'facing_3bet'));

  return {
    heroPos,
    heroStack,
    hand: handData.cards,
    handLabel: handData.label,
    history: [
      { pos: heroPos, type: 'RAISE', amount: 3 },
      { pos: 'BTN', type: 'RAISE', amount: 9 }
    ],
    pot: 13.5,
    table,
    text: `You open CO to 3BB, BTN (${button.type}) 3-bets to 9BB, blinds fold. Action back on you.`,
    scenarioType: 'facing_3bet',
    playersLeft: 0
  };
}

function generateScenario(): Scenario {
  const scenarioType = weightedPick<ScenarioType>([
    { item: 'open', weight: 31 },
    { item: 'vs_open', weight: 28 },
    { item: 'limp_iso', weight: 24 },
    { item: 'multiway', weight: 5 },
    { item: 'facing_3bet', weight: 12 }
  ]);

  if (scenarioType === 'open') return createOpenScenario();
  if (scenarioType === 'vs_open') return createVsOpenScenario();
  if (scenarioType === 'limp_iso') return createLimpIsoScenario();
  if (scenarioType === 'facing_3bet') return createFacing3BetScenario();
  return createMultiwayScenario();
}

function readStoredDecisions(): DecisionRecord[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readStoredReviewHands(): Scenario[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(REVIEW_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getScenarioFingerprint(scenario: Scenario) {
  return JSON.stringify({
    heroPos: scenario.heroPos,
    handLabel: scenario.handLabel,
    history: scenario.history,
    pot: scenario.pot,
    text: scenario.text
  });
}

function PokerTrainer() {
  const [scenarioHistory, setScenarioHistory] = useState<Scenario[]>([]);
  const [currentScenarioIndex, setCurrentScenarioIndex] = useState(0);
  const [decisionCount, setDecisionCount] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [reviewHands, setReviewHands] = useState<Scenario[]>([]);
  const scenario = scenarioHistory[currentScenarioIndex] ?? null;

  const loadNewHand = useCallback(() => {
    setScenarioHistory((current) => {
      const next = [...current, generateScenario()].slice(-40);
      setCurrentScenarioIndex(next.length - 1);
      return next;
    });
  }, []);

  const recordDecision = useCallback((actionLabel: string) => {
    if (!scenario || typeof window === 'undefined') return;

    const entry: DecisionRecord = {
      action: actionLabel,
      heroPos: scenario.heroPos,
      scenarioType: scenario.scenarioType,
      hand: scenario.handLabel,
      timestamp: new Date().toISOString()
    };

    const existing = readStoredDecisions();
    const next = [entry, ...existing].slice(0, 500);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setDecisionCount(next.length);
    loadNewHand();
  }, [loadNewHand, scenario]);

  const toggleHandForReview = useCallback((checked: boolean) => {
    if (!scenario || typeof window === 'undefined') return;

    const fingerprint = getScenarioFingerprint(scenario);
    const filtered = reviewHands.filter(
      (savedScenario) => getScenarioFingerprint(savedScenario) !== fingerprint
    );
    const next = checked ? [scenario, ...filtered].slice(0, 100) : filtered;

    window.localStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(next));
    setReviewHands(next);
    setReviewCount(next.length);
  }, [reviewHands, scenario]);

  const goToPreviousHand = useCallback(() => {
    setCurrentScenarioIndex((current) => Math.max(0, current - 1));
  }, []);

  useEffect(() => {
    setDecisionCount(readStoredDecisions().length);
    const storedReviewHands = readStoredReviewHands();
    setReviewHands(storedReviewHands);
    setReviewCount(storedReviewHands.length);
  }, []);

  useEffect(() => {
    loadNewHand();
  }, [loadNewHand]);

  useEffect(() => {
    const nudgeScroll = () => {
      window.scrollTo(0, 1);
    };

    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(nudgeScroll, 120);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  if (!scenario) return null;

  const isSavedForReview = reviewHands.some(
    (savedScenario) => getScenarioFingerprint(savedScenario) === getScenarioFingerprint(scenario)
  );

  return (
    <div className="min-h-[135svh] overflow-y-auto bg-slate-950 px-3 pt-[8svh] pb-3 text-white [webkit-overflow-scrolling:touch]">
      <div className="mx-auto flex w-full max-w-[26.5rem] flex-col gap-3 pb-[max(28svh,8rem)]">
        <div className="relative h-[min(52vh,21rem)] overflow-hidden rounded-[1.7rem] border border-emerald-700/80 bg-[#10684d] shadow-[0_18px_48px_rgba(0,0,0,0.45)]">
          <div className="absolute inset-0 rounded-[1.7rem] border border-emerald-400/15" />

          {POSITIONS.map((pos) => {
            const player = scenario.table.find((entry) => entry.position === pos)!;
            const action = scenario.history.find((entry) => entry.pos === pos);
            const isHero = scenario.heroPos === pos;

            let actionLabel = '';
            let actionStyle = '';

            if (action?.type === 'RAISE') {
              actionLabel = `Raise ${action.amount}x`;
              actionStyle = 'scale-105 border-red-400 bg-red-900/70';
            }

            if (action?.type === 'CALL') {
              actionLabel = 'Call';
              actionStyle = 'scale-105 border-blue-400 bg-blue-900/70';
            }

            if (action?.type === 'LIMP') {
              actionLabel = 'Limp';
              actionStyle = 'scale-105 border-yellow-400 bg-yellow-900/70';
            }

            return (
              <div
                key={pos}
                className={`absolute w-[7.2rem] rounded-[1.35rem] border px-2 py-3 text-center shadow-sm transition-all duration-200 ${
                  isHero
                    ? 'scale-105 border-yellow-300 bg-slate-800/95'
                    : action
                      ? actionStyle
                      : 'border-white/25 bg-emerald-950/12'
                }`}
                style={{
                  ...SEAT_POSITIONS[pos],
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div className="text-[17px] font-semibold tracking-[0.06em]">{pos}</div>
                {!isHero && <div className="mt-1 text-[15px] leading-tight opacity-90">{player.type}</div>}
                <div className="mt-1 text-[15px] font-medium">{player.stack}BB</div>
                {isHero && <div className="mt-2 text-[1.05rem] font-bold">{scenario.hand.join(' ')}</div>}
                {action && <div className="mt-1.5 text-[15px] font-semibold">{actionLabel}</div>}
              </div>
            );
          })}

          <div className="absolute left-1/2 top-1/2 w-24 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="text-[1.05rem] font-bold leading-none text-white">{scenario.pot}BB</div>
          </div>
        </div>

        <div className="text-center text-[1rem] leading-snug text-slate-100">{scenario.text}</div>

        <div className="flex justify-center gap-3 text-[15px] uppercase tracking-[0.08em] text-slate-500">
          <span>{scenario.scenarioType.replaceAll('_', ' ')}</span>
          <span>{scenario.heroPos}</span>
          <span>{scenario.handLabel}</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={goToPreviousHand}
            disabled={currentScenarioIndex === 0}
            className="rounded-2xl border border-slate-700 bg-slate-900/80 py-3 text-[15px] font-bold text-white disabled:opacity-40"
          >
            Previous Hand
          </button>
          <label className="flex items-center justify-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/80 px-3 py-3 text-[15px] font-bold text-white">
            <input
              type="checkbox"
              checked={isSavedForReview}
              onChange={(event) => toggleHandForReview(event.target.checked)}
              className="h-5 w-5 rounded border-slate-500 bg-slate-950 accent-emerald-500"
            />
            <span>Save For Review</span>
          </label>
        </div>

        <div className="flex justify-center gap-4 text-[15px] font-semibold text-slate-400">
          <span>{decisionCount} decisions</span>
          <span>{reviewCount} for review</span>
        </div>

        <div className="grid grid-cols-2 gap-3 pb-[max(env(safe-area-inset-bottom),0px)]">
          <button
            onClick={() => recordDecision('Fold')}
            className="rounded-2xl bg-red-600 py-3.5 text-lg font-bold text-white"
          >
            Fold
          </button>
          <button
            onClick={() => recordDecision('Call')}
            className="rounded-2xl bg-blue-600 py-3.5 text-lg font-bold text-white"
          >
            Call
          </button>
          {RAISE_OPTIONS.map((size) => (
            <button
              key={size}
              onClick={() => recordDecision(`Raise ${size}x`)}
              className={`rounded-2xl py-3.5 text-lg font-bold text-white ${
                size === 6 ? 'col-span-2 bg-emerald-700' : 'bg-green-600'
              }`}
            >
              Raise {size}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return <PokerTrainer />;
}
