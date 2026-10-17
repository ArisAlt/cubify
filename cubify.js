const UNIT_SIZE = 55; // 1U = 55px
        let currentJSON = null;
        let isBottomView = false;
        let parsedKeymaps = null;
        let assignedEncoders = [];
        let lastKleText = null;    // last imported KLE, so a new board choice can re-route it
        let quietReroute = false;  // true while re-routing from the board dropdown (no popups)

            // Board profiles: `rows` and `cols` are the DEFAULT pin segregation.
            // `pins` is the FULL pool of usable GPIOs — used for dynamic allocation
            // when the matrix is asymmetric (e.g. more cols than the cols array has).
            // Pin data verified against QMK/ZMK docs and the Raspberry Pi/Waveshare pinouts
            // (see skills/keyboard-handwiring/references/boards.json). Never put a reserved pin in
            // rows/cols/pins: rp2040_zero GP16 = onboard WS2812, pro_micro B7 = not broken out,
            // waveshare_2040_plus GP29 = VSYS sense (not on the header).
            // rp2040_zero: `pins` is the 20 castellated edge GPIOs; GP17-25 are underside pads and are left out.
            // pro_micro: all 18 pool pins are used by the default layout; there is no spare pin for enc2_b, so enc2 is omitted.
            // rp2040_tiny: pin list is UNVERIFIED against Waveshare's pinout - check the silkscreen/wiki before wiring.
            const boardProfiles = {
                "rp2040_zero":            { rows: ["GP0","GP1","GP2","GP3","GP4","GP5","GP6"], cols: ["GP15","GP14","GP13","GP12","GP11","GP10","GP9"], pins: ["GP0","GP1","GP2","GP3","GP4","GP5","GP6","GP7","GP8","GP9","GP10","GP11","GP12","GP13","GP14","GP15","GP26","GP27","GP28","GP29"], periph: { sda: "GP26", scl: "GP27", enc_a: "GP28", enc_b: "GP29", enc2_a: "GP7", enc2_b: "GP8" } },
                "rp2040_tiny":            { rows: ["GP0","GP1","GP2","GP3","GP4","GP5","GP6"], cols: ["GP10","GP9","GP8","GP7","GP6","GP5","GP4","GP3","GP2","GP1"], pins: ["GP0","GP1","GP2","GP3","GP4","GP5","GP6","GP7","GP8","GP9","GP10","GP11","GP12","GP13","GP14","GP15","GP26","GP27","GP28","GP29"], periph: { sda: "GP26", scl: "GP27", enc_a: "GP28", enc_b: "GP29", enc2_a: "GP14", enc2_b: "GP15" } },
                "pro_micro":              { rows: ["D4","C6","D7","E6","B4","B5"], cols: ["F4","F5","F6","F7","B1","B3","B2"], pins: ["D4","C6","D7","E6","B4","B5","F4","F5","F6","F7","B1","B3","B2","D2","D3","B6","D1","D0"], periph: { sda: "D1", scl: "D0", enc_a: "D2", enc_b: "D3" } },
                "nice_nano":              { rows: ["P0.06","P0.08","P0.17","P0.20","P0.22","P0.24"], cols: ["P0.31","P0.29","P0.02","P1.15","P1.13","P1.11","P0.10"], pins: ["P0.06","P0.08","P0.17","P0.20","P0.22","P0.24","P0.31","P0.29","P0.02","P1.15","P1.13","P1.11","P0.10","P0.09","P1.00","P0.11","P1.02","P1.04","P1.06"], periph: { sda: "P1.04", scl: "P1.06", enc_a: "P0.09", enc_b: "P1.00", enc2_a: "P0.11", enc2_b: "P1.02" } },
                "nrf52840_nicenano_clone": { rows: ["P0.06","P0.08","P0.17","P0.20","P0.22","P0.24"], cols: ["P0.31","P0.29","P0.02","P1.15","P1.13","P1.11","P0.10"], pins: ["P0.06","P0.08","P0.17","P0.20","P0.22","P0.24","P0.31","P0.29","P0.02","P1.15","P1.13","P1.11","P0.10","P0.09","P1.00","P0.11","P1.02","P1.04","P1.06"], periph: { sda: "P1.04", scl: "P1.06", enc_a: "P0.09", enc_b: "P1.00", enc2_a: "P0.11", enc2_b: "P1.02" } },
                "waveshare_2040_plus":     { rows: ["GP0","GP1","GP2","GP3","GP4","GP5","GP6","GP7","GP8","GP9"], cols: ["GP10","GP11","GP12","GP13","GP14","GP15","GP16","GP17","GP18","GP19","GP20","GP21","GP22","GP26","GP27","GP28"], pins: ["GP0","GP1","GP2","GP3","GP4","GP5","GP6","GP7","GP8","GP9","GP10","GP11","GP12","GP13","GP14","GP15","GP16","GP17","GP18","GP19","GP20","GP21","GP22","GP26","GP27","GP28"], periph: {} }
            };

            // How each controller is named, and how two of them talk on a split keyboard:
            // "trrs" = wired half-duplex serial over a TRRS/TRS cable on `splitPin` (same pin on both
            // halves, kept out of the matrix); "wireless" = BLE between the halves (ZMK, no pin).
            const BOARD_META = {
                waveshare_2040_plus:     { label: "Waveshare RP2040-Plus",          link: "trrs", splitPin: "GP28" },
                rp2040_zero:             { label: "Waveshare RP2040-Zero",          link: "trrs", splitPin: "GP29" },
                rp2040_tiny:             { label: "Waveshare RP2040-Tiny",          link: "trrs", splitPin: "GP29" },
                pro_micro:               { label: "Pro Micro (ATmega32U4)",         link: "trrs", splitPin: "D2" },
                nice_nano:               { label: "nice!nano v2 (nRF52840, ZMK)",   link: "wireless" },
                nrf52840_nicenano_clone: { label: "SuperMini nRF52840 (ZMK)",       link: "wireless" },
            };
            // Dropdown values: "<board>" = one controller, "split:<board>" = two controllers.
            const parseBoardChoice = v => {
                v = v || "";
                const split = v.startsWith("split:");
                return { id: split ? v.slice(6) : v, split };
            };
            const boardChoiceValue = (id, split) => (split ? "split:" : "") + id;
            const isZmkOnly = id => (BOARD_META[id] || {}).link === "wireless";

            // Amoeba Royale v2.0 single-key PCB (github.com/mtl/keyboard-pcbs, CC0), seen from the
            // SOLDER side (= Cubify's bottom view). Pad positions are % of the 18.8 x 18.1 mm board,
            // taken from amoeba-royale.kicad_pcb and mirrored left-right. Every net has several pads
            // so wires can leave in any direction. The on-board diode's anode is on the R (row) pad,
            // so firmware must use DIODE_DIRECTION ROW2COL.
            const AMOEBA = {
                wMM: 18.8, hMM: 18.1, padMM: 1.5, // wire pads are Ø1.5 mm (0.9 mm drill)
                pads: [
                    { net: "SR",   x: 10.8, y: 7.4 },  { net: "SR",   x: 89.2, y: 7.4 },
                    { net: "SC",   x: 25.7, y: 7.4 },  { net: "SC",   x: 77.4, y: 7.4 },
                    { net: "SC",   x: 32.1, y: 93.0 }, { net: "SC",   x: 78.0, y: 93.0 },
                    { net: "VDD",  x: 41.6, y: 7.0 },  { net: "VDD",  x: 10.8, y: 82.5 },
                    { net: "VDD",  x: 89.2, y: 82.5 }, { net: "VDD",  x: 43.6, y: 93.0 },
                    { net: "VSS",  x: 52.7, y: 7.0 },  { net: "VSS",  x: 10.8, y: 71.9 },
                    { net: "VSS",  x: 89.2, y: 71.9 }, { net: "VSS",  x: 55.1, y: 93.0 },
                    { net: "DIN",  x: 63.9, y: 7.4 },  { net: "DIN",  x: 9.8,  y: 36.8 },
                    { net: "DIN",  x: 89.2, y: 93.0 },
                    { net: "DOUT", x: 89.2, y: 20.4 }, { net: "DOUT", x: 66.6, y: 93.0 },
                    { net: "DOUT", x: 10.8, y: 93.0 },
                ],
                colors: { SR: "#cba6f7", SC: "#89dceb", VDD: "#f38ba8", VSS: "#a6e3a1", DIN: "#f9e2af", DOUT: "#f9e2af" },
            };

        const uploadInput = document.getElementById('upload');
        const qmkSearch = document.getElementById('qmkSearch');
        const fetchQmkBtn = document.getElementById('fetchQmkBtn');
        const fetchKeymapBtn = document.getElementById('fetchKeymapBtn');
        const keymapUpload = document.getElementById('keymapUpload');
        const layerSelect = document.getElementById('layerSelect');
        const boardSelect = document.getElementById('boardSelect');
        const viewToggle = document.getElementById('viewToggle');
        const clearAllBtn = document.getElementById('clearAllBtn');
        const warningBanner = document.getElementById('warningBanner');
        const exportVialZipBtn = document.getElementById('exportVialZipBtn');
        
        if (clearAllBtn) {
            clearAllBtn.addEventListener('click', () => {
                currentJSON = null;
                stage.innerHTML = '';
                const existingSvg = document.getElementById('routingLayer');
                if (existingSvg) existingSvg.remove();
                warningBanner.style.display = 'none';
                exportVialZipBtn.style.display = 'none';
                if (fetchKeymapBtn) fetchKeymapBtn.style.display = 'none';
                layerSelect.style.display = 'none';
                parsedKeymaps = null;
                assignedEncoders = [];
            });
        }
        const showWiringCheckbox = document.getElementById('showWiring');
        const tooltip = document.getElementById('tooltip');
        const stage = document.getElementById('stage');


        // Column numbers follow the PHYSICAL order of the columns (average key x), not the order
        // the router created them in (a collision can add a column index after the outer one).
        // fromRight = true numbers from the right edge (a mirrored right half: outer column = 0).
        function renumberColsByPosition(keys, fromRight) {
            const cx = k => (k.cx !== undefined ? k.cx : (k.x || 0) + (k.w || 1) / 2);
            const byCol = {};
            keys.forEach(k => (byCol[k.matrixCol] = byCol[k.matrixCol] || []).push(cx(k)));
            const avg = c => byCol[c].reduce((n, x) => n + x, 0) / byCol[c].length;
            const order = Object.keys(byCol).map(Number).sort((a, b) => fromRight ? avg(b) - avg(a) : avg(a) - avg(b));
            const remap = new Map(order.map((c, i) => [c, i]));
            keys.forEach(k => { k.matrixCol = remap.get(k.matrixCol); k.matrix = [k.matrixRow, k.matrixCol]; });
            return order.length;
        }

        // Use the board's default row/col lists when the matrix fits them and they don't share a
        // pin; otherwise take pins contiguously from the full pool (rows first, then cols).
        // A pin is never handed out twice (a pin on a row AND a column shorts them).
        function allocatePins(profile, rowsNeeded, colsNeeded) {
            if (rowsNeeded <= profile.rows.length && colsNeeded <= profile.cols.length) {
                const rows = profile.rows.slice(0, rowsNeeded);
                const cols = profile.cols.slice(0, colsNeeded);
                if (!cols.some(p => rows.includes(p))) return { rows, cols };
            }
            const pool = profile.pins || [...profile.rows, ...profile.cols];
            return { rows: pool.slice(0, rowsNeeded), cols: pool.slice(rowsNeeded, rowsNeeded + colsNeeded) };
        }

        // Free GPIOs for the matrix (or direct pins): the board's pool minus the TRRS link pin
        // that a wired split reserves on each half.
        function freePinsOf(id, isSplit) {
            const pr = boardProfiles[id];
            if (!pr) return [];
            const meta = BOARD_META[id] || {};
            const link = isSplit && meta.link === "trrs" ? meta.splitPin : null;
            return (pr.pins || [...pr.rows, ...pr.cols]).filter(pin => pin !== link);
        }

        // Direct wiring: a rows x cols grid per controller with one pin per key, handed out from
        // `pool` in matrix reading order; null = no key at that [row, col] (QMK's NO_PIN). Both
        // halves of a split start from the same pool, so mirror-twin keys share a pin.
        function buildDirectGrids(layout, rows, cols, isSplit, pool) {
            const sides = isSplit ? [0, 1] : [0];
            return sides.map(side => {
                const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
                layout.filter(k => k.matrix && (isSplit && k.matrix[0] >= rows ? 1 : 0) === side)
                    .sort((a, b) => a.matrix[0] - b.matrix[0] || a.matrix[1] - b.matrix[1])
                    .forEach((k, i) => {
                        const r = k.matrix[0] - side * rows, c = k.matrix[1];
                        if (grid[r] && c < cols) grid[r][c] = pool[i] || null;
                    });
                return grid;
            });
        }

        // The direct-pin grids of a layout (KLE import or QMK keyboard.json), or null for a matrix.
        // A split without its own right-hand grid uses the left one (QMK: DIRECT_PINS_RIGHT falls
        // back to DIRECT_PINS).
        function directGridsOf(json) {
            const left = json && json.matrix_pins && json.matrix_pins.direct;
            if (!Array.isArray(left)) return null;
            const sp = json.split && json.split.matrix_pins && json.split.matrix_pins.right;
            return { left, right: (sp && sp.direct) || json.direct_right || left };
        }
        const gridDims = grid => ({ rows: grid.length, cols: grid.reduce((n, r) => Math.max(n, r.length), 0) });

        // A QMK file with direct pins: pick the smallest board whose pin pool holds every pin it uses.
        function detectDirectBoard(json) {
            const d = directGridsOf(json);
            if (!d) return;
            const used = [...d.left.flat(), ...d.right.flat()].filter(Boolean);
            const pool = b => boardProfiles[b].pins || [];
            const id = Object.keys(BOARD_META).filter(b => used.every(p => pool(b).includes(p)))
                .sort((a, b) => pool(a).length - pool(b).length)[0];
            if (id) boardSelect.value = boardChoiceValue(id, !!(json.split && (json.split.enabled ?? true)));
        }

        // Two keys that exist in the layout for the Vial unlock combo: [0,0]+[0,1] when present,
        // otherwise the first two keys in row/column order.
        function pickUnlockKeys(layout) {
            const coords = layout.filter(k => k.matrix).map(k => k.matrix)
                .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
            const has = (r, c) => coords.some(m => m[0] === r && m[1] === c);
            if (has(0, 0) && has(0, 1)) return [[0, 0], [0, 1]];
            return coords.length >= 2 ? [coords[0], coords[1]] : [[0, 0], [0, 1]];
        }

        function extractLayout(jsonObj) {
            if (jsonObj && jsonObj.layouts && Object.keys(jsonObj.layouts).length > 0) {
                const firstLayoutKey = Object.keys(jsonObj.layouts)[0];
                return jsonObj.layouts[firstLayoutKey].layout || [];
            }
            return [];
        }

        // KLE text → flat physical layout (rotations folded into absolute x/y; logical_x/y kept
        // for row grouping; a "row,col" top-left label becomes a manual matrix override).
        function parseKle(rawText) {
            // Try parsing KLE JSON. Some users copy raw strings, so eval is needed if it's not strict JSON
            // (KLE JSON uses single quotes or unquoted keys sometimes, standard JSON.parse fails)
            // A safer regex replacement:
            let jsonText = rawText.replace(/(['"])?([a-z0-9A-Z_]+)(['"])?:/g, '"$2": ').replace(/'/g, '"');
            let kleData;
            try {
                kleData = JSON.parse(jsonText);
            } catch (e) {
                // Fallback to Function constructor (safer than eval) if KLE format is loose
                kleData = (new Function("return " + rawText))();
            }

            if (!Array.isArray(kleData)) throw new Error("Invalid KLE format. Must be an array of arrays.");

            let physicalLayout = [];
            let rx = 0, ry = 0, r = 0;
            let x = 0, y = 0;

            kleData.forEach(row => {
                if (!Array.isArray(row)) return; // Skip keyboard metadata objects at the top
                x = rx;
                let w = 1, h = 1;

                row.forEach(item => {
                    if (typeof item === 'object') {
                        if (item.r !== undefined) r = item.r;
                        if (item.w !== undefined) w = item.w;
                        if (item.h !== undefined) h = item.h;
                        if (item.rx !== undefined) {
                            rx = item.rx;
                            x = rx;
                            y = ry;
                        }
                        if (item.ry !== undefined) {
                            ry = item.ry;
                            y = ry;
                        }
                        if (item.x !== undefined) x += item.x;
                        if (item.y !== undefined) y += item.y;
                    } else if (typeof item === 'string') {
                        // Calculate unrotated center
                        let cx = x + w / 2;
                        let cy = y + h / 2;

                        // Rotate center around (rx, ry)
                        let angle = r * Math.PI / 180;
                        let dx = cx - rx;
                        let dy = cy - ry;
                        let rotated_cx = rx + dx * Math.cos(angle) - dy * Math.sin(angle);
                        let rotated_cy = ry + dx * Math.sin(angle) + dy * Math.cos(angle);

                        // Top-left of the rotated bounding box
                        let final_x = rotated_cx - w / 2;
                        let final_y = rotated_cy - h / 2;

                        let rawLabels = item.split('\n');
                        let primaryLabel = rawLabels[0] ? rawLabels[0].trim() : '';

                        // kle-ng style manual matrix override: check if top-left label is "row,col"
                        let matrixOverride = null;
                        let matrixMatch = primaryLabel.match(/^(\d+)\s*,\s*(\d+)$/);
                        if (matrixMatch) {
                            matrixOverride = [parseInt(matrixMatch[1], 10), parseInt(matrixMatch[2], 10)];
                        }

                        physicalLayout.push({ 
                            x: Math.round(final_x * 1000) / 1000, 
                            y: Math.round(final_y * 1000) / 1000, 
                            logical_x: x,
                            logical_y: y,
                            w: w,
                            h: h,
                            rot: r,
                            label: primaryLabel,
                            matrixOverride: matrixOverride
                        });

                        x += w;
                        w = 1; h = 1;
                    }
                });
                y += 1;
            });
            return physicalLayout;
        }

        // Split the layout at its physical midpoint: the widest gap between key centres in the
        // middle 30% of the board.
        function findHalves(physicalLayout) {
            // Find physical midpoint (largest horizontal gap in the centre 30% of the board)
            let max_x = 0;
            physicalLayout.forEach(k => { if ((k.x||0) + (k.w||1) > max_x) max_x = (k.x||0) + (k.w||1); });
            const centre30Lo = max_x * 0.35, centre30Hi = max_x * 0.65;
            let sortedCenters = physicalLayout.map(k => (k.cx || (k.x||0) + (k.w||1)/2)).sort((a,b) => a-b);
            let midpoint = max_x / 2;
            let widestGap = 0.5; // must beat ordinary 1u key spacing noise
            for (let i = 0; i < sortedCenters.length - 1; i++) {
                let gap = sortedCenters[i+1] - sortedCenters[i];
                let gapCentre = (sortedCenters[i] + sortedCenters[i+1]) / 2;
                if (gapCentre > centre30Lo && gapCentre < centre30Hi && gap > widestGap) {
                    widestGap = gap;
                    midpoint = gapCentre;
                }
            }
            const leftHalves  = physicalLayout.filter(k => (k.cx || (k.x||0)+(k.w||1)/2) < midpoint);
            const rightHalves = physicalLayout.filter(k => (k.cx || (k.x||0)+(k.w||1)/2) >= midpoint);
            return { leftHalves, rightHalves };
        }

        const importKleBtn = document.getElementById('importKleBtn');
        const kleModal = document.getElementById('kleModal');
        const kleBoardSelect = document.getElementById('kleBoardSelect');
        const kleInput = document.getElementById('kleInput');
        const processKleBtn = document.getElementById('processKleBtn');
        const closeKleModalBtn = document.getElementById('closeKleModalBtn');
        const rightHalfWiring = document.getElementById('rightHalfWiring');

        // Both board dropdowns come from BOARD_META: one group per keyboard type.
        function fillBoardSelect(select, { withJson, withAuto }) {
            if (!select) return;
            select.innerHTML = "";
            const opt = (value, text, parent) => {
                const o = document.createElement("option");
                o.value = value; o.textContent = text;
                parent.appendChild(o);
            };
            if (withJson) opt("json_file", "📄 Read pins from JSON", select);
            const mono = document.createElement("optgroup");
            mono.label = "⌨️ Monolithic · one controller";
            if (withAuto) opt("auto", "Auto-select (best fit)", mono);
            Object.entries(BOARD_META).forEach(([id, m]) => opt(boardChoiceValue(id, false), m.label, mono));
            const split = document.createElement("optgroup");
            split.label = "✂️ Split · two controllers (one per half)";
            if (withAuto) opt("split:auto", "Auto-select (best fit, ×2)", split);
            Object.entries(BOARD_META).forEach(([id, m]) => opt(boardChoiceValue(id, true),
                `2× ${m.label.replace(/ \(.*\)$/, "")} · ${m.link === "wireless" ? "wireless (ZMK)" : "TRRS cable"}`, split));
            select.appendChild(mono);
            select.appendChild(split);
            select.value = withJson ? "json_file" : "auto";
        }
        // Wiring: a diode matrix (rows x columns) or, for small boards, direct wiring — every
        // switch on its own GPIO, the other leg on a shared GND, no diodes.
        const wiringSelect = document.getElementById('wiringSelect');
        const kleWiringSelect = document.getElementById('kleWiringSelect');
        const DIRECT_LABEL = "🔌 Direct wiring (no diodes) · one pin per key, shared GND";
        function fillWiringSelect(select) {
            if (!select) return;
            select.innerHTML = "";
            [["matrix", "🔳 Diode matrix · rows × columns"], ["direct", DIRECT_LABEL]].forEach(([value, text]) => {
                const o = document.createElement("option");
                o.value = value; o.textContent = text;
                select.appendChild(o);
            });
            select.value = "matrix";
        }
        // Direct wiring is only offered when every key gets a pin of its own.
        function offerDirect(select, keys, freePins) {
            const o = select && Array.from(select.children || []).find(c => c.value === "direct");
            if (!o) return;
            const fits = keys <= freePins;
            o.disabled = !fits && select.value !== "direct";
            o.textContent = DIRECT_LABEL + (!keys ? "" : fits ? ` (${keys} keys, ${freePins} free pins)`
                : ` — ✗ ${keys} keys, only ${freePins} free pins`);
        }
        // KLE modal: count the pasted keys (per half on a split) against the chosen board.
        function updateKleWiringOffer() {
            if (!kleWiringSelect) return;
            let layout;
            try { layout = parseKle(kleInput.value.trim()); } catch (e) { layout = []; }
            const choice = parseBoardChoice(kleBoardSelect.value);
            let keys = layout.length;
            if (choice.split && keys) { const h = findHalves(layout); keys = Math.max(h.leftHalves.length, h.rightHalves.length); }
            const free = choice.id === "auto"
                ? Math.max(0, ...Object.keys(BOARD_META).filter(id => !isZmkOnly(id)).map(id => freePinsOf(id, choice.split).length))
                : freePinsOf(choice.id, choice.split).length;
            offerDirect(kleWiringSelect, keys, free);
        }
        fillWiringSelect(wiringSelect);
        fillWiringSelect(kleWiringSelect);
        fillBoardSelect(boardSelect, { withJson: true, withAuto: false });
        fillBoardSelect(kleBoardSelect, { withJson: false, withAuto: true });
        if (kleInput) kleInput.addEventListener('input', updateKleWiringOffer);
        if (kleBoardSelect) kleBoardSelect.addEventListener('change', updateKleWiringOffer);

        if (importKleBtn) {
            importKleBtn.addEventListener('click', () => {
                updateKleWiringOffer();
                kleModal.style.display = 'flex';
            });
        }
        
        if (closeKleModalBtn) {
            closeKleModalBtn.addEventListener('click', () => {
                kleModal.style.display = 'none';
            });
        }

        if (fetchQmkBtn) {
            fetchQmkBtn.addEventListener('click', async () => {
                const kbName = qmkSearch.value.trim();
                if (!kbName) return;
                try {
                    fetchQmkBtn.innerText = "⏳";
                    const response = await fetch(`https://keyboards.qmk.fm/v1/keyboards/${kbName}/info.json`);
                    if (!response.ok) throw new Error("Keyboard not found on QMK API");
                    const data = await response.json();
                    
                    if (data.keyboards && data.keyboards[kbName]) {
                        currentJSON = data.keyboards[kbName];
                        
                        // Auto-detect MCU profile based on matrix pins if currently set to "Read Pins from JSON"
                        if (boardSelect.value === "json_file" && currentJSON.matrix_pins && currentJSON.matrix_pins.rows && currentJSON.matrix_pins.cols) {
                            const jRows = currentJSON.matrix_pins.rows;
                            const jCols = currentJSON.matrix_pins.cols;
                            for (const [profileId, profile] of Object.entries(boardProfiles)) {
                                const rowsMatch = jRows.every(r => profile.rows.includes(r));
                                const colsMatch = jCols.every(c => profile.cols.includes(c));
                                if (rowsMatch && colsMatch) {
                                    boardSelect.value = boardChoiceValue(profileId, !!(currentJSON.split && (currentJSON.split.enabled ?? true)));
                                    break;
                                }
                            }
                        }
                        if (boardSelect.value === "json_file") detectDirectBoard(currentJSON);
                        
                        if (fetchKeymapBtn) fetchKeymapBtn.style.display = 'inline-block';
                        
                        renderKeyboard();
                    } else {
                        throw new Error("Invalid format returned from QMK API");
                    }
                } catch (err) {
                    alert(err.message);
                } finally {
                    fetchQmkBtn.innerText = "Fetch";
                }
            });
        }

        if (fetchKeymapBtn) {
            fetchKeymapBtn.addEventListener('click', async () => {
                const kbName = qmkSearch.value.trim();
                if (!kbName) return;
                try {
                    fetchKeymapBtn.innerText = "⏳";
                    // Attempt to fetch default keymap.c from qmk_firmware repo
                    const rawUrl = `https://raw.githubusercontent.com/qmk/qmk_firmware/master/keyboards/${kbName}/keymaps/default/keymap.c`;
                    const response = await fetch(rawUrl);
                    if (!response.ok) {
                        throw new Error("Default keymap.c not found for this keyboard on QMK master branch.");
                    }
                    const cCode = await response.text();
                    parseKeymapC(cCode);
                    renderKeyboard();
                    alert("Successfully fetched and parsed default keymap.c!");
                } catch (err) {
                    alert(err.message);
                } finally {
                    fetchKeymapBtn.innerText = "⬇️ Fetch";
                }
            });
        }
        
        if (processKleBtn) {
            processKleBtn.addEventListener('click', () => {
                let rawText = kleInput.value.trim();
                if (!rawText) return;
                
                try {
                    const physicalLayout = parseKle(rawText);

                    // ----------------------------------------------------
                    // GRID ROUTER: Assigns matrix coords by physical Y-bands (rows)
                    // and global X-bands (cols), matching real handwiring schematics.
                    // Rule: Rows = horizontal buses (same Y band), 
                    //        Cols = vertical chains (same X band, full board width)
                    // ----------------------------------------------------
                    function gridRoute(keys, startRowOffset, startColOffset) {
                        const ROW_TOLERANCE = 0.7; // Keys within 0.7u vertically = same row
                        const COL_TOLERANCE = 0.55; // Keys within 0.55u horizontally = same column

                        // --- STEP 1: Assign ROWS by Y-band clustering ---
                        let rowBuckets = [];
                        [...keys]
                            .sort((a, b) => (a.cy || (a.y||0)+0.5) - (b.cy || (b.y||0)+0.5))
                            .forEach(key => {
                                const kcy = key.cy || (key.y||0) + (key.h||1)/2;
                                let bucket = rowBuckets.find(b => Math.abs(b.avgY - kcy) < ROW_TOLERANCE);
                                if (bucket) {
                                    bucket.keys.push(key);
                                    bucket.avgY = bucket.keys.reduce((s,k) => s + (k.cy||(k.y||0)+(k.h||1)/2), 0) / bucket.keys.length;
                                } else {
                                    rowBuckets.push({ avgY: kcy, keys: [key] });
                                }
                            });
                        rowBuckets.sort((a, b) => a.avgY - b.avgY);
                        rowBuckets.forEach((bucket, rIdx) => {
                            bucket.keys.forEach(k => k.matrixRow = startRowOffset + rIdx);
                        });

                        // --- STEP 2: Assign COLS by global X-band clustering (full board width) ---
                        let colBuckets = [];
                        [...keys]
                            .sort((a, b) => (a.cx || (a.x||0)+0.5) - (b.cx || (b.x||0)+0.5))
                            .forEach(key => {
                                const kcx = key.cx || (key.x||0) + (key.w||1)/2;
                                let bucket = colBuckets.find(b => Math.abs(b.avgX - kcx) < COL_TOLERANCE);
                                if (bucket) {
                                    bucket.keys.push(key);
                                    bucket.avgX = bucket.keys.reduce((s,k) => s + (k.cx||(k.x||0)+(k.w||1)/2), 0) / bucket.keys.length;
                                } else {
                                    colBuckets.push({ avgX: kcx, keys: [key] });
                                }
                            });
                        colBuckets.sort((a, b) => a.avgX - b.avgX);
                        colBuckets.forEach((bucket, cIdx) => {
                            bucket.keys.forEach(k => k.matrixCol = startColOffset + cIdx);
                        });

                        // --- STEP 3: Check for duplicate [row,col] and resolve by shifting col ---
                        let seen = new Map();
                        keys.forEach(k => {
                            let coordKey = `${k.matrixRow},${k.matrixCol}`;
                            if (seen.has(coordKey)) {
                                // Shift col right until we find a free slot
                                let newCol = k.matrixCol + 1;
                                while (seen.has(`${k.matrixRow},${newCol}`)) newCol++;
                                k.matrixCol = newCol;
                                if (newCol >= colBuckets.length + startColOffset) colBuckets.push({ avgX: 999, keys: [k] });
                                coordKey = `${k.matrixRow},${k.matrixCol}`;
                            }
                            seen.set(coordKey, k);
                            k.matrix = [k.matrixRow, k.matrixCol];
                        });

                        return { numRows: rowBuckets.length, numCols: colBuckets.length };
                    }

                    // Check if the user manually mapped the matrix via KLE labels
                    let manualKeys = physicalLayout.filter(k => k.matrixOverride !== null);
                    let isManualRouting = manualKeys.length === physicalLayout.length;

                    numLogicalRows = 0;
                    numLogicalCols = 0;
                    let perHalfRows = 0; // Only meaningful for split keyboards (rows per MCU)

                    const kleChoice = parseBoardChoice(kleBoardSelect.value);
                    const isSplit = kleChoice.split;
                    lastKleText = rawText;

                    const { leftHalves, rightHalves } = findHalves(physicalLayout);

                    if (isManualRouting) {
                        // User explicitly provided "Row,Col" for every key in the KLE (kle-ng style)
                        physicalLayout.forEach(k => {
                            k.matrix = k.matrixOverride;
                            k.matrixRow = k.matrix[0];
                            k.matrixCol = k.matrix[1];
                            if (k.matrix[0] >= numLogicalRows) numLogicalRows = k.matrix[0] + 1;
                            if (k.matrix[1] >= numLogicalCols) numLogicalCols = k.matrix[1] + 1;
                        });
                        if (isSplit) {
                            // QMK split convention: right-half rows start at rows-per-half.
                            perHalfRows = Math.ceil(numLogicalRows / 2);
                            numLogicalRows = perHalfRows * 2;
                        }
                    } else if (isSplit) {
                        // SPLIT keyboard: route each half independently.
                        // Left half:  rows 0..R-1,  cols 0..C
                        // Right half: rows R..2R-1, cols 0..C  (SAME column indices, new row range)
                        // R = the larger half's row count, so both MCUs share one row-pin list.
                        if (manualKeys.length > 0) {
                            alert(`Notice: Found ${manualKeys.length} keys with manual matrix labels, but not all keys were labeled. Falling back to Auto-Router.`);
                        }
                        let resLeft  = gridRoute(leftHalves,  0, 0);
                        let resRight = gridRoute(rightHalves, 0, 0);
                        perHalfRows = Math.max(resLeft.numRows, resRight.numRows);
                        // Both controllers run the same pin list (QMK MATRIX_ROW/COL_PINS). "Mirrored":
                        // the right half's OUTER column is col 0 like the left's, so each pin wires to
                        // the matching column of a mirror-image half. "Same direction": col 0 is the
                        // leftmost column on both halves.
                        const mirrorRight = !rightHalfWiring || rightHalfWiring.value !== "same";
                        renumberColsByPosition(leftHalves, false);
                        const rightCols = renumberColsByPosition(rightHalves, mirrorRight);
                        rightHalves.forEach(k => {
                            k.matrixRow += perHalfRows;
                            k.matrix = [k.matrixRow, k.matrixCol];
                        });
                        numLogicalRows = perHalfRows * 2;
                        numLogicalCols = Math.max(resLeft.numCols, rightCols);
                    } else {
                        // MONOLITHIC layout (Alice, standard TKL, etc.): route the full board as one piece.
                        if (manualKeys.length > 0) {
                            alert(`Notice: Found ${manualKeys.length} keys with manual matrix labels, but not all keys were labeled. Falling back to Auto-Router.`);
                        }
                        let res = gridRoute(physicalLayout, 0, 0);
                        numLogicalRows = res.numRows;
                        numLogicalCols = renumberColsByPosition(physicalLayout, false);
                    }

                    // For split keyboards, each MCU only needs perHalfRows + numLogicalCols pins.
                    // For monolithic, each MCU needs numLogicalRows + numLogicalCols pins.
                    const pinsPerMCU = isSplit ? (perHalfRows + numLogicalCols) : (numLogicalRows + numLogicalCols);
                    // Direct wiring: one pin per key on each controller instead.
                    const direct = kleWiringSelect && kleWiringSelect.value === 'direct';
                    const rightKeys = isSplit ? physicalLayout.filter(k => k.matrix[0] >= perHalfRows).length : 0;
                    const keysPerMCU = Math.max(physicalLayout.length - rightKeys, rightKeys);

                    // Target Board Selection
                    let bestBoard = "rp2040_zero"; // Default fallback
                    let requiredPins = direct ? keysPerMCU : pinsPerMCU;
                    let foundFit = false;
                    
                    const explicitBoard = kleChoice.id;
                    // On a wired split, one pin per half carries the TRRS link and can't be in the matrix.
                    const linkPinOf = id => (isSplit && BOARD_META[id] && BOARD_META[id].link === "trrs") ? BOARD_META[id].splitPin : null;
                    const matrixPool = id => freePinsOf(id, isSplit);
                    
                    if (explicitBoard !== "auto") {
                        bestBoard = explicitBoard;
                        foundFit = !!boardProfiles[bestBoard] && matrixPool(bestBoard).length >= requiredPins;
                    } else {
                        // Auto-select: the smallest QMK/Vial board whose free pins fit the matrix.
                        const fits = Object.keys(boardProfiles)
                            .filter(id => BOARD_META[id] && !isZmkOnly(id) && matrixPool(id).length >= requiredPins)
                            .sort((a, b) => matrixPool(a).length - matrixPool(b).length);
                        if (fits.length) { bestBoard = fits[0]; foundFit = true; }
                    }

                    boardSelect.value = boardChoiceValue(bestBoard, isSplit);

                    // Pin Allocation:
                    // Split: allocate perHalfRows row pins + numLogicalCols col pins (per-MCU physical requirement)
                    // Monolithic: allocate numLogicalRows row pins + numLogicalCols col pins
                    // Direct: one pool pin per key, in matrix reading order (row by row, column by column)
                    let activeRows = [];
                    let activeCols = [];
                    let directGrids = null;
                    const linkPin = boardProfiles[bestBoard] ? linkPinOf(bestBoard) : null;
                    if (direct) {
                        directGrids = buildDirectGrids(physicalLayout, isSplit ? perHalfRows : numLogicalRows,
                            numLogicalCols, isSplit, boardProfiles[bestBoard] ? matrixPool(bestBoard) : []);
                    } else if (boardProfiles[bestBoard]) {
                        const pr = boardProfiles[bestBoard], notLink = list => list.filter(pin => pin !== linkPin);
                        ({ rows: activeRows, cols: activeCols } = allocatePins(
                            { rows: notLink(pr.rows), cols: notLink(pr.cols), pins: matrixPool(bestBoard) },
                            isSplit ? perHalfRows : numLogicalRows, numLogicalCols));
                    }

                    // Build QMK JSON
                    currentJSON = {
                        keyboard_name: "Auto-Routed KLE Board",
                        manufacturer: "Custom Handwired",
                        // direct wiring has no diodes, so no diode_direction
                        ...(direct ? {} : { diode_direction: "COL2ROW" }),
                        split: isSplit,
                        // how the two halves talk: TRRS serial pin (same on both halves) or wireless
                        ...(isSplit ? { split_link: BOARD_META[bestBoard] && BOARD_META[bestBoard].link === "wireless"
                            ? { type: "wireless" } : { type: "trrs", pin: linkPin } } : {}),
                        // QMK keyboard.json: matrix_pins.direct = rows of pins (null = no key there);
                        // the right half's grid is exported as split.matrix_pins.right.direct.
                        matrix_pins: direct ? { direct: directGrids[0] } : {
                            rows: activeRows,
                            cols: activeCols
                        },
                        ...(direct && isSplit ? { direct_right: directGrids[1] } : {}),
                        layouts: {
                            LAYOUT: {
                                layout: physicalLayout
                            }
                        }
                    };
                    if (wiringSelect) wiringSelect.value = direct ? 'direct' : 'matrix';

                    if (!foundFit && !quietReroute) {
                        alert(direct
                            ? `Warning: direct wiring needs one pin per key: ${keysPerMCU} keys${isSplit ? ' per half' : ''}, but ${bestBoard} has only ${boardProfiles[bestBoard] ? matrixPool(bestBoard).length : 0} free pins. Keys without a pin are marked N/A — use a diode matrix (${pinsPerMCU} pins) instead.`
                            : `Warning: This layout requires ${perHalfRows} rows and ${numLogicalCols} columns per MCU (${requiredPins} pins). We selected ${bestBoard}, but it does not have enough pins!`);
                    }

                    currentJSON._source = 'kle';
                    kleModal.style.display = 'none';
                    renderKeyboard();
                    exportVialZipBtn.style.display = 'inline-block';
                    if (!quietReroute) alert("KLE layout successfully imported and auto-routed!");

                } catch (e) {
                    alert("Error parsing KLE data: " + e.message);
                }
            });
        }


        uploadInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    currentJSON = JSON.parse(event.target.result);
                    
                    // Auto-detect MCU profile based on matrix pins if currently set to "Read Pins from JSON"
                    if (boardSelect.value === "json_file" && currentJSON.matrix_pins && currentJSON.matrix_pins.rows && currentJSON.matrix_pins.cols) {
                        const jRows = currentJSON.matrix_pins.rows;
                        const jCols = currentJSON.matrix_pins.cols;
                        for (const [profileId, profile] of Object.entries(boardProfiles)) {
                            // Check if the uploaded JSON pins are a subset of a known MCU profile
                            const rowsMatch = jRows.every(r => profile.rows.includes(r));
                            const colsMatch = jCols.every(c => profile.cols.includes(c));
                            if (rowsMatch && colsMatch) {
                                boardSelect.value = boardChoiceValue(profileId, !!(currentJSON.split && (currentJSON.split.enabled ?? true)));
                                break; // Found a match, stop looking
                            }
                        }
                    }
                    if (boardSelect.value === "json_file") detectDirectBoard(currentJSON);

                    renderKeyboard();
                } catch (err) {
                    alert("Error parsing JSON. Make sure it is a valid QMK configuration file.");
                }
            };
            reader.readAsText(file);
        });

        if (keymapUpload) {
            keymapUpload.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = function(event) {
                    parseKeymapC(event.target.result);
                    renderKeyboard();
                };
                reader.readAsText(file);
            });
        }

        if (layerSelect) {
            layerSelect.addEventListener('change', renderKeyboard);
        }

        const keycodeMap = {
            "KC_TRNS": "▽", "KC_NO": " ", "KC_TRANSPARENT": "▽",
            "KC_ESC": "ESC", "KC_TAB": "TAB", "KC_SPC": "SPACE", "KC_ENT": "ENTER",
            "KC_BSPC": "BACKSPACE", "KC_DEL": "DEL", "KC_INS": "INS",
            "KC_LCTL": "CTRL", "KC_RCTL": "CTRL", "KC_LSFT": "SHIFT", "KC_RSFT": "SHIFT",
            "KC_LALT": "ALT", "KC_RALT": "ALT", "KC_LGUI": "GUI", "KC_RGUI": "GUI",
            "KC_GRV": "`", "KC_1": "1", "KC_2": "2", "KC_3": "3", "KC_4": "4", "KC_5": "5",
            "KC_6": "6", "KC_7": "7", "KC_8": "8", "KC_9": "9", "KC_0": "0",
            "KC_MINS": "-", "KC_EQL": "=", "KC_LBRC": "[", "KC_RBRC": "]", "KC_BSLS": "\\",
            "KC_SCLN": ";", "KC_QUOT": "'", "KC_COMM": ",", "KC_DOT": ".", "KC_SLSH": "/",
            "KC_Q": "Q", "KC_W": "W", "KC_E": "E", "KC_R": "R", "KC_T": "T", "KC_Y": "Y", "KC_U": "U", "KC_I": "I", "KC_O": "O", "KC_P": "P",
            "KC_A": "A", "KC_S": "S", "KC_D": "D", "KC_F": "F", "KC_G": "G", "KC_H": "H", "KC_J": "J", "KC_K": "K", "KC_L": "L",
            "KC_Z": "Z", "KC_X": "X", "KC_C": "C", "KC_V": "V", "KC_B": "B", "KC_N": "N", "KC_M": "M",
            "KC_UP": "↑", "KC_DOWN": "↓", "KC_LEFT": "←", "KC_RGHT": "→",
            "KC_PGUP": "PGUP", "KC_PGDN": "PGDN", "KC_HOME": "HOME", "KC_END": "END",
            "KC_F1": "F1", "KC_F2": "F2", "KC_F3": "F3", "KC_F4": "F4", "KC_F5": "F5", "KC_F6": "F6",
            "KC_F7": "F7", "KC_F8": "F8", "KC_F9": "F9", "KC_F10": "F10", "KC_F11": "F11", "KC_F12": "F12",
            "KC_P1": "1", "KC_P2": "2", "KC_P3": "3", "KC_P4": "4", "KC_P5": "5", "KC_P6": "6", "KC_P7": "7", "KC_P8": "8", "KC_P9": "9", "KC_P0": "0",
            "KC_PLUS": "+", "KC_TILD": "~"
        };

        function humanizeKeycode(kc) {
            if (!kc) return "";
            if (keycodeMap[kc]) return keycodeMap[kc];
            let match = kc.match(/^(MO|TG|TO|TT|DF)\((\d+)\)$/);
            if (match) return `Layer ${match[2]}`;
            match = kc.match(/^LT\((\d+),\s*(.+)\)$/);
            if (match) return `${humanizeKeycode(match[2])} (L${match[1]})`;
            match = kc.match(/^MT\((.+),\s*(.+)\)$/);
            if (match) return `${humanizeKeycode(match[2])} (${match[1].replace('MOD_', '')})`;
            if (kc.startsWith("KC_")) return kc.substring(3);
            if (kc.startsWith("RGB_")) return kc.replace("RGB_", "🎨 ");
            return kc;
        }

        const zmkKeycodeMap = {
            "KC_TRNS": "&trans", "KC_NO": "&none", "KC_TRANSPARENT": "&trans",
            "KC_ESC": "&kp ESC", "KC_TAB": "&kp TAB", "KC_SPC": "&kp SPACE", "KC_ENT": "&kp RET",
            "KC_BSPC": "&kp BSPC", "KC_DEL": "&kp DEL", "KC_INS": "&kp INS",
            "KC_LCTL": "&kp LCTRL", "KC_RCTL": "&kp RCTRL", "KC_LSFT": "&kp LSHFT", "KC_RSFT": "&kp RSHFT",
            "KC_LALT": "&kp LALT", "KC_RALT": "&kp RALT", "KC_LGUI": "&kp LGUI", "KC_RGUI": "&kp RGUI",
            "KC_GRV": "&kp GRAVE", "KC_MINS": "&kp MINUS", "KC_EQL": "&kp EQUAL", "KC_LBRC": "&kp LBKT", "KC_RBRC": "&kp RBKT", "KC_BSLS": "&kp BSLH",
            "KC_SCLN": "&kp SEMI", "KC_QUOT": "&kp SQT", "KC_COMM": "&kp COMMA", "KC_DOT": "&kp DOT", "KC_SLSH": "&kp FSLH",
            "KC_UP": "&kp UP", "KC_DOWN": "&kp DOWN", "KC_LEFT": "&kp LEFT", "KC_RGHT": "&kp RIGHT",
            "KC_PGUP": "&kp PG_UP", "KC_PGDN": "&kp PG_DN", "KC_HOME": "&kp HOME", "KC_END": "&kp END",
            "KC_PLUS": "&kp KP_PLUS", "KC_TILD": "&kp TILDE"
        };

        function translateToZmk(kc) {
            if (!kc) return "&none";
            if (zmkKeycodeMap[kc]) return zmkKeycodeMap[kc];
            
            // Handle letters and numbers directly (KC_A -> &kp A)
            if (kc.match(/^KC_[A-Z0-9]$/)) {
                return `&kp ${kc.substring(3)}`;
            }
            if (kc.match(/^KC_F\d+$/)) {
                return `&kp ${kc.substring(3)}`;
            }
            
            // Handle MO(x)
            let match = kc.match(/^MO\((\d+)\)$/);
            if (match) return `&mo ${match[1]}`;
            
            // Handle LT(layer, key)
            match = kc.match(/^LT\((\d+),\s*(.+)\)$/);
            if (match) return `&lt ${match[1]} ${translateToZmk(match[2]).replace('&kp ', '')}`;
            
            // Handle MT(mod, key)
            match = kc.match(/^MT\((.+),\s*(.+)\)$/);
            if (match) {
                let mod = match[1].replace('MOD_', '');
                if (mod === 'LSFT') mod = 'LS';
                else if (mod === 'RSFT') mod = 'RS';
                else if (mod === 'LCTL') mod = 'LC';
                else if (mod === 'RCTL') mod = 'RC';
                else if (mod === 'LALT') mod = 'LA';
                else if (mod === 'RALT') mod = 'RA';
                else if (mod === 'LGUI') mod = 'LG';
                else if (mod === 'RGUI') mod = 'RG';
                return `&mt ${mod}(${translateToZmk(match[2]).replace('&kp ', '')}) ${translateToZmk(match[2]).replace('&kp ', '')}`;
            }

            // Fallback for unmapped codes
            return kc;
        }

        function splitArgs(str) {
            const args = [];
            let current = '';
            let depth = 0;
            let inLineComment = false;
            let inBlockComment = false;
            for (let i = 0; i < str.length; i++) {
                let char = str[i];
                let nextChar = str[i+1];
                if (inLineComment) { if (char === '\n') inLineComment = false; continue; }
                if (inBlockComment) { if (char === '*' && nextChar === '/') { inBlockComment = false; i++; } continue; }
                if (char === '/' && nextChar === '/') { inLineComment = true; i++; continue; }
                if (char === '/' && nextChar === '*') { inBlockComment = true; i++; continue; }
                if (char === '(') depth++;
                if (char === ')') depth--;
                if (char === ',' && depth === 0) {
                    args.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            if (current.trim()) args.push(current);
            return args.map(a => a.trim().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '').trim());
        }

        function parseKeymapC(cCode) {
            parsedKeymaps = {};
            layerSelect.innerHTML = '';
            let hasLayers = false;
            
            const layerRegex = /\[\s*(\d+)\s*\]\s*=\s*LAYOUT[^\(]*\(/g;
            let match;
            while ((match = layerRegex.exec(cCode)) !== null) {
                const layerIdx = match[1];
                let startIndex = layerRegex.lastIndex;
                let depth = 1;
                let endIndex = startIndex;
                
                for (let i = startIndex; i < cCode.length; i++) {
                    if (cCode[i] === '(') depth++;
                    if (cCode[i] === ')') depth--;
                    if (depth === 0) {
                        endIndex = i;
                        break;
                    }
                }
                
                const content = cCode.substring(startIndex, endIndex);
                parsedKeymaps[layerIdx] = splitArgs(content);
                const opt = document.createElement('option');
                opt.value = layerIdx;
                opt.innerText = `Layer ${layerIdx}`;
                layerSelect.appendChild(opt);
                hasLayers = true;
            }
            if (hasLayers) {
                layerSelect.style.display = 'inline-block';
            } else {
                layerSelect.style.display = 'none';
                parsedKeymaps = null;
                alert("Could not find any LAYOUT macros in keymap.c");
            }
        }

        // Changing the board re-routes an imported KLE layout for that board / keyboard type;
        // a QMK file keeps its own wiring and pins.
        function rerouteForBoard() {
            if (currentJSON && currentJSON._source === 'kle' && lastKleText && boardSelect.value !== 'json_file') {
                kleBoardSelect.value = boardSelect.value;
                if (wiringSelect && kleWiringSelect) kleWiringSelect.value = wiringSelect.value;
                kleInput.value = lastKleText;
                quietReroute = true;
                try { processKleBtn.click(); } finally { quietReroute = false; }
            } else {
                renderKeyboard();
            }
        }
        boardSelect.addEventListener('change', rerouteForBoard);
        if (rightHalfWiring) rightHalfWiring.addEventListener('change', rerouteForBoard);
        if (wiringSelect) wiringSelect.addEventListener('change', rerouteForBoard);
        showWiringCheckbox.addEventListener('change', renderKeyboard);

        viewToggle.addEventListener('click', () => {
            isBottomView = !isBottomView;
            if(isBottomView) {
                viewToggle.innerText = "🛠️ View: Bottom (Wiring/Solder)";
                viewToggle.style.background = "var(--bottom-view)";
                viewToggle.style.color = "#11111b";
                stage.style.border = "2px dashed var(--bottom-view)";
                showWiringCheckbox.checked = true; // Auto-enable in bottom view
            } else {
                viewToggle.innerText = "👀 View: Top (Keycaps)";
                viewToggle.style.background = "var(--key-bg)";
                viewToggle.style.color = "var(--text-main)";
                stage.style.border = "none";
                showWiringCheckbox.checked = false; // Auto-disable in top view
            }
            renderKeyboard();
        });

        const amoebaToggle = document.getElementById('amoebaToggle');
        const amoebaLegend = document.getElementById('amoebaLegend');
        if (amoebaToggle) {
            amoebaToggle.addEventListener('change', () => {
                // Amoebas are wired on the solder side: jump to the bottom view with wiring on.
                if (amoebaToggle.checked && !isBottomView) viewToggle.click();
                else renderKeyboard();
            });
        }

        // Layer switches + size slider for the Amoeba view (static in cubify.html).
        const amoebaLayerBar = document.getElementById('amoebaLayerBar');
        const amoebaZoom = document.getElementById('amoebaZoom');
        const amoebaZoomLabel = document.getElementById('amoebaZoomLabel');
        const AMOEBA_LAYER_IDS = { rows: 'amoebaShowRows', cols: 'amoebaShowCols', led: 'amoebaShowLed', power: 'amoebaShowPower', pads: 'amoebaShowPads' };
        const amoebaLayers = () => Object.fromEntries(Object.entries(AMOEBA_LAYER_IDS)
            .map(([k, id]) => [k, !!(document.getElementById(id) && document.getElementById(id).checked)]));
        Object.values(AMOEBA_LAYER_IDS).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', renderKeyboard);
        });
        if (amoebaZoom) amoebaZoom.addEventListener('input', renderKeyboard);
        let amoebaSvg = null; // last drawn Amoeba layer, for hover highlighting

        // Hover: keep the key's row, column and LED in/out bright, fade everything else.
        function amoebaHighlight(g) {
            if (!amoebaSvg) return;
            const kids = Array.from(amoebaSvg.children);
            if (!g) { kids.forEach(el => { el.style.opacity = ''; }); return; }
            const attr = (el, k) => el.getAttribute ? el.getAttribute(k) : (el.attrs || {})[k];
            const keep = new Set([String(g.index)]);
            const wanted = el => {
                const w = attr(el, 'data-wire');
                if (!w) return false;
                if (w === `row:${g.side}:${g.normRow}` || w === `col:${g.side}:${g.c}`) return true;
                return /^(led|vdd|vss):/.test(w) && (attr(el, 'data-from') === String(g.index) || attr(el, 'data-to') === String(g.index));
            };
            kids.forEach(el => { if (wanted(el)) { keep.add(attr(el, 'data-from')); keep.add(attr(el, 'data-to')); } });
            kids.forEach(el => {
                const owner = attr(el, 'data-key') ?? attr(el, 'data-amoeba') ?? attr(el, 'data-led-key');
                const on = attr(el, 'data-wire') ? wanted(el) : keep.has(owner);
                el.style.opacity = on ? '1' : '0.12';
            });
        }

        // First pool pin the matrix doesn't use: drives the LED chain's first DIN.
        // Where the LED chain's + and − come from on each controller (SK6812MINI wants ~5 V).
        const LED_SUPPLY = {
            waveshare_2040_plus: { vdd: "VBUS (pin 40)", vss: "GND (pin 38)", vddShort: "VBUS p40", vssShort: "GND p38" },
            rp2040_zero: { vdd: "5V", vss: "GND" },
            rp2040_tiny: { vdd: "5V", vss: "GND" },
            pro_micro: { vdd: "VCC", vss: "GND" },
            nice_nano: { vdd: "VCC (P0.13 switched)", vss: "GND", vddShort: "VCC", vssShort: "GND" },
            nrf52840_nicenano_clone: { vdd: "VCC (P0.13 switched)", vss: "GND", vddShort: "VCC", vssShort: "GND" },
        };
        const ledSupply = profileId => LED_SUPPLY[profileId] || { vdd: "5V", vss: "GND" };

        function pickLedPin(profileId, activeRows, activeCols) {
            const profile = boardProfiles[profileId];
            const used = new Set([...activeRows, ...activeCols]);
            const pool = profile ? (profile.pins || [...profile.rows, ...profile.cols]) : [];
            return pool.find(p => !used.has(p)) || null;
        }

        // Draw every key as an Amoeba Royale board and wire nets pad-to-pad.
        // keyGeo: [{index, cx, cy, rot, side, normRow, c}] in draw (bottom-view) pixels.
        function drawAmoebaLayer(svg, keyGeo, activeRows, ledPin, pinColor, layers, supply) {
            supply = supply || { vdd: "5V", vss: "GND" };
            layers = layers || { rows: true, cols: true, led: true, power: true, pads: true };
            const NS = "http://www.w3.org/2000/svg";
            const s = UNIT_SIZE / 19.05; // px per mm
            const padsOf = {};
            keyGeo.forEach(k => {
                // Bottom view mirrors X, so a key rotated +r on top is rotated -r here.
                const a = -(k.rot || 0) * Math.PI / 180;
                const place = (xp, yp) => {
                    const dx = (xp / 100 - 0.5) * AMOEBA.wMM * s, dy = (yp / 100 - 0.5) * AMOEBA.hMM * s;
                    return { x: k.cx + dx * Math.cos(a) - dy * Math.sin(a), y: k.cy + dx * Math.sin(a) + dy * Math.cos(a) };
                };
                const board = document.createElementNS(NS, "polygon");
                board.setAttribute("points", [[0, 0], [100, 0], [100, 100], [0, 100]]
                    .map(([x, y]) => { const p = place(x, y); return `${p.x},${p.y}`; }).join(" "));
                board.setAttribute("fill", "rgba(17, 17, 27, 0.55)");
                board.setAttribute("stroke", "#585b70");
                board.setAttribute("stroke-width", "1");
                board.setAttribute("data-amoeba", k.index);
                svg.appendChild(board);
                padsOf[k.index] = AMOEBA.pads.map(p => ({ net: p.net, used: false, ...place(p.x, p.y) }));
            });

            // pts.length === 2 → straight <line>; longer → routed <polyline> (end points stay on pads).
            const line = (pts, color, width, dash, attrs) => {
                const [a, b] = [pts[0], pts[pts.length - 1]];
                const l = document.createElementNS(NS, pts.length === 2 ? "line" : "polyline");
                if (pts.length === 2) {
                    l.setAttribute("x1", a.x); l.setAttribute("y1", a.y);
                    l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
                } else {
                    l.setAttribute("points", pts.map(p => `${p.x},${p.y}`).join(" "));
                    l.setAttribute("fill", "none");
                    l.setAttribute("stroke-linejoin", "round");
                }
                l.setAttribute("stroke", color);
                l.setAttribute("stroke-width", width);
                l.setAttribute("stroke-linecap", "round");
                if (dash) l.setAttribute("stroke-dasharray", dash);
                Object.entries(attrs).forEach(([k, v]) => l.setAttribute(k, v));
                return l;
            };
            // Nearest pad pair between two keys (pads of one net are joined inside each board).
            const link = (ka, netA, kb, netB) => {
                let best = null;
                padsOf[ka].filter(p => p.net === netA).forEach(pa =>
                    padsOf[kb].filter(p => p.net === netB).forEach(pb => {
                        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
                        if (!best || d < best.d) best = { a: pa, b: pb, d };
                    }));
                return best;
            };
            // Readability rules (also enforced by tests/amoeba.test.js):
            //  1. Dead zone: two wires running side by side (within 30° of parallel) keep CLEARANCE
            //     px between their EDGES (stroke widths included). Crossing at an angle is fine.
            //  2. Pads: a wire only touches the pads at its own two ends; it stays PAD_CLEARANCE px
            //     clear of every other pad (used or not — it's bare copper on the real board).
            // Long jumps, and any wire that would break a rule, are routed down → across → down
            // (or across → down → across) in the nearest lane that keeps both rules.
            const CLEARANCE = 2;                 // drawing px; ×2 on screen at the default 200% size
            const LANE_BAND = 0.6 * UNIT_SIZE;   // reaches the pad-free middle of the boards
            const END_SKIP = 4;                  // pads: wires of one board meet near them anyway
            const PARALLEL = Math.cos(30 * Math.PI / 180);
            const PAD_R = AMOEBA.padMM / 2 * s, PAD_CLEARANCE = 1; // true-scale 1.5 mm wire pads
            // Spatial grid so each check only looks at nearby pads and wires.
            const CELL = 24, grid = new Map();
            const cellsOf = (x1, y1, x2, y2) => {
                const out = [];
                for (let gx = Math.floor(Math.min(x1, x2) / CELL); gx <= Math.floor(Math.max(x1, x2) / CELL); gx++)
                    for (let gy = Math.floor(Math.min(y1, y2) / CELL); gy <= Math.floor(Math.max(y1, y2) / CELL); gy++)
                        out.push(gx + "," + gy);
                return out;
            };
            const addToGrid = (item, x1, y1, x2, y2) => cellsOf(x1, y1, x2, y2).forEach(c => {
                if (!grid.has(c)) grid.set(c, []);
                grid.get(c).push(item);
            });
            const nearby = (x1, y1, x2, y2, pad) => {
                const seen = new Set();
                cellsOf(Math.min(x1, x2) - pad, Math.min(y1, y2) - pad, Math.max(x1, x2) + pad, Math.max(y1, y2) + pad)
                    .forEach(c => (grid.get(c) || []).forEach(i => seen.add(i)));
                return [...seen];
            };
            Object.values(padsOf).flat().forEach(pd => addToGrid({ pad: pd }, pd.x, pd.y, pd.x, pd.y));
            const addObstacle = seg => addToGrid({ seg }, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
            const distToSeg = (x, y, s) => {
                const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = dx * dx + dy * dy || 1;
                const t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / L));
                return Math.hypot(x - s.a.x - t * dx, y - s.a.y - t * dy);
            };
            // Cost of p→q (stroke width w) for wire `id`: 100 per foreign pad it passes over, plus
            // the length it runs inside another wire's dead zone. 0 = keeps both rules.
            const clash = (p, q, w, ends, id) => {
                const len = Math.hypot(q.x - p.x, q.y - p.y);
                if (len < 0.5) return 0;
                const padLim = w / 2 + PAD_R + PAD_CLEARANCE;
                const seg = { a: p, b: q };
                const ux = (q.x - p.x) / len, uy = (q.y - p.y) / len;
                let cost = 0;
                const lines = [];
                for (const it of nearby(p.x, p.y, q.x, q.y, padLim + 3)) {
                    if (it.pad) {
                        if (!ends.includes(it.pad) && distToSeg(it.pad.x, it.pad.y, seg) < padLim) cost += 100;
                        continue;
                    }
                    const o = it.seg;
                    if (o.id === id) continue; // pieces of one wire meet at their pads
                    const ol = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y);
                    if (ol < 0.5 || Math.abs(((o.b.x - o.a.x) * ux + (o.b.y - o.a.y) * uy) / ol) < PARALLEL) continue;
                    lines.push(o);
                }
                if (lines.length) {
                    const n = Math.max(2, Math.ceil(len / 1.5));
                    for (let i = 0; i <= n; i++) {
                        const x = p.x + (q.x - p.x) * i / n, y = p.y + (q.y - p.y) * i / n;
                        if (ends.some(e => Math.hypot(x - e.x, y - e.y) < END_SKIP)) continue;
                        if (lines.some(o => distToSeg(x, y, o) < (w + o.w) / 2 + CLEARANCE)) cost += len / n;
                    }
                }
                return cost;
            };
            const pathClash = (pts, w, id) => {
                const ends = [pts[0], pts[pts.length - 1]];
                let total = 0;
                for (let j = 0; j < pts.length - 1; j++) total += clash(pts[j], pts[j + 1], w, ends, id);
                return total;
            };
            // Nearest lane (1 px steps) that keeps the dead zone; down→across→down first, then
            // across→down→across (for pads stacked on one edge, e.g. LED + above LED −).
            const pathLen = pts => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
            // All down→across→down and across→down→across lanes (1 px steps, up to 1.2u from the
            // middle); of those that keep both rules, the SHORTEST wins — no hooks past the pads.
            const dogleg = (a, b, w, id) => {
                let best = null, bestOk = null;
                const tryPts = pts => {
                    const len = pathLen(pts);
                    if (bestOk && len >= bestOk.len) return; // can't beat the shortest clean route
                    const c = pathClash(pts, w, id);
                    if (c <= 0.5) { if (!bestOk || len < bestOk.len) bestOk = { pts, c, len }; }
                    else if (!best || c < best.c) best = { pts, c, len };
                };
                const midY = (a.y + b.y) / 2, midX = (a.x + b.x) / 2, R = 1.2 * UNIT_SIZE;
                for (let d = 0; d <= R; d += 1)
                    for (const v of d ? [d, -d] : [0]) {
                        tryPts([a, { x: a.x, y: midY + v }, { x: b.x, y: midY + v }, b]);
                        tryPts([a, { x: midX + v, y: a.y }, { x: midX + v, y: b.y }, b]);
                    }
                return bestOk || best;
            };
            // Fallback maze router (A* on a 2 px grid) for spots no simple shape can get through.
            // Foreign pads are hard walls (a wire over a pad could short on the real board). Running
            // along another wire inside its dead zone is only expensive (readability), so in a spot
            // too tight for both rules the wire still stays off every pad. Crossing at right angles
            // is free.
            const maze = (a, b, w, id) => {
                const G = 2, margin = 1.2 * UNIT_SIZE;
                const x0 = Math.min(a.x, b.x) - margin, y0 = Math.min(a.y, b.y) - margin;
                const W = Math.ceil((Math.abs(a.x - b.x) + 2 * margin) / G) + 1;
                const H = Math.ceil((Math.abs(a.y - b.y) + 2 * margin) / G) + 1;
                const wall = new Uint8Array(W * H), noH = new Uint8Array(W * H), noV = new Uint8Array(W * H);
                const mark = (arr, sx1, sy1, sx2, sy2, lim, near) => {
                    const i1 = Math.max(0, Math.floor((Math.min(sx1, sx2) - lim - x0) / G)), i2 = Math.min(W - 1, Math.ceil((Math.max(sx1, sx2) + lim - x0) / G));
                    const j1 = Math.max(0, Math.floor((Math.min(sy1, sy2) - lim - y0) / G)), j2 = Math.min(H - 1, Math.ceil((Math.max(sy1, sy2) + lim - y0) / G));
                    for (let j = j1; j <= j2; j++) for (let i = i1; i <= i2; i++)
                        if (near(x0 + i * G, y0 + j * G)) arr[j * W + i] = 1;
                };
                const padLim = w / 2 + PAD_R + PAD_CLEARANCE + 0.4;
                for (const it of nearby(x0, y0, x0 + W * G, y0 + H * G, 0)) {
                    if (it.pad) {
                        if (it.pad === a || it.pad === b) continue;
                        const pd = it.pad;
                        mark(wall, pd.x, pd.y, pd.x, pd.y, padLim, (x, y) => Math.hypot(x - pd.x, y - pd.y) < padLim);
                        continue;
                    }
                    const o = it.seg;
                    if (o.id === id) continue;
                    const ang = Math.abs(Math.atan2(o.b.y - o.a.y, o.b.x - o.a.x)) * 180 / Math.PI;
                    const axisH = ang <= 30 || ang >= 150, axisV = ang >= 60 && ang <= 120;
                    if (!axisH && !axisV) continue;
                    const lim = (w + o.w) / 2 + CLEARANCE + 0.4;
                    mark(axisH ? noH : noV, o.a.x, o.a.y, o.b.x, o.b.y, lim, (x, y) =>
                        distToSeg(x, y, o) < lim && Math.hypot(x - a.x, y - a.y) >= END_SKIP && Math.hypot(x - b.x, y - b.y) >= END_SKIP);
                }
                const cell = p => [Math.round((p.x - x0) / G), Math.round((p.y - y0) / G)];
                const [si, sj] = cell(a), [ti, tj] = cell(b);
                const start = sj * W + si, goal = tj * W + ti;
                wall[start] = wall[goal] = 0;
                // state = cell * 4 + direction (0 → 1 ← 2 ↓ 3 ↑); bends cost extra to keep paths straight
                const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]], BEND = 8, CROWD = 40;
                const dist = new Float32Array(W * H * 4).fill(Infinity), prev = new Int32Array(W * H * 4).fill(-1);
                const heap = [];
                const push = (st, d, f) => { heap.push([f, d, st]); let i = heap.length - 1;
                    while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
                const pop = () => { const top = heap[0], last = heap.pop();
                    if (heap.length) { heap[0] = last; let i = 0;
                        for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
                            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
                            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
                            if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } }
                    return top; };
                const hcost = c => (Math.abs(c % W - ti) + Math.abs(Math.floor(c / W) - tj)) * G;
                for (let d = 0; d < 4; d++) { dist[start * 4 + d] = 0; push(start * 4 + d, 0, hcost(start)); }
                let found = -1, steps = 0;
                while (heap.length && steps++ < 200000) {
                    const [, dcur, st] = pop();
                    if (dcur > dist[st]) continue;
                    const c = st >> 2, dir = st & 3;
                    if (c === goal) { found = st; break; }
                    const ci = c % W, cj = Math.floor(c / W);
                    for (let nd = 0; nd < 4; nd++) {
                        const ni = ci + DIRS[nd][0], nj = cj + DIRS[nd][1];
                        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
                        const nc = nj * W + ni;
                        if (wall[nc]) continue;
                        const crowd = (nd < 2 ? noH[nc] : noV[nc]) ? CROWD : 0;
                        const ndist = dcur + G + crowd + (nd === dir ? 0 : BEND), ns = nc * 4 + nd;
                        if (ndist < dist[ns]) { dist[ns] = ndist; prev[ns] = st; push(ns, ndist, ndist + hcost(nc)); }
                    }
                }
                if (found < 0) return null;
                const cells = [];
                for (let st = found; st >= 0; st = prev[st]) cells.unshift(st >> 2);
                const pts = [a];
                for (let k = 1; k < cells.length - 1; k++) {
                    const p0 = cells[k - 1], p1 = cells[k], p2 = cells[k + 1];
                    if ((p1 - p0) !== (p2 - p1)) pts.push({ x: x0 + (p1 % W) * G, y: y0 + Math.floor(p1 / W) * G });
                }
                pts.push(b);
                return { pts, c: pathClash(pts, w, id) };
            };
            const straight = (a, b, w, id) => ({ pts: [a, b], c: pathClash([a, b], w, id) });
            // Every pad pair of the two nets; of the routes that keep both rules, the shortest wins
            // (so a clean straight link between facing pads beats any detour). Long jumps always
            // take a lane. If nothing simple works, the maze router tries the nearest pairs.
            const route = (ka, netA, kb, netB, kind, w, id) => {
                const pairs = [];
                padsOf[ka].filter(p => p.net === netA).forEach(pa =>
                    padsOf[kb].filter(p => p.net === netB).forEach(pb =>
                        pairs.push({ a: pa, b: pb, d: Math.hypot(pa.x - pb.x, pa.y - pb.y) })));
                pairs.sort((x, y) => x.d - y.d);
                const isLong = (a, b) => {
                    const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
                    return (kind === "col" && dx > 0.35 * UNIT_SIZE) ||
                           (kind === "led" && Math.hypot(dx, dy) > 1.3 * UNIT_SIZE && dy > 0.3 * UNIT_SIZE);
                };
                let bestOk = null, best = null;
                const consider = (r, pr) => {
                    if (!r) return;
                    const cand = { ...r, a: pr.a, b: pr.b, len: pathLen(r.pts) };
                    if (cand.c <= 0.5) { if (!bestOk || cand.len < bestOk.len) bestOk = cand; }
                    else if (!best || cand.c < best.c) best = cand; // pad hits cost 100 each, so pad-free wins
                };
                for (const pr of pairs) if (!isLong(pr.a, pr.b)) consider(straight(pr.a, pr.b, w, id), pr);
                if (bestOk) return bestOk;
                for (const pr of pairs) {
                    if (bestOk && pr.d >= bestOk.len) break; // farther pairs can't be shorter
                    consider(dogleg(pr.a, pr.b, w, id), pr);
                }
                if (bestOk) return bestOk;
                for (const pr of pairs.slice(0, 4)) consider(maze(pr.a, pr.b, w, id), pr);
                return bestOk || best;
            };
            const drawn = { vdd: [], vss: [], row: [], led: [], col: [] };
            const chain = (seq, netA, netB, color, width, dash, wire) => {
                const kind = wire.split(":")[0];
                for (let i = 0; i < seq.length - 1; i++) {
                    const b = route(seq[i].index, netA, seq[i + 1].index, netB, kind, width, wire);
                    b.a.used = b.b.used = true;
                    const pts = b.pts;
                    for (let j = 0; j < pts.length - 1; j++) addObstacle({ a: pts[j], b: pts[j + 1], w: width, id: wire });
                    drawn[kind].push(line(pts, color, width, dash, {
                        "data-wire": wire, "data-from": seq[i].index, "data-to": seq[i + 1].index,
                        "data-from-net": netA, "data-to-net": netB,
                    }));
                }
            };
            const groupBy = f => keyGeo.reduce((g, k) => ((g[f(k)] = g[f(k)] || []).push(k), g), {});

            // LED chain per half: snake through the rows (L→R, then R→L, ...). VDD/VSS follow it.
            const seqs = Object.entries(groupBy(k => k.side)).map(([side, keys]) => {
                const byRow = {};
                keys.forEach(k => (byRow[k.normRow] = byRow[k.normRow] || []).push(k));
                const seq = [];
                Object.keys(byRow).map(Number).sort((a, b) => a - b).forEach((r, i) =>
                    seq.push(...byRow[r].sort((a, b) => (i % 2 ? b.cx - a.cx : a.cx - b.cx))));
                return { side, seq };
            });

            // Routing priority: rows, LED data, columns, then power — each routes around what's
            // already there. Stacking order (appended below): power underneath, rows, LED, columns.
            // Matrix: rows along the top R pads, columns through the C pads (same colours as plain wiring).
            if (layers.rows) Object.values(groupBy(k => k.side + "_" + k.normRow)).forEach(g =>
                chain(g.sort((a, b) => a.cx - b.cx), "SR", "SR", pinColor(g[0].normRow), 3, "", `row:${g[0].side}:${g[0].normRow}`));
            if (layers.led) seqs.forEach(({ side, seq }) =>
                chain(seq, "DOUT", "DIN", AMOEBA.colors.DIN, 2, "2,3", `led:${side}`));
            if (layers.cols) Object.values(groupBy(k => k.side + "_" + k.c)).forEach(g =>
                chain(g.sort((a, b) => a.cy - b.cy), "SC", "SC", pinColor(activeRows.length + g[0].c), 3, "8,5", `col:${g[0].side}:${g[0].c}`));
            if (layers.power) seqs.forEach(({ side, seq }) => {
                chain(seq, "VDD", "VDD", AMOEBA.colors.VDD, 1.2, "", `vdd:${side}`);
                chain(seq, "VSS", "VSS", AMOEBA.colors.VSS, 1.2, "", `vss:${side}`);
            });
            ["vdd", "vss", "row", "led", "col"].forEach(k => drawn[k].forEach(el => svg.appendChild(el)));

            const chains = [];
            seqs.forEach(({ side, seq }) => {
                seq.forEach((k, n) => {
                    if (!layers.led && n > 0) return; // L0 always shows where the LED pin goes
                    const t = document.createElementNS(NS, "text");
                    t.setAttribute("x", k.cx); t.setAttribute("y", k.cy + 5);
                    t.setAttribute("text-anchor", "middle");
                    t.setAttribute("font-size", "10"); t.setAttribute("font-weight", "bold");
                    t.setAttribute("fill", AMOEBA.colors.DIN);
                    t.setAttribute("data-led", n); t.setAttribute("data-led-key", k.index); t.setAttribute("data-led-side", side);
                    t.textContent = n === 0 ? `L0 ◀ ${ledPin || "LED pin"}` : `L${n}`;
                    svg.appendChild(t);
                });
                // Power feed: label the first board's + and − pads that face away from the chain
                // (free of chain wires) with the controller pin they connect to.
                if (seq.length) {
                    const k0 = seq[0], away = seq[1] || null;
                    for (const [net, text, color] of [["VDD", `+ ${supply.vddShort || supply.vdd}`, AMOEBA.colors.VDD], ["VSS", `− ${supply.vssShort || supply.vss}`, AMOEBA.colors.VSS]]) {
                        const cands = padsOf[k0.index].filter(p => p.net === net);
                        const pad = away ? cands.reduce((m, p) => (Math.hypot(p.x - away.cx, p.y - away.cy) > Math.hypot(m.x - away.cx, m.y - away.cy) ? p : m)) : cands[0];
                        pad.used = true;
                        // Inside the board, next to the pad, reading toward the board's centre.
                        const dx = pad.x - k0.cx, edgePad = Math.abs(dx) > 5; // on the board's left/right edge
                        const t = document.createElementNS(NS, "text");
                        t.setAttribute("x", edgePad ? pad.x - Math.sign(dx) * 4.5 : pad.x);
                        t.setAttribute("y", edgePad ? pad.y + 2.3 : pad.y + (pad.y > k0.cy ? -5 : 8));
                        t.setAttribute("text-anchor", !edgePad ? "middle" : dx < 0 ? "start" : "end");
                        t.setAttribute("font-size", "6.5"); t.setAttribute("font-weight", "bold");
                        t.setAttribute("fill", color);
                        t.setAttribute("data-power-in", net); t.setAttribute("data-key", k0.index); t.setAttribute("data-led-side", side);
                        t.setAttribute("data-pad-x", pad.x); t.setAttribute("data-pad-y", pad.y);
                        t.textContent = text;
                        svg.appendChild(t);
                    }
                }
                chains.push({ side: +side, count: seq.length, first: seq[0] && seq[0].index });
            });

            // Pads on top so they stay visible. Pads with a wire are drawn bold; the rest only
            // when "Unused pads" is ticked, small and faint.
            keyGeo.forEach(k => padsOf[k.index].forEach(p => {
                if (!p.used && !layers.pads) return;
                const c = document.createElementNS(NS, "circle");
                c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", p.used ? PAD_R : PAD_R * 0.6);
                c.setAttribute("fill", AMOEBA.colors[p.net]);
                if (!p.used) c.setAttribute("fill-opacity", "0.45");
                c.setAttribute("data-pad", p.net); c.setAttribute("data-key", k.index);
                if (p.used) c.setAttribute("data-used", "1");
                svg.appendChild(c);
            }));
            return chains;
        }

        document.addEventListener('mousemove', function(e) {
            if (tooltip.style.display === 'block') {
                tooltip.style.left = (e.clientX + 15) + 'px';
                tooltip.style.top = (e.clientY + 15) + 'px';
            }
        });

        function validateMatrixIntegrity(layout, selectedProfile, activeRows, activeCols, directInfo, isSplit) {
            let maxR = 0;
            let maxC = 0;
            let matrixMap = {};
            let errors = new Set();
            
            layout.forEach((key, index) => {
                if (key.matrix) {
                    let r = key.matrix[0];
                    let c = key.matrix[1];
                    if (r > maxR) maxR = r;
                    if (c > maxC) maxC = c;
                    
                    let coordStr = `${r},${c}`;
                    if (matrixMap[coordStr] !== undefined) {
                        errors.add(index);
                        errors.add(matrixMap[coordStr]);
                    } else {
                        matrixMap[coordStr] = index;
                    }
                }
            });
            
            let hardwareError = null;
            // Use total GPIO pool (pins array) for capacity check, not segregated rows/cols lengths.
            // This avoids false errors when dynamic allocation redistributes pins across row/col groups.
            if (directInfo && boardProfiles[selectedProfile]) {
                // Direct wiring: every key needs a free pin of its own on its controller.
                const free = freePinsOf(selectedProfile, isSplit).length, { keys, matrix } = directInfo;
                if (keys > free) {
                    hardwareError = `⚠️ Direct wiring needs one pin per key: ${keys} keys${isSplit ? ' per half' : ''}, but ${boardSelect.options[boardSelect.selectedIndex].text} has only ${free} free GPIO pins (${keys - free} keys left without a pin). Use a diode matrix instead: ${matrix.rows}×${matrix.cols} = ${matrix.pins} pins.`;
                }
            } else if (boardProfiles[selectedProfile] && selectedProfile !== "json_file") {
                const profile = boardProfiles[selectedProfile];
                // Total usable pins = the flat `pins` pool, or rows+cols if no pool defined
                const totalAvailable = (profile.pins || [...profile.rows, ...profile.cols]).length;
                const requiredPins = activeRows.length + activeCols.length;
                
                if (requiredPins > totalAvailable) {
                    hardwareError = `⚠️ Hardware Error: This layout requires ${activeRows.length} rows + ${activeCols.length} cols = ${requiredPins} pins, but ${boardSelect.options[boardSelect.selectedIndex].text} only has ${totalAvailable} usable GPIO pins available!`;
                }
            }
            
            return { errors: errors, hardwareError: hardwareError };
        }

        function renderAmoebaLegend(chains, ledPin, activeRows, activeCols, supply) {
            supply = supply || { vdd: "5V", vss: "GND" };
            if (!amoebaLegend) return;
            const total = chains.reduce((n, c) => n + c.count, 0);
            const sw = (color, dash) => `<span style="display:inline-block;width:26px;height:0;border-top:3px ${dash ? 'dashed' : 'solid'} ${color};vertical-align:middle;margin-right:6px"></span>`;
            const perHalf = chains.length > 1 ? ` (${chains.map(c => (c.side ? 'right ' : 'left ') + c.count).join(', ')} — one chain per half)` : '';
            amoebaLegend.innerHTML = [
                `<b>🧬 Amoeba Royale v2.0 — solder side.</b> Pads: <span style="color:${AMOEBA.colors.SR}">● R row</span> · <span style="color:${AMOEBA.colors.SC}">● C column</span> · <span style="color:${AMOEBA.colors.VDD}">● LED +</span> · <span style="color:${AMOEBA.colors.VSS}">● LED −</span> · <span style="color:${AMOEBA.colors.DIN}">● LED data in/out</span>`,
                `${sw('#cdd6f4')}Row wires: R pad → R pad, to row pins ${activeRows.join(', ')}. ${sw('#cdd6f4', true)}Column wires: C pad → C pad, to column pins ${activeCols.join(', ')}.`,
                `<span style="color:${AMOEBA.colors.DIN}">LED data</span>: DOUT → next DIN along the numbers L0 → L${Math.max(total - 1, 0)}${perHalf}. L0's DIN goes to <b>${ledPin || 'a free pin (none left on this board)'}</b>. LED + / − run along the same path; on the first board, + goes to <b>${supply.vdd}</b> and − to <b>${supply.vss}</b> (labelled next to its pads).`,
                `⚠️ The Amoeba's diode makes this <b>ROW2COL</b> — the Vial export switches to it while this box is ticked. ${total} SK6812MINI LEDs can draw up to ~${(total * 0.06).toFixed(1)} A at full white: cap brightness (RGB_MATRIX_MAXIMUM_BRIGHTNESS) to stay within USB's 0.5 A.`,
            ].join('<br>');
            amoebaLegend.style.display = 'block';
        }

        // A controller block under each half with every row/column of THAT half run to it
        // ("home-run" wires), plus the TRRS / wireless link between the two controllers.
        // Columns drop straight down from their lowest key; rows leave at the half's inner edge,
        // each in its own lane, so home-runs never run on top of each other.
        // Direct wiring (`direct` set): one home-run per key instead, in lanes along the right edge
        // of its column (top key outermost, so lanes never cross), plus a GND bus: a stub from each
        // key to its column's GND line (left edge), the column lines tied together above the top
        // keys and run down the half's outer edge to the controller's GND pin. Below the keys the
        // wires fan out to pins 10 px apart so the pin labels stay readable.
        function drawControllers(svg, keyGeo, activeRows, activeCols, pinColor, ZONE, direct) {
            const NS = "http://www.w3.org/2000/svg";
            const U = UNIT_SIZE, LANE = 7, PIN_R = 3;
            const isSplit = !!(currentJSON.split && (currentJSON.split.enabled ?? true));
            const choice = parseBoardChoice(boardSelect.value);
            const boardName = (BOARD_META[choice.id] || {}).label || "controller";
            const sides = [...new Set(keyGeo.map(k => k.side))].sort();
            const allX = keyGeo.map(k => k.cx), midX = (Math.min(...allX) + Math.max(...allX)) / 2;
            const el = (tag, attrs, text) => {
                const e = document.createElementNS(NS, tag);
                Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
                if (text !== undefined) e.textContent = text;
                svg.appendChild(e);
                return e;
            };
            const GND_COLOR = "#9399b2";
            const directHomeRuns = (ks, side, outerLeft) => {
                const wires = [], taken = [];
                const freeX = x => { while (taken.some(t => Math.abs(t - x) < 2)) x -= 2; taken.push(x); return x; };
                const order = [...ks].sort((a, b) => a.normRow - b.normRow || a.c - b.c); // = pin order
                const cols = {};
                ks.forEach(k => (cols[k.c] = cols[k.c] || []).push(k));
                const left = k => k.cx - k.w / 2, right = k => k.cx + k.w / 2;
                const minEdge = Math.min(...ks.map(left)), maxEdge = Math.max(...ks.map(right));
                const tieY = Math.min(...ks.map(k => k.cy)) - ZONE - 8;
                const spineX = outerLeft ? Math.max(3, minEdge - 6) : maxEdge + 6;
                taken.push(spineX);
                const gnd = (pts, attrs) => el("polyline", { points: pts.map(q => `${q.x},${q.y}`).join(" "), fill: "none",
                    stroke: GND_COLOR, "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round", "data-gnd": side, ...attrs });
                const gxs = [];
                Object.values(cols).forEach(col => {
                    col.sort((a, b) => a.cy - b.cy);
                    // lanes stay right of the key centres: GND stubs run left from the centre
                    const edge = Math.min(...col.map(right)), cxMax = Math.max(...col.map(k => k.cx));
                    const step = Math.min(5, Math.max(2, (edge - 6 - (cxMax + 3)) / Math.max(col.length - 1, 1)));
                    const gx = Math.max(...col.map(left)) + 8;
                    gxs.push(gx);
                    gnd([{ x: gx, y: tieY }, { x: gx, y: Math.max(...col.map(k => k.cy)) + ZONE }]);
                    col.forEach((k, i) => {
                        const y = k.cy - ZONE, x = freeX(edge - 6 - i * step);
                        gnd([{ x: k.cx, y: k.cy + ZONE }, { x: gx, y: k.cy + ZONE }], { "data-gnd-key": k.index });
                        el("circle", { cx: k.cx, cy: k.cy + ZONE, r: 3, fill: GND_COLOR });
                        el("circle", { cx: k.cx, cy: y, r: 3, fill: k.pin ? pinColor(order.indexOf(k)) : "#fab387" });
                        wires.push({ x, label: k.pin || "N/A", color: k.pin ? pinColor(order.indexOf(k)) : "#fab387", kind: "key", idx: k.index,
                            path: [{ x: k.cx, y }, { x, y }] });
                    });
                });
                gnd([{ x: Math.min(...gxs, spineX), y: tieY }, { x: Math.max(...gxs, spineX), y: tieY }]);
                wires.push({ x: spineX, label: "GND", color: GND_COLOR, kind: "gnd", idx: 0, path: [{ x: spineX, y: tieY }] });
                // Fan-out: slots in lane order, centred under the lanes. Wires moving left jog in
                // left-to-right order (and right-movers right-to-left), each a level lower, so no
                // jog crosses another wire.
                const SLOT = 10;
                wires.sort((a, b) => a.x - b.x);
                const mean = wires.reduce((n, w) => n + w.x, 0) / wires.length;
                const start = Math.max(4, mean - (wires.length - 1) * SLOT / 2);
                wires.forEach((w, i) => { w.slot = start + i * SLOT; });
                const yBase = Math.max(...ks.map(k => k.cy)) + U * 0.5 + 6;
                const lefts = wires.filter(w => w.slot < w.x - 0.5), rights = wires.filter(w => w.slot > w.x + 0.5).reverse();
                const levels = Math.max(lefts.length, rights.length);
                const blockTop = yBase + levels * 4 + 10;
                [lefts, rights].forEach(list => list.forEach((w, lvl) => {
                    const y = yBase + lvl * 4;
                    w.path.push({ x: w.x, y }, { x: w.slot, y });
                }));
                const pins = wires.map(w => ({ ...w, x: w.slot, path: [...w.path, { x: w.slot, y: blockTop }] }));
                return { pins, blockTop };
            };
            const blocks = [];
            let extentX = 0, extentY = 0;
            sides.forEach(side => {
                const ks = keyGeo.filter(k => k.side === side);
                if (direct) {
                    const avgX = ks.reduce((n, k) => n + k.cx, 0) / ks.length;
                    const { pins, blockTop } = directHomeRuns(ks, side, !isSplit || avgX < midX);
                    return drawBlock(side, isSplit ? avgX < midX : true, blockTop, pins);
                }
                const minX = Math.min(...ks.map(k => k.cx)), maxX = Math.max(...ks.map(k => k.cx));
                const avgX = ks.reduce((n, k) => n + k.cx, 0) / ks.length;
                // inner edge = toward the other half (split) or the right end (one controller)
                const innerRight = isSplit ? avgX < midX : true;
                const rowIds = [...new Set(ks.map(k => k.normRow))].sort((a, b) => a - b);
                const colIds = [...new Set(ks.map(k => k.c))].sort((a, b) => a - b);
                // Row lanes go beyond the half's inner edge, into its half of the gap to the other half
                // (split) or past the right end (one controller). If the halves overlap so there's no
                // gap (angled halves like an Alice), they go beyond the OUTER edge instead.
                let towardRight = innerRight;
                let edge = innerRight ? maxX + U * 0.5 : minX - U * 0.5;
                let room = rowIds.length * 7;
                if (isSplit) {
                    const other = keyGeo.filter(k => k.side !== side).map(k => k.cx);
                    if (other.length) {
                        const otherEdge = innerRight ? Math.min(...other) - U * 0.5 : Math.max(...other) + U * 0.5;
                        room = (innerRight ? otherEdge - edge : edge - otherEdge) / 2 - 3;
                    }
                    if (room < rowIds.length * 3) { // no gap: use the outer edge
                        towardRight = !innerRight;
                        edge = towardRight ? maxX + U * 0.5 : minX - U * 0.5;
                        room = towardRight ? rowIds.length * 7 : edge - 4;
                    }
                }
                const dirOut = towardRight ? 1 : -1;
                const step = Math.max(3, Math.min(7, room / Math.max(rowIds.length, 1)));
                const blockTop = Math.max(...ks.map(k => k.cy)) + U * 0.8;
                const pins = [], taken = [];
                const freeX = x => { while (taken.some(t => Math.abs(t - x) < 4)) x += dirOut * 4; taken.push(x); return x; };
                // Columns drop straight down from their lowest key; one that would share another's
                // line jogs sideways to its own.
                colIds.forEach(c => {
                    const col = ks.filter(k => k.c === c);
                    const bottom = col.reduce((m, k) => (k.cy > m.cy ? k : m));
                    const start = { x: bottom.cx, y: bottom.cy + ZONE }, x = freeX(bottom.cx);
                    const path = x === bottom.cx ? [start, { x, y: blockTop }]
                        : [start, { x: bottom.cx, y: start.y + 6 }, { x, y: start.y + 6 }, { x, y: blockTop }];
                    pins.push({ x, label: activeCols[c] || "?", color: pinColor(activeRows.length + c), kind: "col", idx: c, path });
                });
                // Row lanes: bottom row nearest the keys, top row farthest out, so stubs never cross lanes.
                let cur = edge + dirOut * step / 2;
                const laneOf = {};
                for (let i = rowIds.length - 1; i >= 0; i--) { laneOf[rowIds[i]] = freeX(cur); cur = laneOf[rowIds[i]] + dirOut * step; }
                rowIds.forEach(r => {
                    const row = ks.filter(k => k.normRow === r);
                    const inner = row.reduce((m, k) => (towardRight ? k.cx > m.cx : k.cx < m.cx) ? k : m);
                    const x = laneOf[r], start = { x: inner.cx, y: inner.cy - ZONE };
                    pins.push({ x, label: activeRows[r] || "?", color: pinColor(r), kind: "row", idx: r,
                        path: [start, { x, y: start.y }, { x, y: blockTop }] });
                });
                drawBlock(side, innerRight, blockTop, pins);
            });
            // The controller block, its pins and the home-run wires into it.
            function drawBlock(side, innerRight, blockTop, pins) {
                const xs = pins.map(p => p.x);
                const bx1 = Math.max(2, Math.min(...xs) - 14), bx2 = Math.max(...xs) + 14, bh = U * 0.95;
                el("rect", { x: bx1, y: blockTop, width: bx2 - bx1, height: bh, rx: 6, fill: "rgba(17,17,27,0.92)",
                    stroke: "#a6adc8", "stroke-width": 1.5, "data-ctrl-block": side });
                const title = isSplit ? `${side === 0 ? "LEFT" : "RIGHT"} controller · ${boardName}` : `Controller · ${boardName}`;
                const titleW = title.length * 6.2, titleX = Math.max((bx1 + bx2) / 2, 4 + titleW / 2); // keep it on-canvas
                el("text", { x: titleX, y: blockTop + bh + 13, "text-anchor": "middle", "font-size": 11,
                    "font-weight": "bold", fill: "#cdd6f4", "data-ctrl-title": side }, title);
                extentX = Math.max(extentX, titleX + titleW / 2 + 10);
                pins.forEach(p => {
                    el("polyline", { points: p.path.map(q => `${q.x},${q.y}`).join(" "), fill: "none", stroke: p.color,
                        "stroke-width": p.kind === "gnd" ? 3 : 2.5, "stroke-linejoin": "round", "stroke-linecap": "round",
                        ...(p.kind === "col" ? { "stroke-dasharray": "10,6" } : {}),
                        "data-homerun": `${p.kind}:${side}:${p.idx}`, "data-ctrl": side, "data-pin": p.label });
                    el("circle", { cx: p.x, cy: blockTop, r: PIN_R, fill: p.color, "data-ctrl-pin": p.label, "data-ctrl": side });
                    el("text", { x: p.x + 3, y: blockTop + 7, "font-size": 8, fill: p.color, "font-weight": "bold",
                        transform: `rotate(90 ${p.x + 3} ${blockTop + 7})` }, p.label);
                });
                blocks.push({ side, innerRight, x1: bx1, x2: bx2, y: blockTop + bh / 2 });
                extentX = Math.max(extentX, bx2 + 20);
                extentY = Math.max(extentY, blockTop + bh + 24);
            }
            // Link between the two controllers.
            const link = currentJSON.split_link;
            if (isSplit && blocks.length === 2) {
                const [a, b] = blocks.sort((p, q) => p.x1 - q.x1);
                const x1 = a.x2, x2 = b.x1, y = (a.y + b.y) / 2;
                const wireless = link && link.type === "wireless";
                el("line", { x1, y1: y, x2, y2: y, stroke: wireless ? "#89b4fa" : "#f9e2af", "stroke-width": 3,
                    "stroke-dasharray": wireless ? "2,6" : "", "data-link": wireless ? "wireless" : "trrs" });
                const label = wireless ? "BLE (wireless, ZMK)" : `TRRS: ${link && link.pin ? link.pin : "serial pin"} ↔ ${link && link.pin ? link.pin : ""} · 5V · GND`;
                el("text", { x: (x1 + x2) / 2, y: y - 8, "text-anchor": "middle", "font-size": 10, "font-weight": "bold",
                    fill: wireless ? "#89b4fa" : "#f9e2af", "data-link-label": "1" }, label);
            }
            return { extentX, extentY };
        }

        // One line under the board dropdown: one controller, or two and how they're linked.
        function renderBoardInfo(choice, directInfo) {
            const info = document.getElementById('boardInfo');
            if (!info) return;
            if (!currentJSON) { info.textContent = ''; return; }
            const link = currentJSON.split_link;
            const isSplit = !!(currentJSON.split && (currentJSON.split.enabled ?? true));
            let text;
            if (!isSplit) text = 'One controller for the whole keyboard.';
            else if (link && link.type === 'wireless') text = 'Two controllers, one per half (same matrix pins on both); the halves talk wirelessly (ZMK).';
            else if (link && link.pin) text = `Two controllers, one per half (same matrix pins on both); TRRS cable on ${link.pin} of each half, plus 5V and GND.`;
            else text = 'Two controllers, one per half (same matrix pins on both).';
            if (isZmkOnly(choice.id)) text += ' ⚠️ nRF52840 boards run ZMK, not QMK/Vial.';
            if (directInfo) {
                const { keys, matrix } = directInfo;
                text += ` Direct wiring: one pin per key (${keys} pins${isSplit ? ' per half' : ''}), every switch's other leg on a shared GND, no diodes.`;
                if (matrix.pins < keys) text += ` A ${matrix.rows}×${matrix.cols} diode matrix would use fewer pins: ${matrix.pins} vs ${keys}.`;
            }
            info.textContent = text;
            const kle = currentJSON._source === 'kle';
            if (rightHalfWiring) rightHalfWiring.style.display = (isSplit && kle) ? '' : 'none';
            if (wiringSelect) {
                wiringSelect.style.display = kle ? '' : 'none';
                const layout = extractLayout(currentJSON), rowsPerHalf = directInfo ? directInfo.matrix.rows
                    : (currentJSON.matrix_pins && currentJSON.matrix_pins.rows || []).length;
                const right = isSplit ? layout.filter(k => k.matrix && k.matrix[0] >= rowsPerHalf).length : 0;
                if (kle) offerDirect(wiringSelect, Math.max(layout.length - right, right), freePinsOf(choice.id, isSplit).length);
            }
        }

        function renderKeyboard() {
            if (!currentJSON) return;

            stage.innerHTML = '';

            let layout = extractLayout(currentJSON);

            let activeRows = [];
            let activeCols = [];
            const boardChoice = parseBoardChoice(boardSelect.value);
            const selectedProfile = boardChoice.id;
            // Direct wiring: per-key pins from matrix_pins.direct (left) / the right-hand grid.
            const direct = directGridsOf(currentJSON);
            const isSplitBoard = !!(currentJSON.split && (currentJSON.split.enabled ?? true));
            let directInfo = null;
            if (direct) {
                const dims = gridDims(direct.left);
                const keysOn = side => layout.filter(k => k.matrix && (isSplitBoard && k.matrix[0] >= dims.rows ? 1 : 0) === side).length;
                directInfo = {
                    keys: Math.max(keysOn(0), isSplitBoard ? keysOn(1) : 0),
                    matrix: { rows: dims.rows, cols: dims.cols, pins: dims.rows + dims.cols },
                };
            }
            renderBoardInfo(boardChoice, directInfo);

            // Always prefer matrix_pins from the JSON (set by KLE import or uploaded file);
            // fall back to the raw board profile only when no matrix_pins are present.
            if (direct) {
                // no row/column pins
            } else if (currentJSON.matrix_pins) {
                activeRows = currentJSON.matrix_pins.rows || [];
                activeCols = currentJSON.matrix_pins.cols || [];
            } else if (boardProfiles[selectedProfile]) {
                activeRows = boardProfiles[selectedProfile].rows;
                activeCols = boardProfiles[selectedProfile].cols;
            }

            // Extract Encoder pins for Tooltips
            let enc_a = "N/A", enc_b = "N/A", enc2_a = "N/A", enc2_b = "N/A";
            if (boardProfiles[selectedProfile] && boardProfiles[selectedProfile].periph) {
                enc_a = boardProfiles[selectedProfile].periph.enc_a || enc_a;
                enc_b = boardProfiles[selectedProfile].periph.enc_b || enc_b;
                enc2_a = boardProfiles[selectedProfile].periph.enc2_a || enc2_a;
                enc2_b = boardProfiles[selectedProfile].periph.enc2_b || enc2_b;
            }
            if (currentJSON.encoder && currentJSON.encoder.rotary && currentJSON.encoder.rotary.length > 0) {
                enc_a = currentJSON.encoder.rotary[0].pin_a || enc_a;
                enc_b = currentJSON.encoder.rotary[0].pin_b || enc_b;
                if (currentJSON.encoder.rotary.length > 1) {
                    enc2_a = currentJSON.encoder.rotary[1].pin_a || enc2_a;
                    enc2_b = currentJSON.encoder.rotary[1].pin_b || enc2_b;
                }
            }

            // Determine actual matrix size from JSON
            let matrixRowsCount = 5; // fallback
            if (direct) {
                matrixRowsCount = direct.left.length;
            } else if (currentJSON.matrix_pins && currentJSON.matrix_pins.rows) {
                matrixRowsCount = currentJSON.matrix_pins.rows.length;
            } else if (currentJSON.matrix_size && currentJSON.matrix_size.rows) {
                matrixRowsCount = currentJSON.matrix_size.rows;
            } else {
                let max_r = 0;
                layout.forEach(k => { if(k.matrix && k.matrix[0] > max_r) max_r = k.matrix[0]; });
                let kbName = (currentJSON.keyboard_name || "").toLowerCase();
                let isLikelySplit = currentJSON.split || kbName.includes("lily") || kbName.includes("split");
                matrixRowsCount = isLikelySplit ? (Math.floor((max_r + 1) / 2) || 5) : (max_r + 1);
            }

            // Matrix and Hardware Validation
            const validation = validateMatrixIntegrity(layout, selectedProfile, activeRows, activeCols, directInfo, isSplitBoard);
            const warningBanner = document.getElementById('warningBanner');
            let bannerMsg = "";
            if (validation.hardwareError) {
                bannerMsg += validation.hardwareError + "<br>";
            }
            if (validation.errors.size > 0) {
                bannerMsg += `⚠️ Matrix Error: Detected ${validation.errors.size} duplicate key coordinates in the physical layout. Keys highlighted in red.`;
            }
            
            if (bannerMsg !== "") {
                warningBanner.innerHTML = bannerMsg;
                warningBanner.style.display = "block";
            } else {
                warningBanner.style.display = "none";
            }

            // Pass 1: Find physical board width to calculate mirroring
            let max_x_logical = 0;
            let max_y = 0;
            layout.forEach(key => {
                const x = key.x || 0;
                const y = key.y || 0;
                const w = key.w || 1;
                const h = key.h || 1;
                if (x + w > max_x_logical) max_x_logical = x + w;
                if (y + h > max_y) max_y = y + h;
            });

            // Pass 2: Draw keys
            let rowGroups = {};
            let colGroups = {};
            let encoderPositions = [];
            let keyGeo = []; // per-key draw centre + matrix info, for the Amoeba layer / controllers
            let ctrlExtent = null;
            // The Amoeba layer draws a diode matrix's R/C pads; it has nothing to show for direct wiring.
            const amoebaMode = !!(amoebaToggle && amoebaToggle.checked && isBottomView) && !direct;

            layout.forEach((key, index) => {
                const div = document.createElement('div');
                div.className = 'key';
                if (validation.errors.has(index)) {
                    div.style.borderColor = "var(--accent)";
                    div.style.boxShadow = "0 0 10px rgba(243, 139, 168, 0.5)";
                }

                const original_x = key.x || 0;
                const y = key.y || 0;
                const w = key.w || 1;
                const h = key.h || 1;

                // If Bottom View is active, flip the X coordinate horizontally
                let draw_x = original_x;
                if (isBottomView) {
                    draw_x = max_x_logical - original_x - w;
                }

                div.style.left = (draw_x * UNIT_SIZE) + 'px';
                div.style.top = (y * UNIT_SIZE) + 'px';
                div.style.width = (w * UNIT_SIZE) + 'px';
                div.style.height = (h * UNIT_SIZE) + 'px';

                let rowPin = "N/A";
                let colPin = "N/A";

                let keycode = "";
                if (parsedKeymaps && layerSelect.value && parsedKeymaps[layerSelect.value]) {
                    keycode = parsedKeymaps[layerSelect.value][index] || "";
                }

                if (key.matrix) {
                    const r = key.matrix[0];
                    const c = key.matrix[1];
                    
                    // Use matrixRowsCount to normalize, NOT activeRows.length
                    const side = r >= matrixRowsCount ? 1 : 0;
                    const normalizedRow = r >= matrixRowsCount ? r - matrixRowsCount : r;

                    if (direct) {
                        // one leg to the key's own pin, the other to the shared GND bus
                        rowPin = ((side ? direct.right : direct.left)[normalizedRow] || [])[c] || "N/A (Pin Limit Exceeded)";
                        colPin = "GND";
                    } else {
                        rowPin = activeRows[normalizedRow] || "N/A (Pin Limit Exceeded)";
                        colPin = activeCols[c] || "N/A (Pin Limit Exceeded)";
                    }

                    const cx = (draw_x * UNIT_SIZE) + (w * UNIT_SIZE / 2);
                    const cy = (y * UNIT_SIZE) + (h * UNIT_SIZE / 2);
                    const ZONE = UNIT_SIZE * 0.22;
                    
                    const rowKey = side + "_" + normalizedRow;
                    const colKey = side + "_" + c;

                    // pinIdx = position in a ribbon cable laid out rows first, then cols
                    if (!rowGroups[rowKey]) rowGroups[rowKey] = { pinIdx: normalizedRow, pts: [] };
                    if (!colGroups[colKey]) colGroups[colKey] = { pinIdx: activeRows.length + c, pts: [] };

                    rowGroups[rowKey].pts.push({x: cx, y: cy - ZONE});
                    colGroups[colKey].pts.push({x: cx, y: cy + ZONE});
                    const geo = { index, cx, cy, w: w * UNIT_SIZE, rot: key.rot || 0, side, normRow: normalizedRow, c,
                        pin: direct && !rowPin.includes("N/A") ? rowPin : null };
                    keyGeo.push(geo);
                    div.addEventListener('mouseenter', () => { if (amoebaMode) amoebaHighlight(geo); });
                    div.addEventListener('mouseleave', () => { if (amoebaMode) amoebaHighlight(null); });

                    if (amoebaMode) {
                        // Amoeba view: keep only a small, faint [row, col]; pins are in the tooltip/legend.
                        div.innerHTML = `<div class="matrix" style="font-size:9px;opacity:0.45;position:absolute;top:1px;left:3px">[${r}, ${c}]</div>`;
                    } else if (!isBottomView && keycode) {
                        div.innerHTML = `<div class="keycode" title="${keycode}">${humanizeKeycode(keycode)}</div><div class="pins" style="color:${validation.errors.has(index) ? 'var(--accent)' : 'var(--text-sub)'}">[${r}, ${c}]</div>`;
                    } else {
                        let matrixColor = validation.errors.has(index) ? "color: var(--accent);" : "";
                        let pinColor = (rowPin.includes("N/A") || colPin.includes("N/A")) ? "color: var(--peach, #fab387);" : "";
                        div.innerHTML = `<div class="matrix" style="${matrixColor}">[${r}, ${c}]</div><div class="pins" style="${pinColor}">${rowPin} | ${colPin}</div>`;
                    }

                    div.addEventListener('mouseenter', () => {
                        let tooltipText = "";
                        if (validation.errors.has(index)) {
                            tooltipText += "⚠️ ERROR: DUPLICATE MATRIX COORDINATES\nMultiple keys are mapped to [" + r + "," + c + "].\n\n";
                        }
                        if (rowPin.includes("N/A") || colPin.includes("N/A")) {
                            tooltipText += "⚠️ ERROR: INSUFFICIENT PINS\nThe MCU does not have enough pins to support this matrix.\n\n";
                        }
                        tooltipText += direct ? `Direct pin [${r}, ${c}]\nPin -> ${rowPin}\nOther leg -> GND` : `Matrix: Row ${r}, Col ${c}\nPhysical MCU Pins:\nRow -> ${rowPin}\nCol -> ${colPin}`;
                        if (keycode) tooltipText += `\n\nKeycode: ${keycode}`;
                        
                        tooltip.innerText = tooltipText;
                        tooltip.style.display = 'block';
                    });
                } else {
                    if (!isBottomView && keycode) {
                        div.innerHTML = `<div class="keycode" title="${keycode}">${humanizeKeycode(keycode)}</div>`;
                    }
                }

                div.addEventListener('mouseenter', () => {
                    let sideText = "N/A";
                    let viewState = isBottomView ? "\n(MIRRORED FOR SOLDERING)" : "";
                    let kcText = (!isBottomView && keycode) ? `\nKeycode: 👉 **${keycode}**\n` : "";
                    let matrixText = "N/A";
                    
                    if (key.matrix) {
                        sideText = (key.matrix[0] >= matrixRowsCount) ? "RIGHT HALF" : "LEFT HALF";
                        matrixText = `[${key.matrix[0]}, ${key.matrix[1]}]`;
                        let encIdx = assignedEncoders.indexOf(key.matrix[0] + "_" + key.matrix[1]);
                        if (encIdx !== -1) {
                            let ea = encIdx === 0 ? enc_a : enc2_a;
                            let eb = encIdx === 0 ? enc_b : enc2_b;
                            tooltip.innerHTML = `📍 **Encoder ${encIdx+1}** (${sideText}) ${viewState}\nMatrix [Row, Col]: ${matrixText} (Click Switch)\n\nSolder Click Row to: 👉 **${rowPin}**\nSolder Click Col to: 👉 **${colPin}**\n\nSolder Rotary Pin A: 👉 **${ea}**\nSolder Rotary Pin B: 👉 **${eb}**`;
                        } else if (direct) {
                            tooltip.innerHTML = `📍 **${key.label || 'KEY'}** (${sideText}) ${viewState}${kcText}\nDirect pin [Row, Col]: ${matrixText}\n\nSolder one leg to:   👉 **${rowPin}**\nSolder other leg to: 👉 **GND** (shared bus)\nNo diode.`;
                        } else {
                            tooltip.innerHTML = `📍 **${key.label || 'KEY'}** (${sideText}) ${viewState}${kcText}\nMatrix [Row, Col]: ${matrixText}\n\nSolder Row to:   👉 **${rowPin}**\nSolder Col to:   👉 **${colPin}**`;
                        }
                    } else {
                        tooltip.innerHTML = `📍 **${key.label || 'KEY'}** (${sideText}) ${viewState}${kcText}\nMatrix [Row, Col]: ${matrixText}\n\nSolder Row to:   👉 **${rowPin}**\nSolder Col to:   👉 **${colPin}**`;
                    }
                    tooltip.style.display = 'block';
                });
                div.addEventListener('mouseleave', () => {
                    tooltip.style.display = 'none';
                });

                stage.appendChild(div);
            });

            // Draw Wiring SVG if enabled (always in Amoeba mode)
            if (amoebaLegend) amoebaLegend.style.display = 'none';
            if (amoebaLayerBar) amoebaLayerBar.style.display = amoebaMode ? 'flex' : 'none';
            amoebaSvg = null;
            // Size slider: CSS zoom enlarges the drawing (and its layout box) only in Amoeba view.
            const zoom = amoebaMode && amoebaZoom ? parseFloat(amoebaZoom.value) || 1 : 1;
            stage.style.zoom = zoom === 1 ? '' : String(zoom);
            if (amoebaZoomLabel) amoebaZoomLabel.textContent = Math.round(zoom * 100) + '%';
            if (showWiringCheckbox.checked || amoebaMode) {
                const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                svg.style.position = "absolute";
                svg.style.top = "0";
                svg.style.left = "0";
                svg.style.width = "100%";
                svg.style.height = "100%";
                svg.style.pointerEvents = "none";
                svg.style.zIndex = "1";

                const ribbonColors = [
                    "rgba(180, 98, 77, 0.85)",    // Brown
                    "rgba(243, 139, 168, 0.85)",  // Red 
                    "rgba(250, 179, 135, 0.85)",  // Orange 
                    "rgba(249, 226, 175, 0.85)",  // Yellow 
                    "rgba(166, 227, 161, 0.85)",  // Green 
                    "rgba(137, 180, 250, 0.85)",  // Blue 
                    "rgba(203, 166, 247, 0.85)",  // Violet 
                    "rgba(186, 194, 222, 0.85)",  // Gray 
                    "rgba(255, 255, 255, 0.85)"   // White 
                ];

                const drawChain = (pts, color, dash) => {
                    for (let i = 0; i < pts.length - 1; i++) {
                        const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
                        l.setAttribute("x1", pts[i].x); l.setAttribute("y1", pts[i].y);
                        l.setAttribute("x2", pts[i+1].x); l.setAttribute("y2", pts[i+1].y);
                        l.setAttribute("stroke", color);
                        l.setAttribute("stroke-width", "5");
                        l.setAttribute("stroke-linecap", "round");
                        if (dash) l.setAttribute("stroke-dasharray", dash);
                        svg.appendChild(l);
                    }
                    pts.forEach(p => {
                        const d = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                        d.setAttribute("cx", p.x); d.setAttribute("cy", p.y);
                        d.setAttribute("r", "4.5"); d.setAttribute("fill", color);
                        svg.appendChild(d);
                    });
                };

                // Wire colour comes from the pin, so a row keeps its colour on both halves
                // and colours follow a ribbon cable wired rows first, then cols.
                const pinColor = idx => ribbonColors[idx % ribbonColors.length];

                if (amoebaMode) {
                    const ledPin = pickLedPin(selectedProfile, activeRows, activeCols);
                    const chains = drawAmoebaLayer(svg, keyGeo, activeRows, ledPin, pinColor, amoebaLayers(), ledSupply(selectedProfile));
                    amoebaSvg = svg;
                    stage.appendChild(svg);
                    renderAmoebaLegend(chains, ledPin, activeRows, activeCols, ledSupply(selectedProfile));
                    stage.style.width = (max_x_logical * UNIT_SIZE + 20) + 'px';
                    stage.style.height = Math.max(max_y * UNIT_SIZE + 20, 250) + 'px';
                    return;
                }

                // Draw ROWS: Connect anchors left-to-right (none for direct wiring: no matrix)
                if (!direct) Object.values(rowGroups).forEach(group => {
                    group.pts.sort((a, b) => a.x - b.x);
                    drawChain(group.pts, pinColor(group.pinIdx), ""); // solid
                });

                // Draw COLS: Connect anchors top-to-bottom
                if (!direct) Object.values(colGroups).forEach(group => {
                    group.pts.sort((a, b) => a.y - b.y);
                    drawChain(group.pts, pinColor(group.pinIdx), "10,6"); // dash
                });

                // Each half's rows/columns run to that half's own controller.
                if (keyGeo.length) ctrlExtent = drawControllers(svg, keyGeo, activeRows, activeCols, pinColor, UNIT_SIZE * 0.22, direct);

                stage.appendChild(svg);
            }

            stage.style.width = Math.max(max_x_logical * UNIT_SIZE + 20, ctrlExtent ? ctrlExtent.extentX : 0) + 'px';
            stage.style.height = Math.max(max_y * UNIT_SIZE + 20, 250, ctrlExtent ? ctrlExtent.extentY : 0) + 'px';
        }


        // ============================================================
        // VIAL FIRMWARE ZIP EXPORT
        // Per official docs: https://get.vial.today/docs/porting-to-vial.html
        // ============================================================
        if (exportVialZipBtn) {
            exportVialZipBtn.addEventListener('click', () => {
                if (!currentJSON) { alert('No layout loaded. Import a KLE first.'); return; }
                if (typeof JSZip === 'undefined') { alert('JSZip not loaded. Check internet connection.'); return; }

                const layout      = extractLayout(currentJSON);
                const matrixPins  = currentJSON.matrix_pins || { rows: [], cols: [] };
                const activeRows  = matrixPins.rows || [];
                const activeCols  = matrixPins.cols || [];
                const isSplit     = !!(currentJSON.split && (currentJSON.split.enabled ?? true));
                // Direct wiring: the grid's shape is the matrix size (rows x cols per half).
                const direct      = directGridsOf(currentJSON);
                const numRows     = direct ? gridDims(direct.left).rows : activeRows.length;
                const numCols     = direct ? gridDims(direct.left).cols : activeCols.length;
                const selectedProfile = parseBoardChoice(boardSelect.value).id;
                if (isZmkOnly(selectedProfile)) {
                    alert('nice!nano / nRF52840 boards run ZMK, not QMK or Vial, so a Vial ZIP would never build. Pick an RP2040 or Pro Micro board, or set the board up in a ZMK config instead.');
                    return;
                }
                const linkPin = currentJSON.split_link && currentJSON.split_link.pin;

                // Logical matrix size. Split: QMK scans left rows then right rows, so
                // MATRIX_ROWS = 2 x row pins per half (matrix_pins.rows lists one half).
                const logicalRows = isSplit ? numRows * 2 : numRows;
                const unlock = pickUnlockKeys(layout);
                // Amoeba Royale's on-board diode has its anode on the row pad → ROW2COL.
                const diodeDirection = (amoebaToggle && amoebaToggle.checked) ? 'ROW2COL' : 'COL2ROW';

                // MCU detection from board profile
                const mcuMap = {
                    rp2040_zero:             { mcu: 'RP2040',     boot: 'rp2040'      },
                    rp2040_tiny:             { mcu: 'RP2040',     boot: 'rp2040'      },
                    waveshare_2040_plus:     { mcu: 'RP2040',     boot: 'rp2040'      },
                    pro_micro:               { mcu: 'atmega32u4', boot: 'caterina'    },
                    nice_nano:               { mcu: 'nRF52840',   boot: 'nrfmicro_13' },
                    nrf52840_nicenano_clone: { mcu: 'nRF52840',   boot: 'nrfmicro_13' },
                };
                const mcuInfo = mcuMap[selectedProfile] || { mcu: 'RP2040', boot: 'rp2040' };

                // 8-byte random Vial UID
                const uid = Array.from({length: 8}, () =>
                    '0x' + Math.floor(Math.random() * 256).toString(16).toUpperCase().padStart(2, '0')
                ).join(', ');

                // Keyboard folder name
                const kbName = (currentJSON.keyboard_name || 'custom_handwired')
                    .toLowerCase().replace(/[^a-z0-9]/g, '_');
                const layoutName = currentJSON.layouts
                    ? (Object.keys(currentJSON.layouts)[0] || 'LAYOUT')
                    : 'LAYOUT';

                // 4-layer KC_TRNS keymap
                const keymapArgs = layout.map(() => 'KC_TRNS').join(', ');
                const keymapC = [
                    `// SPDX-License-Identifier: GPL-2.0-or-later`,
                    `// Auto-generated by Cubify`,
                    ``,
                    `#include QMK_KEYBOARD_H`,
                    ``,
                    `const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {`,
                    `    [0] = ${layoutName}(${keymapArgs}),`,
                    `    [1] = ${layoutName}(${keymapArgs}),`,
                    `    [2] = ${layoutName}(${keymapArgs}),`,
                    `    [3] = ${layoutName}(${keymapArgs}),`,
                    `};`,
                ].join('\n');

                // Keyboard-level config.h
                const splitLine = isSplit && linkPin ? [
                    ``,
                    `// Split keyboard: the halves talk half-duplex serial over the TRRS cable on ${linkPin}`,
                    `// (set as split.serial in info.json). Wire tip/ring/sleeve the same on both halves.`,
                    `#define SPLIT_USB_DETECT`,
                ].join('\n') : isSplit ? [
                    ``,
                    `// Split keyboard — REQUIRED: configure your serial/TRRS communication pin`,
                    `// Uncomment and set the correct TX pin for your wiring:`,
                    `// #define SERIAL_USART_FULL_DUPLEX         // use for UART (full duplex)`,
                    `// #define SERIAL_USART_TX_PIN GP0          // TX pin on left half`,
                    `// #define SERIAL_USART_RX_PIN GP1          // RX pin on right half`,
                    `// Or for simple single-wire (half-duplex):`,
                    `// #define SOFT_SERIAL_PIN D2               // for Pro Micro`,
                    `#define SPLIT_USB_DETECT`,
                ].join('\n') : '';
                // QMK's own DIRECT_PINS form of a grid (null = NO_PIN), quoted in the config.h comment.
                const directPinsC = grid => `{ ${grid.map(r => `{ ${r.map(p => p || 'NO_PIN').join(', ')} }`).join(', ')} }`;
                const pinLines = direct ? [
                    `// Direct wiring: every switch has its own GPIO and its other leg on a shared GND.`,
                    `// No diodes and no row/column matrix (so no DIODE_DIRECTION). QMK reads the pins from`,
                    `// info.json "matrix_pins": {"direct": [...]}${isSplit ? ' and "split": {"matrix_pins": {"right": {"direct": [...]}}}' : ''},`,
                    `// the same as:`,
                    `//   #define DIRECT_PINS ${directPinsC(direct.left)}`,
                    ...(isSplit ? [`//   #define DIRECT_PINS_RIGHT ${directPinsC(direct.right)}`] : []),
                ] : [
                    `#define MATRIX_ROW_PINS { ${activeRows.join(', ')} }`,
                    `#define MATRIX_COL_PINS { ${activeCols.join(', ')} }`,
                    `#define DIODE_DIRECTION ${diodeDirection}`,
                ];
                const configH = [
                    `// SPDX-License-Identifier: GPL-2.0-or-later`,
                    `// Auto-generated by Cubify`,
                    `#pragma once`,
                    ``,
                    `#define MATRIX_ROWS ${logicalRows}`,
                    `#define MATRIX_COLS ${numCols}`,
                    ...pinLines,
                ].join('\n') + splitLine;

                // keyboard.h
                const keyboardH = [
                    `// SPDX-License-Identifier: GPL-2.0-or-later`,
                    `#pragma once`,
                    ``,
                    `#include "quantum.h"`,
                ].join('\n');

                // Keyboard-level rules.mk — MCU only, NO VIA/VIAL
                const rulesMk = [
                    `# Auto-generated by Cubify`,
                    `# DO NOT add VIA_ENABLE/VIAL_ENABLE here — put in keymaps/vial/rules.mk`,
                    ``,
                    `MCU = ${mcuInfo.mcu}`,
                    `BOOTLOADER = ${mcuInfo.boot}`,
                ].join('\n');

                // keymaps/vial/rules.mk
                const vialRulesMk = [
                    `# Vial keymap rules — both lines required, do not remove VIA_ENABLE`,
                    `VIA_ENABLE = yes`,
                    `VIAL_ENABLE = yes`,
                ].join('\n');

                // keymaps/vial/config.h
                const vialConfigH = [
                    `/* SPDX-License-Identifier: GPL-2.0-or-later */`,
                    `#pragma once`,
                    ``,
                    `/* Unique Vial keyboard ID */`,
                    `#define VIAL_KEYBOARD_UID {${uid}}`,
                    ``,
                    `/* Unlock combo: hold [${unlock[0]}]+[${unlock[1]}] for ~3s to unlock security settings */`,
                    `#define VIAL_UNLOCK_COMBO_ROWS { ${unlock[0][0]}, ${unlock[1][0]} }`,
                    `#define VIAL_UNLOCK_COMBO_COLS { ${unlock[0][1]}, ${unlock[1][1]} }`,
                ].join('\n');

                // info.json (QMK format)
                const infoJSON = {
                    keyboard_name: kbName,
                    manufacturer: currentJSON.manufacturer || 'Custom Handwired',
                    url: '',
                    maintainer: 'handwired',
                    usb: { vid: '0xFEED', pid: '0x0000', device_version: '0.0.1' },
                    processor: mcuInfo.mcu,
                    bootloader: mcuInfo.boot,
                    ...(direct ? {} : { diode_direction: diodeDirection }), // unused for direct pins
                    ...(isSplit ? { split: {
                        enabled: true,
                        ...(linkPin ? { serial: { driver: mcuInfo.mcu === 'RP2040' ? 'vendor' : 'bitbang', pin: linkPin } } : {}),
                        ...(direct ? { matrix_pins: { right: { direct: direct.right } } } : {}),
                    } } : {}),
                    matrix_pins: direct ? { direct: direct.left } : { rows: activeRows, cols: activeCols },
                    layouts: {
                        [layoutName]: {
                            layout: layout.map(k => {
                                const e = {};
                                if (k.matrix) e.matrix = k.matrix;
                                e.x = parseFloat((k.x || 0).toFixed(2));
                                e.y = parseFloat((k.y || 0).toFixed(2));
                                if (k.w && k.w !== 1) e.w = parseFloat(k.w.toFixed(2));
                                if (k.h && k.h !== 1) e.h = parseFloat(k.h.toFixed(2));
                                return e;
                            })
                        }
                    }
                };

                // vial.json — KLE format where each key label = "row,col"
                function buildVialKLE(keys) {
                    const ROW_TOL = 0.7;
                    let rowBands = [];
                    [...keys].sort((a,b) =>
                        (a.cy||(a.y||0)+(a.h||1)/2) - (b.cy||(b.y||0)+(b.h||1)/2)
                    ).forEach(k => {
                        const ky = k.cy || (k.y||0) + (k.h||1)/2;
                        let band = rowBands.find(b => Math.abs(b.avgY - ky) < ROW_TOL);
                        if (band) {
                            band.keys.push(k);
                            band.avgY = band.keys.reduce((s,x) => s+(x.cy||(x.y||0)+(x.h||1)/2),0)/band.keys.length;
                        } else {
                            rowBands.push({ avgY: ky, keys: [k] });
                        }
                    });
                    rowBands.sort((a,b) => a.avgY - b.avgY);

                    return rowBands.map(band => {
                        const sorted = [...band.keys].sort((a,b) =>
                            (a.cx||(a.x||0)+(a.w||1)/2) - (b.cx||(b.x||0)+(b.w||1)/2)
                        );
                        const kleRow = [];
                        let curX = 0;
                        sorted.forEach(k => {
                            const kx  = parseFloat((k.x || 0).toFixed(4));
                            const kw  = parseFloat((k.w || 1).toFixed(4));
                            const gap = parseFloat((kx - curX).toFixed(4));
                            const meta = {};
                            if (gap > 0.02) meta.x = parseFloat(gap.toFixed(2));
                            if (kw !== 1)   meta.w = kw;
                            if (Object.keys(meta).length > 0) kleRow.push(meta);
                            kleRow.push(k.matrix ? `${k.matrix[0]},${k.matrix[1]}` : '0,0');
                            curX = kx + kw;
                        });
                        return kleRow;
                    });
                }

                const vialJSON = {
                    name: kbName,
                    vendorId: '0xFEED',
                    productId: '0x0000',
                    lighting: 'none',
                    matrix: { rows: logicalRows, cols: numCols },
                    layouts: { keymap: buildVialKLE(layout) }
                };

                // INSTALL.md — compile instructions bundled with the ZIP
                const installMd = [
`# ${kbName} — Vial Firmware: Compile & Flash Guide`,
`> Auto-generated by Cubify`,
``,
`## Prerequisites`,
`- A working [QMK build environment](https://docs.qmk.fm/#/newbs_getting_started)`,
`- Git`,
``,
`## Step 1 — Clone vial-qmk (once)`,
`\`\`\`bash`,
`git clone https://github.com/vial-kb/vial-qmk.git`,
`cd vial-qmk && make git-submodule`,
`\`\`\``,
`> ⚠️ Keep vial-qmk **outside** your existing qmk_firmware folder to avoid conflicts.`,
``,
`## Step 2 — Copy your keyboard`,
`Extract the ZIP and copy the keyboard folder:`,
`\`\`\`bash`,
`cp -r ${kbName}/  vial-qmk/keyboards/handwired/`,
`\`\`\``,
``,
`## Step 3 — Verify environment`,
`\`\`\`bash`,
`cd vial-qmk`,
`qmk doctor`,
`\`\`\``,
`The only expected warning is about the upstream remote. Everything else should be green.`,
``,
`## Step 4 — Compile`,
`\`\`\`bash`,
`make handwired/${kbName}:vial`,
`\`\`\``,
`> Use \`make\`, **not** \`qmk compile\` — the latter targets QMK firmware, not Vial.`,
``,
`## Step 5 — Flash`,
`\`\`\`bash`,
`make handwired/${kbName}:vial:flash`,
`\`\`\``,
`Or flash the generated \`.uf2\` / \`.hex\` manually via [QMK Toolbox](https://github.com/qmk/qmk_toolbox/releases).`,
`Put your board in **bootloader mode** first.`,
``,
`## After Flashing`,
`1. Open [Vial GUI](https://get.vial.today/download/) — your keyboard should be auto-detected.`,
`2. Go to **Security → Unlock** and hold the two unlock keys below (~3s) to unlock editing.`,
`3. Remap keys, layers, macros — all in real time without reflashing.`,
``,
`## Unlock Combo`,
`| Key | Matrix |`,
`|-----|--------|`,
`| Key 1 | Row ${unlock[0][0]}, Col ${unlock[0][1]} |`,
`| Key 2 | Row ${unlock[1][0]}, Col ${unlock[1][1]} |`,
                ].join('\n');

                // Assemble ZIP
                const zip = new JSZip();
                const kb  = zip.folder(kbName);
                kb.file('INSTALL.md', installMd);
                kb.file('config.h',   configH);
                kb.file('info.json',  JSON.stringify(infoJSON, null, 2));
                kb.file('keyboard.h', keyboardH);
                kb.file('rules.mk',   rulesMk);

                const keymapsFolder = kb.folder('keymaps');
                keymapsFolder.folder('default').file('keymap.c', keymapC);

                const vialKm = keymapsFolder.folder('vial');
                vialKm.file('keymap.c',  keymapC);
                vialKm.file('rules.mk',  vialRulesMk);
                vialKm.file('config.h',  vialConfigH);
                vialKm.file('vial.json', JSON.stringify(vialJSON, null, 2));

                zip.generateAsync({ type: 'blob' }).then(blob => {
                    const url = URL.createObjectURL(blob);
                    const a   = document.createElement('a');
                    a.href     = url;
                    a.download = `${kbName}_vial.zip`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);

                    // Show compile instructions modal with actual keyboard name filled in
                    const modal = document.getElementById('vialCompileModal');
                    ['compileKbName','compileKbName2','compileKbName3'].forEach(id => {
                        const el = document.getElementById(id);
                        if (el) el.textContent = kbName;
                    });
                    if (modal) modal.style.display = 'flex';
                });
            });

            // Close button
            const closeVialCompileBtn = document.getElementById('closeVialCompileBtn');
            if (closeVialCompileBtn) {
                closeVialCompileBtn.addEventListener('click', () => {
                    document.getElementById('vialCompileModal').style.display = 'none';
                });
            }
        }

