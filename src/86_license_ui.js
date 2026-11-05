// ============================================================================
//  UI – Lizenzmodus: Lizenzen, Safety Rating, iRating, Serien mit Wochenplan, Rennwertung
// ============================================================================

function licBadge(lvl, sr, big = false) {
  const L = LIC_LEVELS[lvl];
  return h('span', { style: { display: 'inline-block', background: L.color, color: lvl === 2 ? '#111' : '#fff', fontWeight: 900, padding: big ? '6px 12px' : '1px 7px', fontSize: big ? '26px' : '12px', borderRadius: '3px', letterSpacing: '0.5px', fontStyle: 'italic' } },
    sr === undefined ? L.id : `${L.id} ${sr.toFixed(2)}`);
}
function signed(v, d = 0) { const t = (v > 0 ? '+' : '') + (d ? v.toFixed(d) : String(v)); return h('b', { style: { color: v > 0 ? '#2fe36b' : v < 0 ? '#ff5b4a' : '#9aa3ad' } }, t); }

Object.assign(UI, {
  scr_license(opts = {}) {
    const p = Game.license;
    let sum = opts.summary || null;
    if (!sum && p.pending && !Game.licenseRound) { sum = Game.scoreLicenseAbort(); if (sum) this.toast('Letztes Lizenzrennen wurde verlassen – als Ausfall gewertet.', 5000); }
    const back = btn('Zurück', () => this.show('main', { noHistory: true }), 'ghost');
    // Wertung des letzten Rennens
    const result = sum ? h('div.card', { style: { borderLeft: `5px solid ${sum.change === 'up' ? '#2fe36b' : sum.change === 'down' ? '#ff5b4a' : '#ff3b1f'}` } },
      h('h3', `Wertung · ${sum.series} · ${sum.track}`),
      sum.change === 'up' ? h('p', { style: { fontSize: '18px' } }, '🎉 Aufstieg! Neue Lizenz ', licBadge(LIC_LEVELS.findIndex(l => l.id === sum.lic)), ` (${LIC_CATS[sum.cat]})`) : null,
      sum.change === 'down' ? h('p', { style: { fontSize: '18px', color: '#ff5b4a' } }, 'Abstieg auf Lizenz ', licBadge(LIC_LEVELS.findIndex(l => l.id === sum.lic)), ' – zu viele Vorfälle.') : null,
      h('div.row', { style: { gap: '28px', flexWrap: 'wrap' } },
        h('div', h('small', 'Ergebnis'), h('h2.ital', { style: { margin: 0 } }, sum.dq ? 'DQ' : sum.retired ? (sum.aborted ? 'Abbruch' : 'Ausfall') : `P${sum.pos}`), h('small', `von ${sum.n} · SOF ${sum.sof}`)),
        h('div', h('small', `iRating ${LIC_IR_CLASSES[sum.irKey]}`), h('h2.ital', { style: { margin: 0 } }, String(sum.ir)), signed(sum.dIR)),
        h('div', h('small', `Safety Rating ${LIC_CATS[sum.cat]}`), h('h2.ital', { style: { margin: 0 } }, licBadge(LIC_LEVELS.findIndex(l => l.id === sum.lic), sum.sr)), h('div', signed(sum.dSR, 2))),
        h('div', h('small', 'Vorfälle'), h('h2.ital', { style: { margin: 0, color: sum.inc === 0 ? '#2fe36b' : sum.inc > 8 ? '#ff5b4a' : '#fff' } }, `${sum.inc}x`), h('small', `${sum.corners} Kurven`))),
      sum.incList && sum.incList.length ? h('p', { style: { fontSize: '12px', color: '#9aa3ad' } }, sum.incList.map(x => `R${x.lap} ${x.pts}x ${x.kind}`).join(' · ')) : sum.inc === 0 && !sum.retired ? h('p', { style: { color: '#2fe36b' } }, 'Sauberes Rennen – so steigt das Safety Rating.') : null) : null;
    // Lizenzen
    const lic = h('div.row', { style: { gap: '12px', flexWrap: 'wrap' } }, Object.entries(LIC_CATS).map(([k, name]) => {
      const c = p.cats[k], next = LIC_LEVELS[c.lvl + 1];
      return h('div.card', { style: { flex: '1 1 300px' } }, h('h3', `Lizenz ${name}`),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px' } }, licBadge(c.lvl, c.sr, true),
          h('div', { style: { flex: '1' } },
            h('div', { style: { position: 'relative', height: '10px', background: '#1d2430', margin: '4px 0' } },
              h('i', { style: { position: 'absolute', left: 0, top: 0, bottom: 0, width: (c.sr / 5 * 100) + '%', background: LIC_LEVELS[c.lvl].color } }),
              [1, 3, 4].map(m => h('i', { style: { position: 'absolute', top: '-3px', bottom: '-3px', left: (m / 5 * 100) + '%', width: '1px', background: '#9aa3ad' } }))),
            h('small', { style: { color: '#9aa3ad' } }, next ? `Aufstieg zu ${next.id}: SR ≥ 3,00 und ${LIC_MPR} Rennen (${Math.min(c.lvlRaces, LIC_MPR)}/${LIC_MPR}) – oder SR ≥ 4,00 sofort` : 'Höchste Lizenz erreicht'),
            h('br'), h('small', { style: { color: '#9aa3ad' } }, `${c.races} Rennen · Ø ${c.corners ? (c.inc / Math.max(1, c.corners) * 100).toFixed(1) : '0.0'} Vorfälle je 100 Kurven${c.lvl > 0 ? ' · unter SR 1,00 droht der Abstieg' : ''}`))));
    }));
    const irTbl = h('div.card', h('h3', 'iRating je Klasse'),
      h('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap' } }, Object.entries(LIC_IR_CLASSES).map(([k, n]) => h('div', h('small', n), h('div', { style: { fontSize: '20px', fontWeight: 800 } }, String(p.ir[k]))))));
    // Serien
    const series = h('div.row', { style: { gap: '12px', flexWrap: 'wrap' } }, LIC_SERIES.map(s => {
      const W = License.week(p, s), tr = License.trackFor(s, W.week, W.season), era = License.eraFor(s, W.week, W.season), ok = License.allowed(p, s), st = License.sstate(p, s.id);
      const plan = h('div', { style: { display: 'none', fontSize: '12px', marginTop: '6px' } }, License.schedule(p, s).map(x => h('div', { style: { color: x.now ? '#ffd400' : '#9aa3ad' } }, `Woche ${x.week + 1}: ${TRACKS[x.track] ? TRACKS[x.track].name : x.track}${s.cls === 'klassik' ? ' · ' + eraOf(x.era).title : ''}${x.now ? '  ◀ jetzt' : ''}`)));
      return h('div.card', { style: { flex: '1 1 300px', opacity: ok ? 1 : 0.55 } },
        h('h3', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, s.name, h('span', h('small', { style: { color: '#9aa3ad', marginRight: '6px' } }, 'ab'), licBadge(s.min))),
        h('p', { style: { fontSize: '13px', margin: '2px 0 6px', color: '#9aa3ad' } }, s.desc),
        h('p', { style: { margin: '2px 0' } }, h('b', TRACKS[tr] ? TRACKS[tr].name : tr), ` · ${eraOf(era).title}`),
        h('p', { style: { margin: '2px 0', fontSize: '13px' } }, `Saison ${W.season} · Woche ${W.week + 1}/${LIC_WEEKS} · Rennen ${W.raceInWeek + 1}/${LIC_RACES_PER_WEEK} · ${s.laps} Runden${s.quali ? ` · ${s.quali} min Quali` : ' · Start nach iRating'}${s.mandatory ? ' · Pflichtstopp' : ''} · Limit ${s.incLimit}x`),
        st.races ? h('p', { style: { margin: '2px 0', fontSize: '12px', color: '#9aa3ad' } }, `${st.races} Rennen · ${st.wins} Siege · ${st.top5} Top 5 · ${st.pts} Meisterschaftspunkte`) : null,
        h('div.actions', ok ? btn('Rennen beitreten', () => Game.startLicenseRace(s.id), 'primary small', '▶') : h('small', { style: { color: '#ff8a00' } }, `Benötigt ${LIC_LEVELS[s.min].name} (${LIC_CATS[s.cat]})`),
          btn('Wochenplan', () => { plan.style.display = plan.style.display === 'none' ? 'block' : 'none'; }, 'small ghost')), plan);
    }));
    // Verlauf
    const hist = h('table.res', h('tr', h('th', 'Serie'), h('th', 'Strecke'), h('th', 'Pos'), h('th', 'SOF'), h('th', 'Vorf.'), h('th', 'iRating'), h('th', 'SR')));
    for (const r of p.history.slice(0, 15)) hist.append(h('tr', h('td', r.series), h('td', r.track), h('td.num', r.dq ? 'DQ' : r.retired ? 'DNF' : `${r.pos}/${r.n}`), h('td.num', String(r.sof)), h('td.num', `${r.inc}x`),
      h('td.num', `${r.ir} `, signed(r.dIR)), h('td.num', `${r.lic} ${r.sr.toFixed(2)} `, signed(r.dSR, 2))));
    return h('section.screen.solid', { id: 'licenseScreen' },
      h('header', h('span.crumb', 'Lizenzmodus'), h('h1', 'Lizenz & Rating'), h('span', { style: { color: '#7d8898' } }, 'Offline-Rennligen mit Safety Rating und iRating')),
      h('div.scroll', { style: { flex: '1' } },
        result, lic, irTbl,
        h('div.hint', 'Vorfälle: 4 Räder neben der Strecke 1x · Dreher/Kontrollverlust 2x · Mauer 2x · schwerer Kontakt 4x (innerhalb von 2 s zählt nur der schwerste). Sauber fahren hebt das Safety Rating, gute Platzierungen gegen starke Gegner das iRating. Wer ein Rennen verlässt, bekommt einen Ausfall.'),
        h('h2.ital', 'Serien'), series,
        p.history.length ? [h('h2.ital', 'Letzte Rennen'), h('div.card', hist)] : null),
      h('div.actions', back, btn('Profil zurücksetzen', () => this.confirm('Alle Lizenzen, Ratings und den Verlauf zurücksetzen?', () => { Game.resetLicense(); this.show('license', { noHistory: true }); }), 'ghost small')),
    );
  },
});
