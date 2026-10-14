import { CIRCUITS } from "@/lib/data/circuits";

/**
 * Hand-authored circuit physical-characteristics baseline — "how much off-
 * road, how tight the corners, how long the straights, how often you're
 * airborne" for each of the 32 Mario Kart Wii circuits, on a 1 (least) to
 * 5 (most) scale. Researched from the well-documented track layouts/
 * community track guides for each circuit (e.g. Dry Dry Ruins' sand floor,
 * Wario's Gold Mine's narrow winding minecart path, Moonview Highway's
 * long open lanes) rather than measured from telemetry.
 *
 * This is the ALWAYS-AVAILABLE baseline Playbook's track-fit scoring uses
 * (see lib/stats/build-stats.ts' scoreBuildForCircuit) — it never silently
 * gets overwritten by real data. Once enough Immersive races have been
 * recorded at a circuit, lib/stats/circuit-profile.ts derives a second,
 * complementary set of numbers straight from recorded telemetry
 * (speed/position samples) and that gets shown ALONGSIDE this table, not
 * blended into it — see that module's doc comment for why.
 */
export interface CircuitDemand {
  circuitId: string;
  /** How much of the track is slow off-road terrain (grass, sand, dirt, mud, snow). 1 = none, 5 = a lot. */
  offRoadAmount: number;
  /** How tight/technical the average corner is. 1 = wide sweeping turns, 5 = narrow hairpins. */
  turnTightness: number;
  /** How much of a lap is spent at full speed on open straights. 1 = almost none, 5 = mostly straights. */
  straightLength: number;
  /** How often the track launches you airborne (ramps, cannons, half-pipes). 1 = rarely/never, 5 = constantly. */
  jumpFrequency: number;
}

export const CIRCUIT_DEMAND: CircuitDemand[] = [
  // --- Nitro cups ---
  { circuitId: "luigi-circuit", offRoadAmount: 1, turnTightness: 2, straightLength: 4, jumpFrequency: 1 },
  { circuitId: "moo-moo-meadows", offRoadAmount: 3, turnTightness: 2, straightLength: 3, jumpFrequency: 1 },
  { circuitId: "mushroom-gorge", offRoadAmount: 2, turnTightness: 3, straightLength: 2, jumpFrequency: 4 },
  { circuitId: "toads-factory", offRoadAmount: 1, turnTightness: 4, straightLength: 2, jumpFrequency: 1 },
  { circuitId: "mario-circuit", offRoadAmount: 2, turnTightness: 2, straightLength: 3, jumpFrequency: 2 },
  { circuitId: "coconut-mall", offRoadAmount: 1, turnTightness: 4, straightLength: 2, jumpFrequency: 1 },
  { circuitId: "dk-summit", offRoadAmount: 3, turnTightness: 3, straightLength: 2, jumpFrequency: 5 },
  { circuitId: "warios-gold-mine", offRoadAmount: 1, turnTightness: 5, straightLength: 1, jumpFrequency: 2 },
  { circuitId: "daisy-circuit", offRoadAmount: 2, turnTightness: 2, straightLength: 3, jumpFrequency: 3 },
  { circuitId: "koopa-cape", offRoadAmount: 2, turnTightness: 3, straightLength: 3, jumpFrequency: 2 },
  { circuitId: "maple-treeway", offRoadAmount: 2, turnTightness: 4, straightLength: 2, jumpFrequency: 2 },
  { circuitId: "grumble-volcano", offRoadAmount: 4, turnTightness: 3, straightLength: 2, jumpFrequency: 2 },
  { circuitId: "dry-dry-ruins", offRoadAmount: 5, turnTightness: 4, straightLength: 2, jumpFrequency: 1 },
  { circuitId: "moonview-highway", offRoadAmount: 1, turnTightness: 2, straightLength: 5, jumpFrequency: 1 },
  { circuitId: "bowsers-castle", offRoadAmount: 2, turnTightness: 4, straightLength: 2, jumpFrequency: 2 },
  { circuitId: "rainbow-road", offRoadAmount: 1, turnTightness: 2, straightLength: 5, jumpFrequency: 1 },
  // --- Retro cups ---
  { circuitId: "gcn-peach-beach", offRoadAmount: 4, turnTightness: 2, straightLength: 3, jumpFrequency: 1 },
  { circuitId: "ds-yoshi-falls", offRoadAmount: 2, turnTightness: 4, straightLength: 1, jumpFrequency: 1 },
  { circuitId: "snes-ghost-valley-2", offRoadAmount: 1, turnTightness: 4, straightLength: 2, jumpFrequency: 1 },
  { circuitId: "n64-mario-raceway", offRoadAmount: 2, turnTightness: 2, straightLength: 3, jumpFrequency: 1 },
  { circuitId: "n64-sherbet-land", offRoadAmount: 3, turnTightness: 3, straightLength: 2, jumpFrequency: 2 },
  { circuitId: "gba-shy-guy-beach", offRoadAmount: 4, turnTightness: 2, straightLength: 3, jumpFrequency: 1 },
  { circuitId: "ds-delfino-square", offRoadAmount: 1, turnTightness: 4, straightLength: 2, jumpFrequency: 1 },
  { circuitId: "gcn-waluigi-stadium", offRoadAmount: 4, turnTightness: 3, straightLength: 2, jumpFrequency: 1 },
  { circuitId: "ds-desert-hills", offRoadAmount: 5, turnTightness: 3, straightLength: 2, jumpFrequency: 1 },
  { circuitId: "gba-bowser-castle-3", offRoadAmount: 2, turnTightness: 4, straightLength: 2, jumpFrequency: 1 },
  { circuitId: "n64-dks-jungle-parkway", offRoadAmount: 2, turnTightness: 2, straightLength: 4, jumpFrequency: 1 },
  { circuitId: "gcn-mario-circuit", offRoadAmount: 2, turnTightness: 2, straightLength: 3, jumpFrequency: 1 },
  { circuitId: "snes-mario-circuit-3", offRoadAmount: 2, turnTightness: 2, straightLength: 3, jumpFrequency: 1 },
  { circuitId: "ds-peach-gardens", offRoadAmount: 2, turnTightness: 4, straightLength: 2, jumpFrequency: 1 },
  { circuitId: "gcn-dk-mountain", offRoadAmount: 4, turnTightness: 4, straightLength: 2, jumpFrequency: 5 },
  { circuitId: "n64-bowsers-castle", offRoadAmount: 2, turnTightness: 4, straightLength: 2, jumpFrequency: 1 },
];

export const CIRCUIT_DEMAND_BY_ID = new Map(CIRCUIT_DEMAND.map((d) => [d.circuitId, d]));

if (process.env.NODE_ENV !== "production") {
  const demandIds = new Set(CIRCUIT_DEMAND.map((d) => d.circuitId));
  const circuitIds = new Set(CIRCUITS.map((c) => c.id));
  for (const id of circuitIds) {
    if (!demandIds.has(id)) throw new Error(`circuit-demand.ts is missing an entry for circuit "${id}"`);
  }
}
