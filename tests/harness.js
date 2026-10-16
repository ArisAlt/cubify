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

function load({ split = false, board = "auto" } = {}) {
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
    byId("boardSelect").value = "json_file";
    byId("kleIsSplit").value = split ? "true" : "false";
    byId("kleBoardSelect").value = board;

    const factory = new Function("document", "window", "alert", "JSZip", "URL", "FileReader",
        SRC + "\n;return { get currentJSON(){ return currentJSON; }, renderKeyboard, boardProfiles," +
        " get isBottomView(){ return isBottomView; } };");
    const app = factory(document, {}, m => alerts.push(String(m)), JSZip, URL, FileReader);
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

function setView(ctx, { bottom = false, wiring = true } = {}) {
    if (ctx.app.isBottomView !== bottom) ctx.byId("viewToggle").click();
    ctx.byId("showWiring").checked = wiring;
    ctx.app.renderKeyboard();
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
    const lines = svg.children.filter(c => c.tagName === "line").map(l => ({
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

async function exportZip(ctx) {
    for (const k of Object.keys(ctx.zipFiles)) delete ctx.zipFiles[k];
    ctx.byId("exportVialZipBtn").click();
    await Promise.resolve();
    const files = {};
    for (const [k, v] of Object.entries(ctx.zipFiles)) files[k.split("/").slice(1).join("/")] = v;
    return files;
}

module.exports = { load, importKLE, uploadJSON, setView, readKeys, readWires, wireGroups, parseConfigH, exportZip, UNIT, ZONE };
