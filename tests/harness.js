// Runs the real cubify.js against a minimal fake DOM so tests see exactly what the
// page renders: key labels/pins, the wiring SVG and the exported Vial ZIP files.
"use strict";
const fs = require("fs");
const path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "cubify.js"), "utf8");
const UNIT = 55;
const ZONE = UNIT * 0.22;

class El {
    constructor(tag, id) {
        this.tagName = tag; this.id = id || "";
        this.style = {}; this.attrs = {}; this.children = []; this.listeners = {};
        this.value = ""; this.checked = false; this.className = ""; this.parent = null;
        this._html = ""; this.innerText = ""; this.textContent = "";
    }
    get options() { return [{ text: this.value }]; }
    get selectedIndex() { return 0; }
    set innerHTML(v) { this._html = v; if (v === "") this.children = []; }
    get innerHTML() { return this._html; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    dispatch(t, ev) { (this.listeners[t] || []).forEach(f => f(ev || { target: this })); }
    click() { this.dispatch("click"); }
    appendChild(c) { c.parent = this; this.children.push(c); return c; }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
}

function load({ split = false, board = "auto", wiring = null } = {}) {
    const els = {};
    const byId = id => (els[id] = els[id] || new El("div", id));
    const document = {
        getElementById: byId,
        createElement: t => new El(t),
        createElementNS: (_, t) => new El(t),
        addEventListener() {},
        body: new El("body"),
    };
    const alerts = [];
    const zipFiles = {};
    class JSZip {
        constructor(prefix = "") { this.prefix = prefix; }
        folder(n) { return new JSZip(this.prefix + n + "/"); }
        file(n, c) { zipFiles[this.prefix + n] = c; return this; }
        generateAsync() { return Promise.resolve("blob"); }
    }
    class FileReader { readAsText(f) { this.onload({ target: { result: f.text } }); } }
    const URL = { createObjectURL: () => "blob:", revokeObjectURL() {} };
    // Same defaults as cubify.html's Amoeba layer bar.
    for (const id of ["amoebaShowRows", "amoebaShowCols", "amoebaShowLed"]) byId(id).checked = true;
    byId("amoebaZoom").value = "2";

    const factory = new Function("document", "window", "alert", "JSZip", "URL", "FileReader",
        SRC + "\n;return { get currentJSON(){ return currentJSON; }, renderKeyboard, boardProfiles, BOARD_META, ledSupply," +
        " get isBottomView(){ return isBottomView; } };");
    const app = factory(document, {}, m => alerts.push(String(m)), JSZip, URL, FileReader);
    // cubify.js builds both board dropdowns at load; pick like a user would.
    byId("kleBoardSelect").value = (split ? "split:" : "") + board;
    if (wiring) byId("kleWiringSelect").value = wiring; // "matrix" | "direct"
    return { app, els, byId, alerts, zipFiles };
}

/** Import a KLE array through the real "Import KLE" modal. */
function importKLE(kle, opts = {}) {
    const ctx = load(opts);
    ctx.byId("kleInput").value = JSON.stringify(kle);
    ctx.byId("processKleBtn").click();
    return ctx;
}

/** Upload a QMK info.json/keyboard.json through the real file input. */
function uploadJSON(obj, opts = {}) {
    const ctx = load(opts);
    if (opts.boardSelect) ctx.byId("boardSelect").value = opts.boardSelect;
    ctx.byId("upload").dispatch("change", { target: { files: [{ text: JSON.stringify(obj) }] } });
    return ctx;
}

function setView(ctx, { bottom = false, wiring = true, amoeba = false, layers = null } = {}) {
    const amoebaBox = ctx.byId("amoebaToggle");
    amoebaBox.checked = amoeba;
    const ids = { rows: "amoebaShowRows", cols: "amoebaShowCols", led: "amoebaShowLed", power: "amoebaShowPower", pads: "amoebaShowPads" };
    if (layers) for (const [k, id] of Object.entries(ids)) ctx.byId(id).checked = !!layers[k];
    if (ctx.app.isBottomView !== bottom) ctx.byId("viewToggle").click();
    ctx.byId("showWiring").checked = wiring;
    ctx.app.renderKeyboard();
}

/** Controller blocks, home-run wires (key → own controller) and the link between controllers. */
function readControllers(ctx) {
    const svg = ctx.byId("stage").children.find(c => c.tagName === "svg");
    if (!svg) return null;
    const kids = svg.children;
    const pts = s => s.split(" ").map(p => p.split(",").map(Number));
    return {
        blocks: kids.filter(c => c.tagName === "rect" && c.attrs["data-ctrl-block"] !== undefined).map(r => ({
            side: +r.attrs["data-ctrl-block"], x1: px(r.attrs.x), x2: px(r.attrs.x) + px(r.attrs.width), y: px(r.attrs.y),
            y2: px(r.attrs.y) + px(r.attrs.height) })),
        pinLabels: kids.filter(c => c.tagName === "text" && c.attrs["data-pin-label"] !== undefined)
            .map(t => ({ text: t.textContent, x: px(t.attrs.x), y: px(t.attrs.y) })),
        titles: kids.filter(c => c.tagName === "text" && c.attrs["data-ctrl-title"] !== undefined)
            .map(t => ({ side: +t.attrs["data-ctrl-title"], text: t.textContent })),
        homeruns: kids.filter(c => c.tagName === "polyline" && c.attrs["data-homerun"]).map(l => {
            const [kind, side, idx] = l.attrs["data-homerun"].split(":");
            return { kind, side: +side, idx: +idx, ctrl: +l.attrs["data-ctrl"], pin: l.attrs["data-pin"], path: pts(l.attrs.points) };
        }),
        link: kids.filter(c => c.attrs && c.attrs["data-link"]).map(l => ({ type: l.attrs["data-link"] }))[0] || null,
        linkLabel: (kids.find(c => c.attrs && c.attrs["data-link-label"]) || {}).textContent || null,
    };
}

/** Amoeba layer: boards, pads (net/key/pos), wire segments and LED labels. */
function readAmoeba(ctx) {
    const svg = ctx.byId("stage").children.find(c => c.tagName === "svg");
    if (!svg) return null;
    const kids = svg.children;
    return {
        boards: kids.filter(c => c.tagName === "polygon" && c.attrs["data-amoeba"] !== undefined)
            .map(c => ({ key: +c.attrs["data-amoeba"], pts: c.attrs.points.split(" ").map(p => p.split(",").map(Number)) })),
        pads: kids.filter(c => c.tagName === "circle" && c.attrs["data-pad"])
            .map(c => ({ net: c.attrs["data-pad"], key: +c.attrs["data-key"], x: px(c.attrs.cx), y: px(c.attrs.cy) })),
        wires: kids.filter(c => (c.tagName === "line" || c.tagName === "polyline") && c.attrs["data-wire"]).map(l => {
            const path = l.tagName === "line"
                ? [[px(l.attrs.x1), px(l.attrs.y1)], [px(l.attrs.x2), px(l.attrs.y2)]]
                : l.attrs.points.split(" ").map(p => p.split(",").map(Number));
            return {
                wire: l.attrs["data-wire"], from: +l.attrs["data-from"], to: +l.attrs["data-to"],
                fromNet: l.attrs["data-from-net"], toNet: l.attrs["data-to-net"],
                a: path[0], b: path[path.length - 1], path, w: +l.attrs["stroke-width"],
            };
        }),
        powerIn: kids.filter(c => c.tagName === "text" && c.attrs["data-power-in"])
            .map(t => ({ net: t.attrs["data-power-in"], key: +t.attrs["data-key"], side: +t.attrs["data-led-side"],
                x: px(t.attrs["data-pad-x"]), y: px(t.attrs["data-pad-y"]), lx: px(t.attrs.x), ly: px(t.attrs.y), text: t.textContent })),
        leds: kids.filter(c => c.tagName === "text" && c.attrs["data-led"] !== undefined)
            .map(t => ({ n: +t.attrs["data-led"], key: +t.attrs["data-led-key"], side: +t.attrs["data-led-side"], text: t.textContent })),
    };
}

const px = s => parseFloat(String(s));

/** What the page shows for each key, in layout order. */
function readKeys(ctx) {
    const layout = Object.values(ctx.app.currentJSON.layouts)[0].layout;
    const divs = ctx.byId("stage").children.filter(c => c.className === "key");
    return divs.map((d, i) => {
        const m = /\[(\d+), (\d+)\]/.exec(d.innerHTML);
        const p = /class="pins"[^>]*>([^<|]*) \| ([^<]*)</.exec(d.innerHTML);
        const left = px(d.style.left), top = px(d.style.top), w = px(d.style.width), h = px(d.style.height);
        return {
            i, key: layout[i], matrix: m ? [+m[1], +m[2]] : null,
            rowPin: p ? p[1].trim() : null, colPin: p ? p[2].trim() : null,
            left, top, w, h, cx: left + w / 2, cy: top + h / 2,
        };
    });
}

/** Wiring SVG → connected components of row wires (solid) and column wires (dashed). */
function readWires(ctx) {
    const svg = ctx.byId("stage").children.find(c => c.tagName === "svg");
    if (!svg) return null;
    const lines = svg.children.filter(c => c.tagName === "line" && !c.attrs["data-link"]).map(l => ({
        a: [px(l.attrs.x1), px(l.attrs.y1)], b: [px(l.attrs.x2), px(l.attrs.y2)],
        kind: l.attrs["stroke-dasharray"] ? "col" : "row", color: l.attrs.stroke,
    }));
    const dots = svg.children.filter(c => c.tagName === "circle").map(c => ({ p: [px(c.attrs.cx), px(c.attrs.cy)], color: c.attrs.fill }));
    return { lines, dots };
}

/** Group key indices by the wire they sit on, using the anchor points Cubify draws. */
function wireGroups(keys, wires, kind) {
    const anchor = k => [k.cx, kind === "row" ? k.cy - ZONE : k.cy + ZONE];
    const near = (p, q) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;
    const parent = keys.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const idxAt = p => keys.findIndex(k => k.matrix && near(anchor(k), p));
    const orphanEnds = [];
    for (const l of wires.lines.filter(l => l.kind === kind)) {
        const i = idxAt(l.a), j = idxAt(l.b);
        if (i < 0 || j < 0) { orphanEnds.push(l); continue; }
        parent[find(i)] = find(j);
    }
    const groups = {};
    keys.forEach((k, i) => { if (k.matrix) (groups[find(i)] = groups[find(i)] || []).push(i); });
    return { groups: Object.values(groups), orphanEnds };
}

function parseConfigH(txt) {
    const get = re => (re.exec(txt) || [])[1];
    const list = s => (s || "").split(",").map(x => x.trim()).filter(Boolean);
    return {
        rows: +get(/#define MATRIX_ROWS (\d+)/), cols: +get(/#define MATRIX_COLS (\d+)/),
        rowPins: list(get(/#define MATRIX_ROW_PINS \{([^}]*)\}/)),
        colPins: list(get(/#define MATRIX_COL_PINS \{([^}]*)\}/)),
    };
}

/** Step ④: pick the firmware (Vial by default; "via", "qmk") and press Export firmware. Returns the ZIP's
 *  files, keyed by path inside the keyboard folder. */
/** Matrix size and pins from an exported keyboard.json, computed the way QMK does (matrix_size from
 *  matrix_pins or the direct grid; rows doubled for a split). */
function matrixOf(files) {
    const kb = JSON.parse(files["keyboard.json"]);
    const mp = kb.matrix_pins || {};
    const rows = mp.direct ? mp.direct.length : (mp.rows || []).length;
    const cols = mp.direct ? Math.max(...mp.direct.map(r => r.length)) : (mp.cols || []).length;
    return { kb, rows: kb.split && kb.split.enabled ? rows * 2 : rows, cols, rowPins: mp.rows || [], colPins: mp.cols || [] };
}

async function exportZip(ctx, target = "vial") {
    for (const k of Object.keys(ctx.zipFiles)) delete ctx.zipFiles[k];
    ctx.byId("firmwareTarget").value = target;
    ctx.byId("exportFirmwareBtn").click();
    await Promise.resolve();
    const files = {};
    for (const [k, v] of Object.entries(ctx.zipFiles)) files[k.split("/").slice(1).join("/")] = v;
    return files;
}

module.exports = { matrixOf, load, importKLE, uploadJSON, setView, readAmoeba, readControllers, readKeys, readWires, wireGroups, parseConfigH, exportZip, UNIT, ZONE };
