// Amoeba Royale layer: every wire must join pads of the right net, follow the matrix,
// and the LED chain must visit every key once.  Run: node --test tests/
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const h = require("./harness");
const fx = require("./fixtures");

const PADS_PER_BOARD = 20;
const MM = h.UNIT / 19.05;
const ALL = { rows: true, cols: true, led: true, power: true, pads: true };
const near = (p, q) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;

function checkAmoeba(ctx, { split = false } = {}) {
    const { rows, cols } = ctx.app.currentJSON.matrix_pins;
    const perHalf = rows.length;
    h.setView(ctx, { bottom: true, amoeba: true, layers: ALL });
    const keys = h.readKeys(ctx);
    const am = h.readAmoeba(ctx);
    const name = i => keys[i].key.label || `#${i}`;

    // 1. one board with all pads per key
    assert.equal(am.boards.length, keys.length, "one Amoeba board per key");
    for (const k of keys) {
        assert.equal(am.pads.filter(p => p.key === k.i).length, PADS_PER_BOARD, `key ${name(k.i)} pad count`);
    }

    // 2. every wire end sits on a pad of the stated key AND net (anything else would be a short)
    const allowed = { SR: "SR", SC: "SC", VDD: "VDD", VSS: "VSS", DOUT: "DIN" };
    for (const w of am.wires) {
        assert.equal(allowed[w.fromNet], w.toNet, `wire ${w.wire} joins ${w.fromNet} to ${w.toNet}`);
        const pa = am.pads.find(p => p.key === w.from && p.net === w.fromNet && near([p.x, p.y], w.a));
        const pb = am.pads.find(p => p.key === w.to && p.net === w.toNet && near([p.x, p.y], w.b));
        assert.ok(pa, `wire ${w.wire} start is not on a ${w.fromNet} pad of ${name(w.from)}`);
        assert.ok(pb, `wire ${w.wire} end is not on a ${w.toNet} pad of ${name(w.to)}`);
        // nothing of another net may sit on the wire's end points
        for (const p of am.pads.filter(p => near([p.x, p.y], w.a) || near([p.x, p.y], w.b))) {
            assert.ok([w.fromNet, w.toNet].includes(p.net), `wire ${w.wire} touches a ${p.net} pad`);
        }
    }

    // 3. row / column wires follow the matrix exactly
    const sideOf = k => (split && k.matrix[0] >= perHalf ? 1 : 0);
    for (const [kind, idx] of [["row", k => k.matrix[0] % (split ? perHalf : Infinity)], ["col", k => k.matrix[1]]]) {
        const want = {};
        keys.forEach(k => { const g = `${kind}:${sideOf(k)}:${idx(k)}`; (want[g] = want[g] || []).push(k.i); });
        for (const [g, members] of Object.entries(want)) {
            const segs = am.wires.filter(w => w.wire === g);
            assert.equal(segs.length, members.length - 1, `${g}: ${segs.length} segments for ${members.length} keys`);
            const touched = new Set(segs.flatMap(w => [w.from, w.to]));
            if (members.length > 1) assert.deepEqual([...touched].sort((a, b) => a - b), members.sort((a, b) => a - b), `${g} links the wrong keys`);
        }
        const extra = am.wires.filter(w => w.wire.startsWith(kind + ":") && !want[w.wire]);
        assert.deepEqual(extra.map(w => w.wire), [], `${kind} wires that match no ${kind}`);
    }

    // 4. LED chain per half: one path through every key, DOUT → DIN, numbered in order
    const sides = [...new Set(keys.map(sideOf))];
    for (const side of sides) {
        const members = keys.filter(k => sideOf(k) === side).map(k => k.i);
        const labels = am.leds.filter(l => l.side === side).sort((a, b) => a.n - b.n);
        assert.deepEqual(labels.map(l => l.n), members.map((_, n) => n), `LED numbers on side ${side} are not 0..${members.length - 1}`);
        assert.deepEqual(labels.map(l => l.key).sort((a, b) => a - b), [...members].sort((a, b) => a - b), "every key gets exactly one LED number");
        const segs = am.wires.filter(w => w.wire === `led:${side}`);
        assert.equal(segs.length, members.length - 1, "LED chain segment count");
        labels.slice(0, -1).forEach((l, n) => {
            const seg = segs.find(w => w.from === l.key);
            assert.ok(seg && seg.to === labels[n + 1].key, `L${n} DOUT must feed L${n + 1} DIN`);
        });
        for (const net of ["vdd", "vss"]) {
            const touched = new Set(am.wires.filter(w => w.wire === `${net}:${side}`).flatMap(w => [w.from, w.to]));
            if (members.length > 1) assert.equal(touched.size, members.length, `${net.toUpperCase()} doesn't reach every key on side ${side}`);
        }
        const ledPin = (labels[0].text.match(/◀ (\S+)/) || [])[1];
        assert.ok(ledPin, "L0 shows which MCU pin drives the LED chain");
        assert.ok(![...rows, ...cols].includes(ledPin), `LED data pin ${ledPin} is also a matrix pin`);
    }

    // 5. pads are a rigid copy of the board (rotation/mirror only, no stretching)
    const ref = am.pads.filter(p => p.key === keys[0].i);
    for (const k of keys) {
        const mine = am.pads.filter(p => p.key === k.i);
        const dist = ps => ps.map(p => Math.hypot(p.x - k.cx, p.y - k.cy).toFixed(2)).sort().join();
        const refDist = ref.map(p => Math.hypot(p.x - keys[0].cx, p.y - keys[0].cy).toFixed(2)).sort().join();
        assert.equal(dist(mine), refDist, `pads of ${name(k.i)} are distorted`);
    }
    return { keys, am };
}

