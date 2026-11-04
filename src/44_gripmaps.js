// ============================================================================
//  GELERNTE KURVENFAKTOREN – je Strecke und Epoche: wie viel Querhaftung die KI
//  in jeder Kurve wirklich nutzen kann (aus Testrunden, tools/gripmap-learn.js).
//  Format: GRIP_MAPS['strecke|epoche'] = [[s von, s bis (m), Faktor], ...]
//  Strecken/Epochen ohne Eintrag (z. B. Mods) fahren mit Faktor 1.
// ============================================================================

const GRIP_MAPS = {
  // leer: die Werte gehörten zur reinen Minimalkrümmungs-Linie; für die Mischlinie neu lernen (tools/gripmap-learn.js)
};

/** Faktor je Linienpunkt (weiche Übergänge über 15 m), zwischengespeichert je Linie und Epoche */
function gripMapFor(track, line) {
  const era = typeof ACTIVE_ERA !== 'undefined' ? ACTIVE_ERA : 'e2026';
  const key = track.id + '|' + era, list = (typeof GRIP_MAPS_OVERRIDE !== 'undefined' && GRIP_MAPS_OVERRIDE[key]) || GRIP_MAPS[key];
  if (!list || !list.length) return null;
  line._gm = line._gm || {};
  if (line._gm[key] && line._gm[key].src === list) return line._gm[key].arr;
  const N = track.N, ds = track.ds, L = track.length, arr = new Float32Array(N).fill(1), fade = 15;
  for (const [a, b, f] of list) {
    const len = ((b - a) % L + L) % L;
    for (let q = -fade; q <= len + fade; q += ds) {
      const s = ((a + q) % L + L) % L, j = Math.round(s / ds) % N;
      const w = q < 0 ? 1 + q / fade : q > len ? 1 - (q - len) / fade : 1;
      arr[j] = arr[j] * (1 - w) + f * w;
    }
  }
  line._gm[key] = { src: list, arr };
  return arr;
}
