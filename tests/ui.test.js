// Page-level UI checks: design tokens, dialog semantics, keyboard use.
"use strict";
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const h = require("./harness");
const fx = require("./fixtures");

const HTML = fs.readFileSync(path.join(__dirname, "..", "keyboardfy.html"), "utf8");
const JS = fs.readFileSync(path.join(__dirname, "..", "keyboardfy.js"), "utf8");

describe("design tokens", () => {
    test("every CSS variable used is defined in :root (an undefined one made the KLE dialog transparent)", () => {
        const root = HTML.split("</style>")[0];
        const defined = new Set([...root.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
        const used = new Set([...(HTML + JS).matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
        assert.deepEqual([...used].filter(v => !defined.has(v)), []);
    });

    test("the palette, type scale and radii exist as tokens", () => {
        for (const t of ["--crust", "--green", "--blue", "--peach", "--red", "--yellow", "--mauve",
            "--fs-xs", "--fs-sm", "--fs-md", "--fs-base", "--fs-lg", "--radius-sm", "--radius-md", "--radius-lg"]) {
            assert.match(HTML, new RegExp(`${t}:`), t);
        }
    });

    test("keyboard focus is visible on controls", () => {
        assert.match(HTML, /button:focus-visible, select:focus-visible[^{]*\{\s*outline: 2px solid var\(--blue\)/);
    });
});

describe("dialogs", () => {
    test("both dialogs are labelled modal dialogs", () => {
        for (const id of ["kleModal", "firmwareModal"]) {
            assert.match(HTML, new RegExp(`id="${id}" role="dialog" aria-modal="true" aria-labelledby="\\w+"`), id);
        }
    });

    test("Escape closes the KLE dialog and the firmware guide", async () => {
        const ctx = h.importKLE(fx.ortho(2, 2), { board: "rp2040_zero" });
        ctx.byId("importKleBtn").click();
        assert.equal(ctx.byId("kleModal").style.display, "flex");
        ctx.document.dispatch("keydown", { key: "Escape" });
        assert.equal(ctx.byId("kleModal").style.display, "none");
        await h.exportZip(ctx, "via");
        assert.equal(ctx.byId("firmwareModal").style.display, "flex");
        ctx.document.dispatch("keydown", { key: "a" });
        assert.equal(ctx.byId("firmwareModal").style.display, "flex", "other keys do nothing");
        ctx.document.dispatch("keydown", { key: "Escape" });
        assert.equal(ctx.byId("firmwareModal").style.display, "none");
    });
});

describe("code health", () => {
    test("keyboardfy.js runs in strict mode (no undeclared variables leaking onto window)", () => {
        // the harness runs it with "use strict"; an import exercises the routing code
        const ctx = h.importKLE(fx.ortho(3, 4), { board: "rp2040_zero" });
        assert.ok(ctx.app.currentJSON, ctx.alerts.join(" | "));
        assert.ok(!ctx.alerts.some(a => /Error/.test(a)), ctx.alerts.join(" | "));
    });
});