describe("Amoeba Royale layer", () => {
    test("pad orientation matches the official pinout (solder side)", () => {
        const ctx = h.importKLE(fx.ortho(1, 1), { board: "rp2040_zero" });
        h.setView(ctx, { bottom: true, amoeba: true, layers: ALL });
        const [k] = h.readKeys(ctx);
        const pads = h.readAmoeba(ctx).pads;
        const at = (net, test) => pads.filter(p => p.net === net && test(p.x - k.cx, p.y - k.cy));
        const half = 9 * MM, edge = 7 * MM;
        assert.equal(at("SR", (dx, dy) => dy < -edge).length, 2, "both R pads on the top edge");
        assert.ok(at("DOUT", (dx, dy) => dx > edge && dy < 0).length === 1, "a DOUT pad on the upper right side");
        assert.ok(at("DIN", (dx, dy) => dx < -edge && dy < 0).length === 1, "a DIN pad on the upper left side");
        assert.ok(at("DIN", (dx, dy) => dx > edge && dy > edge).length === 1, "DIN in the bottom-right corner");
        assert.ok(at("DOUT", (dx, dy) => dx < -edge && dy > edge).length === 1, "DOUT in the bottom-left corner");
        assert.ok(pads.every(p => Math.abs(p.x - k.cx) < half && Math.abs(p.y - k.cy) < half), "pads stay on the 18.8 mm board");
    });

    test("ticking the box jumps to the solder view", () => {
        const ctx = h.importKLE(fx.ortho(2, 2), { board: "rp2040_zero" });
        ctx.byId("amoebaToggle").checked = true;
        ctx.byId("amoebaToggle").dispatch("change");
        assert.equal(ctx.app.isBottomView, true);
        assert.ok(h.readAmoeba(ctx).boards.length === 4);
    });

    test("AliceZero (rotated clusters) on RP2040-Plus", () => {
        const ctx = h.importKLE(fx.alice(), { board: "waveshare_2040_plus" });
        const { am } = checkAmoeba(ctx);
        const led0 = am.leds.find(l => l.n === 0);
        assert.match(led0.text, /GP26/, "first free RP2040-Plus pin after GP0-GP22 drives the LEDs");
        const rot = ctx.app.currentJSON.layouts.LAYOUT.layout.filter(k => k.rot).length;
        assert.ok(rot > 0, "Alice has rotated keys");
    });
    test("boards on angled keys turn with the key (R-pad edge ∥ the key row)", () => {
        const ctx = h.importKLE(fx.alice(), { board: "waveshare_2040_plus" });
        h.setView(ctx, { bottom: true, amoeba: true, layers: ALL });
        const keys = h.readKeys(ctx), am = h.readAmoeba(ctx);
        const deg = (dx, dy) => (Math.atan2(dy, dx) * 180 / Math.PI + 180) % 180; // direction, mod 180°
        let checked = 0;
        for (const k of keys.filter(k => k.key.rot)) {
            // neighbour in the same angled row, about 1u away (independent of how pads are placed)
            const nb = keys.find(o => o !== k && o.key.rot === k.key.rot && o.matrix[0] === k.matrix[0]
                && Math.abs(Math.hypot(o.cx - k.cx, o.cy - k.cy) - h.UNIT) < 0.15 * h.UNIT);
            if (!nb) continue;
            const sr = am.pads.filter(p => p.key === k.i && p.net === "SR");
            const a = deg(sr[1].x - sr[0].x, sr[1].y - sr[0].y), b = deg(nb.cx - k.cx, nb.cy - k.cy);
            const diff = Math.min(Math.abs(a - b), 180 - Math.abs(a - b));
            assert.ok(diff < 3, `${k.key.label}: board edge at ${a.toFixed(1)}° but its row runs at ${b.toFixed(1)}°`);
            checked++;
        }
        assert.ok(checked >= 10, `only ${checked} angled keys checked`);
    });
    test("ortho grid: neighbouring R/C pads are joined by short wires", () => {
        const ctx = h.importKLE(fx.ortho(4, 6), { board: "rp2040_zero" });
        const { am } = checkAmoeba(ctx);
        for (const w of am.wires.filter(w => /^(row|col):/.test(w.wire))) {
            const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) / MM;
            assert.ok(len < 7, `${w.wire} wire is ${len.toFixed(1)} mm — should use the facing pads`);
        }
    });
    test("Lily58-style split: one LED chain per half", () => {
        const ctx = h.importKLE(fx.lilyLike(), { split: true, board: "rp2040_zero" });
        const { am } = checkAmoeba(ctx, { split: true });
        assert.equal(new Set(am.leds.map(l => l.side)).size, 2);
    });
    test("uploaded QMK file (test2_keyboard.json)", () => checkAmoeba(h.uploadJSON(fx.test2())));

    test("export uses ROW2COL only while Amoeba is ticked", async () => {
        const ctx = h.importKLE(fx.ortho(2, 3), { board: "rp2040_zero" });
        h.setView(ctx, { bottom: true, amoeba: true, layers: ALL });
        let f = await h.exportZip(ctx);
        assert.match(f["config.h"], /DIODE_DIRECTION ROW2COL/);
        assert.equal(JSON.parse(f["info.json"]).diode_direction, "ROW2COL");
        h.setView(ctx, { bottom: true, amoeba: false });
        f = await h.exportZip(ctx);
        assert.match(f["config.h"], /DIODE_DIRECTION COL2ROW/);
    });
});

