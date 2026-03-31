/**
 * MarkerRegistry — static definitions for all 24 AR markers and their pattern loading.
 *
 * Marker data ported from etc/data/acmarkerdata.dat.
 * Physical widths in mm must match the original exactly — ARToolKit uses them
 * to compute the marker-to-camera transform scale.
 */

/** Category of a marker: interactive object or element card */
export type MarkerCategory = 'control' | 'cube' | 'element';

/** Static definition of one AR marker (unchanging after init) */
export interface MarkerDef {
  /** Logical name used throughout the app, e.g. 'platform', 'element_C', 'cubeM_1' */
  name: string;
  /** URL path for the .patt file, relative to the web root */
  patternFile: string;
  /** Physical marker width in millimetres — used by ARToolKit for pose estimation */
  width: number;
  category: MarkerCategory;
}

/**
 * All 24 markers, in the order they appear in acmarkerdata.dat.
 * The 25th file (dummy.patt) is not used.
 */
export const MARKER_DEFS: readonly MarkerDef[] = [
  // ── Control / state markers ──────────────────────────────────────────────
  { name: 'transport',     patternFile: 'patterns/transport.patt',     width: 62.0, category: 'control' },
  { name: 'browser',       patternFile: 'patterns/browser.patt',       width: 66.0, category: 'control' },
  { name: 'labeling',      patternFile: 'patterns/labeling.patt',      width: 66.0, category: 'control' },
  { name: 'el_negativity', patternFile: 'patterns/el_negativity.patt', width: 66.0, category: 'control' },
  { name: 'empty',         patternFile: 'patterns/empty.patt',         width: 66.0, category: 'control' },
  { name: 'benzene',       patternFile: 'patterns/benzene.patt',       width: 66.0, category: 'control' },
  { name: 'platform',      patternFile: 'patterns/platform.patt',      width: 81.0, category: 'control' },

  // ── Cube face markers (6 faces) ──────────────────────────────────────────
  { name: 'cubeM_1', patternFile: 'patterns/cubeM_1.patt', width: 60.0, category: 'cube' },
  { name: 'cubeM_2', patternFile: 'patterns/cubeM_2.patt', width: 60.0, category: 'cube' },
  { name: 'cubeM_3', patternFile: 'patterns/cubeM_3.patt', width: 60.0, category: 'cube' },
  { name: 'cubeM_4', patternFile: 'patterns/cubeM_4.patt', width: 60.0, category: 'cube' },
  { name: 'cubeM_5', patternFile: 'patterns/cubeM_5.patt', width: 60.0, category: 'cube' },
  { name: 'cubeM_6', patternFile: 'patterns/cubeM_6.patt', width: 60.0, category: 'cube' },

  // ── Element markers (11 chemical elements) ───────────────────────────────
  { name: 'element_C',  patternFile: 'patterns/element_C.patt',  width: 76.0, category: 'element' },
  { name: 'element_H',  patternFile: 'patterns/element_H.patt',  width: 76.0, category: 'element' },
  { name: 'element_O',  patternFile: 'patterns/element_O.patt',  width: 76.0, category: 'element' },
  { name: 'element_N',  patternFile: 'patterns/element_N.patt',  width: 76.0, category: 'element' },
  { name: 'element_Br', patternFile: 'patterns/element_Br.patt', width: 76.0, category: 'element' },
  { name: 'element_Cl', patternFile: 'patterns/element_Cl.patt', width: 76.0, category: 'element' },
  { name: 'element_F',  patternFile: 'patterns/element_F.patt',  width: 76.0, category: 'element' },
  { name: 'element_K',  patternFile: 'patterns/element_K.patt',  width: 76.0, category: 'element' },
  { name: 'element_Li', patternFile: 'patterns/element_Li.patt', width: 76.0, category: 'element' },
  { name: 'element_Mg', patternFile: 'patterns/element_Mg.patt', width: 76.0, category: 'element' },
  { name: 'element_Na', patternFile: 'patterns/element_Na.patt', width: 76.0, category: 'element' },
] as const;

/**
 * Interface for an ARController subset used by MarkerRegistry.
 * Allows unit testing without a real ARController.
 */
export interface ARControllerLike {
  loadMarker(urlOrData: string): Promise<number>;
}

/**
 * MarkerRegistry loads all 24 pattern files into an ARController and maintains
 * a bidirectional name ↔ runtimeId map for the rest of the app.
 *
 * Usage:
 *   const registry = new MarkerRegistry();
 *   await registry.loadAll(arController);
 *   const id = registry.getRuntimeId('platform'); // → number assigned by ARToolKit
 */
export class MarkerRegistry {
  private nameToId = new Map<string, number>();
  private idToName = new Map<number, string>();

  /**
   * Load all 24 pattern files into the ARController.
   * Each loadMarker() call returns the runtime ID assigned by ARToolKit;
   * we store those IDs for the detection loop.
   */
  async loadAll(controller: ARControllerLike): Promise<void> {
    const promises = MARKER_DEFS.map(async (def) => {
      const id = await controller.loadMarker('/' + def.patternFile);
      this.nameToId.set(def.name, id);
      this.idToName.set(id, def.name);
    });
    await Promise.all(promises);
  }

  /** Returns the ARToolKit runtime ID for a marker name, or undefined if not loaded. */
  getRuntimeId(name: string): number | undefined {
    return this.nameToId.get(name);
  }

  /** Returns the marker name for an ARToolKit runtime ID, or undefined if unknown. */
  getName(runtimeId: number): string | undefined {
    return this.idToName.get(runtimeId);
  }

  /** Returns the full MarkerDef for a name, or undefined if not found. */
  getDef(name: string): MarkerDef | undefined {
    return MARKER_DEFS.find((d) => d.name === name);
  }

  /** True if all 24 patterns have been loaded. */
  get isLoaded(): boolean {
    return this.nameToId.size === MARKER_DEFS.length;
  }
}