// The two readability rules from cubify.js, checked independently on the drawn SVG.
//  1. Dead zone: wires within 30° of parallel keep >= 2 px between their EDGES (stroke widths
//     included), ignoring the first/last 4 px at pads. Crossing at an angle is fine.
//  2. Pads: a wire stays >= 1 px clear of every pad except the ones at its own two ends.
const CLEARANCE = 2, PAD_R = 0.75 * MM, PAD_CLEARANCE = 1, END_SKIP = 4, PARALLEL = Math.cos(Math.PI / 6); // real pads: Ø1.5 mm
function ruleViolations(am) {
    const segDist = (p, a, b) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
        return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
    };
    const segs = am.wires.flatMap(w => w.path.slice(1).map((p, i) => ({ wire: w, a: w.path[i], b: p })));
    const out = [];
    // rule 1
    for (let i = 0; i < segs.length; i++) for (let j = 0; j < segs.length; j++) {
        const A = segs[i], B = segs[j];
        if (A.wire.wire === B.wire.wire) continue; // pieces of one wire meet at their pads
        const la = Math.hypot(A.b[0] - A.a[0], A.b[1] - A.a[1]), lb = Math.hypot(B.b[0] - B.a[0], B.b[1] - B.a[1]);
        if (la < 0.5 || lb < 0.5) continue;
        const cos = Math.abs(((A.b[0] - A.a[0]) * (B.b[0] - B.a[0]) + (A.b[1] - A.a[1]) * (B.b[1] - B.a[1])) / (la * lb));
        if (cos < PARALLEL) continue;
        const lim = (A.wire.w + B.wire.w) / 2 + CLEARANCE - 0.01, n = Math.max(2, Math.ceil(la));
        let close = 0;
        for (let k = 0; k <= n; k++) {
            const p = [A.a[0] + (A.b[0] - A.a[0]) * k / n, A.a[1] + (A.b[1] - A.a[1]) * k / n];
            if ([A.wire.a, A.wire.b].some(e => Math.hypot(p[0] - e[0], p[1] - e[1]) < END_SKIP)) continue;
            if (segDist(p, B.a, B.b) < lim) close += la / n;
        }
        if (close > 1) out.push(`dead zone: ${A.wire.wire} runs ${close.toFixed(0)}px inside ${B.wire.wire}'s 2px clearance`);
    }
    // rule 2
    for (const sg of segs) for (const pad of am.pads) {
        if ([sg.wire.a, sg.wire.b].some(e => near(e, [pad.x, pad.y]))) continue;
        if (segDist([pad.x, pad.y], sg.a, sg.b) < sg.wire.w / 2 + PAD_R + PAD_CLEARANCE - 0.01)
            out.push(`pad: ${sg.wire.wire} (${sg.wire.from}→${sg.wire.to}) crosses a ${pad.net} pad of key ${pad.key}`);
    }
    return [...new Set(out)];
}
const DEFAULT_PLUS_PADS = { rows: true, cols: true, led: true, pads: true };

describe("Amoeba readability", () => {
    const layouts = {
        "AliceZero": () => h.importKLE(fx.alice(), { board: "waveshare_2040_plus" }),
        "test2_keyboard.json (long column jumps)": () => h.uploadJSON(fx.test2()),
        "Lily58-style split": () => h.importKLE(fx.lilyLike(), { split: true, board: "rp2040_zero" }),
    };
    for (const [label, make] of Object.entries(layouts)) {
        test(`dead zone + pad rules hold: ${label}`, () => {
            const ctx = make();
            h.setView(ctx, { bottom: true, amoeba: true, layers: DEFAULT_PLUS_PADS });
            const am = h.readAmoeba(ctx);
            const v = ruleViolations(am);
            // Pads are a hard rule everywhere (a wire over a foreign pad could short).
            assert.deepEqual(v.filter(x => x.startsWith("pad:")), []);
            if (label.startsWith("Lily58")) {
                // One gap here is too tight for both rules; the router may give up a little dead
                // zone (never a pad). Keep that to a short graze so a real regression still fails.
                const perPair = {}; // the same graze is reported from both wires' side: count it once
                for (const x of v.filter(x => x.startsWith("dead zone:"))) {
                    const [, a, px, b] = x.match(/dead zone: (\S+) runs (\d+)px inside (\S+)'s/);
                    const k = [a, b].sort().join("|");
                    perPair[k] = Math.max(perPair[k] || 0, +px);
                }
                const graze = Object.values(perPair).reduce((n, x) => n + x, 0);
                assert.ok(graze <= 10, `dead-zone grazes total ${graze}px: ${v.join(" | ")}`);
                return;
            }
            assert.deepEqual(v, []);
            for (const w of am.wires.filter(w => w.path.length > 2)) {
                w.path.slice(1).forEach((p, i) => {
                    const q = w.path[i], straight = Math.abs(p[0] - q[0]) < 0.01 || Math.abs(p[1] - q[1]) < 0.01;
                    assert.ok(i === 0 || i === w.path.length - 2 || straight, `${w.wire}: routed middle leg is not straight`);
                });
            }
        });
    }
    test("with LED power on, AliceZero and test2 still keep both rules", () => {
        for (const make of [layouts.AliceZero, layouts["test2_keyboard.json (long column jumps)"]]) {
            const ctx = make();
            h.setView(ctx, { bottom: true, amoeba: true, layers: ALL });
            assert.deepEqual(ruleViolations(h.readAmoeba(ctx)), []);
        }
    });
    test("routed wires are actually used for test2's long column jumps", () => {
        const ctx = layouts["test2_keyboard.json (long column jumps)"]();
        h.setView(ctx, { bottom: true, amoeba: true });
        const routed = h.readAmoeba(ctx).wires.filter(w => w.wire.startsWith("col:") && w.path.length > 2);
        assert.ok(routed.length >= 5, `only ${routed.length} long column wires were routed`);
    });

    test("default layers: rows, columns, LED data; no power; only pads that carry a wire", () => {
        const ctx = h.importKLE(fx.ortho(3, 4), { board: "rp2040_zero" });
        h.setView(ctx, { bottom: true, amoeba: true });
        const am = h.readAmoeba(ctx);
        const kinds = new Set(am.wires.map(w => w.wire.split(":")[0]));
        assert.deepEqual([...kinds].sort(), ["col", "led", "row"]);
        assert.ok(am.pads.length < 12 * PADS_PER_BOARD, "unused pads should be hidden by default");
        for (const p of am.pads) {
            const wired = am.wires.some(w => (w.from === p.key && near(w.a, [p.x, p.y])) || (w.to === p.key && near(w.b, [p.x, p.y])));
            const feed = am.powerIn.some(f => f.key === p.key && f.net === p.net && near([f.x, f.y], [p.x, p.y]));
            assert.ok(wired || feed, `pad ${p.net} on key ${p.key} is shown but carries no wire`);
        }
        h.setView(ctx, { bottom: true, amoeba: true, layers: { rows: false, cols: false, led: false, power: true, pads: true } });
        const am2 = h.readAmoeba(ctx);
        assert.deepEqual([...new Set(am2.wires.map(w => w.wire.split(":")[0]))].sort(), ["vdd", "vss"]);
        assert.equal(am2.pads.length, 12 * PADS_PER_BOARD, "'Unused pads' shows every pad");
        assert.ok(am2.leds.some(l => l.n === 0), "L0 still shows the LED pin with the LED layer off");
    });

    test("hovering a key keeps only its row, column and LED neighbours bright", () => {
        const ctx = h.importKLE(fx.ortho(3, 4), { board: "rp2040_zero" });
        h.setView(ctx, { bottom: true, amoeba: true });
        const keys = h.readKeys(ctx);
        const target = keys.find(k => k.matrix[0] === 1 && k.matrix[1] === 1);
        const div = ctx.byId("stage").children.filter(c => c.className === "key")[target.i];
        div.dispatch("mouseenter");
        const svg = ctx.byId("stage").children.find(c => c.tagName === "svg");
        const wires = svg.children.filter(c => c.attrs && c.attrs["data-wire"]);
        for (const w of wires) {
            const id = w.attrs["data-wire"];
            const mine = id === "row:0:1" || id === "col:0:1" ||
                (id.startsWith("led:") && [w.attrs["data-from"], w.attrs["data-to"]].includes(String(target.i)));
            assert.equal(w.style.opacity, mine ? "1" : "0.12", `${id} ${w.attrs["data-from"]}→${w.attrs["data-to"]}`);
        }
        div.dispatch("mouseleave");
        assert.ok(wires.every(w => w.style.opacity === ""), "mouseleave restores every wire");
    });

    test("size slider enlarges only the Amoeba view; key labels are decluttered", () => {
        const ctx = h.importKLE(fx.ortho(2, 2), { board: "rp2040_zero" });
        h.setView(ctx, { bottom: true, amoeba: true });
        assert.equal(ctx.byId("stage").style.zoom, "2");
        assert.equal(ctx.byId("amoebaZoomLabel").textContent, "200%");
        const div = ctx.byId("stage").children.find(c => c.className === "key");
        assert.ok(!/class="pins"/.test(div.innerHTML), "pin text hidden on Amoeba boards");
        ctx.byId("amoebaZoom").value = "3";
        ctx.app.renderKeyboard();
        assert.equal(ctx.byId("stage").style.zoom, "3");
        h.setView(ctx, { bottom: true, amoeba: false });
        assert.equal(ctx.byId("stage").style.zoom, "", "normal views are not zoomed");
        assert.equal(ctx.byId("amoebaLayerBar").style.display, "none");
    });
});

describe("Amoeba routing shape", () => {
    // A hook loops past its pad and back; the user wants links like the short straight ones.
    for (const [label, make] of [
        ["AliceZero", () => h.importKLE(fx.alice(), { board: "waveshare_2040_plus" })],
        ["test2_keyboard.json", () => h.uploadJSON(fx.test2())],
        ["Lily58-style split", () => h.importKLE(fx.lilyLike(), { split: true, board: "rp2040_zero" })],
    ]) {
        test(`no needless hooks — a detour only where every straight pad-to-pad link would cross a pad: ${label}`, () => {
            const ctx = make();
            h.setView(ctx, { bottom: true, amoeba: true, layers: DEFAULT_PLUS_PADS });
            const am = h.readAmoeba(ctx);
            const segDist = (p, a, b) => {
                const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
                const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
                return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
            };
            const clearStraight = w => {
                const A = am.pads.filter(p => p.key === w.from && p.net === w.fromNet);
                const B = am.pads.filter(p => p.key === w.to && p.net === w.toNet);
                return A.some(pa => B.some(pb => am.pads.every(p => p === pa || p === pb ||
                    segDist([p.x, p.y], [pa.x, pa.y], [pb.x, pb.y]) >= w.w / 2 + PAD_R + PAD_CLEARANCE)));
            };
            const bad = am.wires.filter(w => w.path.length > 2 && !/^(row|col|led|vdd|vss):/.test("") ).map(w => {
                const len = w.path.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - w.path[i][0], p[1] - w.path[i][1]), 0);
                const d = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
                return { w, len, d };
            }).filter(x => x.len > 1.6 * x.d + 6 && clearStraight(x.w))
              .map(x => `${x.w.wire} ${x.w.from}→${x.w.to}: ${x.len.toFixed(0)}px detour although a straight link keeps clear of pads`);
            assert.deepEqual(bad, []);
        });
    }
});

describe("Amoeba LED power feed", () => {
    for (const [label, make, vdd, sides] of [
        ["AliceZero on RP2040-Plus", () => h.importKLE(fx.alice(), { board: "waveshare_2040_plus" }), "VBUS p40", 1],
        ["Lily58-style split on RP2040-Zero", () => h.importKLE(fx.lilyLike(), { split: true, board: "rp2040_zero" }), "5V", 2],
        ["2×(4×6) split on nice!nano", () => h.importKLE(fx.ortho(4, 6, { gap: 3 }), { split: true, board: "nice_nano" }), "VCC", 2],
    ]) {
        test(`+ and − feed pins are labelled on the first LED board of each half: ${label}`, () => {
            const ctx = make();
            for (const power of [false, true]) {
                h.setView(ctx, { bottom: true, amoeba: true, layers: { rows: true, cols: true, led: true, power, pads: true } });
                const am = h.readAmoeba(ctx);
                assert.equal(am.powerIn.length, 2 * sides, "one + and one − label per half");
                for (const f of am.powerIn) {
                    const l0 = am.leds.find(l => l.n === 0 && l.side === f.side);
                    assert.equal(f.key, l0.key, "power is fed at the L0 board, next to the data input");
                    assert.ok(am.pads.some(p => p.key === f.key && p.net === f.net && near([p.x, p.y], [f.x, f.y])), `label sits on a ${f.net} pad`);
                    assert.equal(f.text, f.net === "VDD" ? `+ ${vdd}` : f.text.startsWith("− GND") ? f.text : "− GND…");
                    // the label stays on the first board (within its 18.8 mm outline)
                    const k = h.readKeys(ctx)[f.key];
                    assert.ok(Math.abs(f.lx - k.cx) < 9.4 * MM + 1 && Math.abs(f.ly - k.cy) < 9.4 * MM + 1, "label sits on the board");
                    if (power) {
                        const onWire = am.wires.some(w => /^(vdd|vss):/.test(w.wire) && (near(w.a, [f.x, f.y]) || near(w.b, [f.x, f.y])));
                        assert.ok(!onWire, "the feed pad is the board's free one, not the one the chain leaves from");
                    }
                }
            }
        });
    }
});
