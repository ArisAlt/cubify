const UNIT_SIZE = 55; // 1U = 55px
        let currentJSON = null;
        let isBottomView = false;
        let parsedKeymaps = null;
        let assignedEncoders = [];

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

            // Amoeba Royale v2.0 single-key PCB (github.com/mtl/keyboard-pcbs, CC0), seen from the
            // SOLDER side (= Cubify's bottom view). Pad positions are % of the 18.8 x 18.1 mm board,
            // taken from amoeba-royale.kicad_pcb and mirrored left-right. Every net has several pads
            // so wires can leave in any direction. The on-board diode's anode is on the R (row) pad,
            // so firmware must use DIODE_DIRECTION ROW2COL.
            const AMOEBA = {
                wMM: 18.8, hMM: 18.1,
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

        const importKleBtn = document.getElementById('importKleBtn');
        const kleModal = document.getElementById('kleModal');
        const kleIsSplit = document.getElementById('kleIsSplit');
        const kleBoardSelect = document.getElementById('kleBoardSelect');
        const kleInput = document.getElementById('kleInput');
        const processKleBtn = document.getElementById('processKleBtn');
        const closeKleModalBtn = document.getElementById('closeKleModalBtn');

        if (importKleBtn) {
            importKleBtn.addEventListener('click', () => {
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
                                    boardSelect.value = profileId;
                                    break;
                                }
                            }
                        }
                        
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

                    const isSplit = kleIsSplit.value === "true";

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
                        rightHalves.forEach(k => { k.matrixRow += perHalfRows; k.matrix = [k.matrixRow, k.matrixCol]; });
                        numLogicalRows = perHalfRows * 2;
                        numLogicalCols = Math.max(resLeft.numCols, resRight.numCols);
                    } else {
                        // MONOLITHIC layout (Alice, standard TKL, etc.): route the full board as one piece.
                        if (manualKeys.length > 0) {
                            alert(`Notice: Found ${manualKeys.length} keys with manual matrix labels, but not all keys were labeled. Falling back to Auto-Router.`);
                        }
                        let res = gridRoute(physicalLayout, 0, 0);
                        numLogicalRows = res.numRows;
                        numLogicalCols = res.numCols;
                    }

                    // For split keyboards, each MCU only needs perHalfRows + numLogicalCols pins.
                    // For monolithic, each MCU needs numLogicalRows + numLogicalCols pins.
                    const pinsPerMCU = isSplit ? (perHalfRows + numLogicalCols) : (numLogicalRows + numLogicalCols);

                    // Target Board Selection
                    let bestBoard = "rp2040_zero"; // Default fallback
                    let requiredPins = pinsPerMCU;
                    let foundFit = false;
                    
                    const explicitBoard = kleBoardSelect.value;
                    
                    if (explicitBoard !== "auto") {
                        bestBoard = explicitBoard;
                        const profile = boardProfiles[bestBoard];
                        if (profile) {
                            const totalPins = (profile.pins || [...profile.rows, ...profile.cols]).length;
                            if ((profile.rows.length >= perHalfRows && profile.cols.length >= numLogicalCols) ||
                                totalPins >= requiredPins) {
                                foundFit = true;
                            }
                        }
                    } else {
                        // Auto-Select Best Board — prefer smallest board that fits
                        for (const [profileId, profile] of Object.entries(boardProfiles)) {
                            const totalPins = (profile.pins || [...profile.rows, ...profile.cols]).length;
                            const strictFit = profile.rows.length >= perHalfRows && profile.cols.length >= numLogicalCols;
                            const dynamicFit = totalPins >= requiredPins;
                            if (strictFit || dynamicFit) {
                                bestBoard = profileId;
                                foundFit = true;
                                if (profileId === "pro_micro" && strictFit) break;
                            }
                        }
                    }
                    
                    boardSelect.value = bestBoard;

                    // Pin Allocation:
                    // Split: allocate perHalfRows row pins + numLogicalCols col pins (per-MCU physical requirement)
                    // Monolithic: allocate numLogicalRows row pins + numLogicalCols col pins
                    let activeRows = [];
                    let activeCols = [];
                    if (boardProfiles[bestBoard]) {
                        ({ rows: activeRows, cols: activeCols } = allocatePins(
                            boardProfiles[bestBoard], isSplit ? perHalfRows : numLogicalRows, numLogicalCols));
                    }

                    // Build QMK JSON
                    currentJSON = {
                        keyboard_name: "Auto-Routed KLE Board",
                        manufacturer: "Custom Handwired",
                        diode_direction: "COL2ROW",
                        split: isSplit,
                        matrix_pins: {
                            rows: activeRows,
                            cols: activeCols
                        },
                        layouts: {
                            LAYOUT: {
                                layout: physicalLayout
                            }
                        }
                    };

                    if (!foundFit) {
                        alert(`Warning: This layout requires ${perHalfRows} rows and ${numLogicalCols} columns per MCU (${requiredPins} pins). We selected ${bestBoard}, but it does not have enough pins!`);
                    }

                    kleModal.style.display = 'none';
                    renderKeyboard();
                    exportVialZipBtn.style.display = 'inline-block';
                    alert("KLE layout successfully imported and auto-routed!");

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
                                boardSelect.value = profileId;
                                break; // Found a match, stop looking
                            }
                        }
                    }

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

        boardSelect.addEventListener('change', renderKeyboard);
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
        function pickLedPin(profileId, activeRows, activeCols) {
            const profile = boardProfiles[profileId];
            const used = new Set([...activeRows, ...activeCols]);
            const pool = profile ? (profile.pins || [...profile.rows, ...profile.cols]) : [];
            return pool.find(p => !used.has(p)) || null;
        }

        // Draw every key as an Amoeba Royale board and wire nets pad-to-pad.
        // keyGeo: [{index, cx, cy, rot, side, normRow, c}] in draw (bottom-view) pixels.
        function drawAmoebaLayer(svg, keyGeo, activeRows, ledPin, pinColor, layers) {
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
            // Long jumps between rows would run as shallow diagonals on top of each other. Route
            // them down → across → down instead, each in its own horizontal lane near the gap
            // between the two pads. Every drawn segment is an obstacle for later lanes, so no
            // two wires run along the same line (crossing at an angle is fine).
            const obstacles = []; // drawn segments {a, b}
            const LANE_GAP = 3;
            const LANE_BAND = 0.3 * UNIT_SIZE; // lanes may spread this far either side of the gap
            const distToSeg = (x, y, s) => {
                const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, L = dx * dx + dy * dy || 1;
                const t = Math.max(0, Math.min(1, ((x - s.a.x) * dx + (y - s.a.y) * dy) / L));
                return Math.hypot(x - s.a.x - t * dx, y - s.a.y - t * dy);
            };
            // Length of a→b that runs within LANE_GAP of something already drawn.
            const sharedLength = (a, b) => {
                const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(2, Math.ceil(len));
                let hits = 0;
                for (let i = 0; i <= n; i++) {
                    const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
                    if (obstacles.some(s => distToSeg(x, y, s) < LANE_GAP)) hits++;
                }
                return hits * len / n;
            };
            // Try down→across→down lanes first, then across→down→across (for pads stacked on one
            // edge, e.g. LED + above LED −); keep the shape that shares the least with what's drawn.
            const dogleg = (a, b) => {
                let best = null;
                const consider = pts => {
                    let shared = 0;
                    for (let j = 0; j < pts.length - 1; j++) shared += sharedLength(pts[j], pts[j + 1]);
                    if (!best || shared < best.shared - 0.5) best = { pts, shared };
                    return shared <= 4;
                };
                const midY = (a.y + b.y) / 2, midX = (a.x + b.x) / 2;
                for (let d = 0; d <= LANE_BAND + 0.01; d += LANE_GAP) {
                    for (const y of d ? [midY + d, midY - d] : [midY])
                        if (consider([a, { x: a.x, y }, { x: b.x, y }, b])) return best.pts;
                }
                for (let d = 0; d <= LANE_BAND + 0.01; d += LANE_GAP) {
                    for (const x of d ? [midX + d, midX - d] : [midX])
                        if (consider([a, { x, y: a.y }, { x, y: b.y }, b])) return best.pts;
                }
                return best.pts;
            };
            const shape = (a, b, kind) => {
                const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y);
                if (kind === "row") return [a, b]; // rows follow their row; they're routed first
                if (kind === "col" && dx > 0.35 * UNIT_SIZE) return dogleg(a, b);
                if (kind === "led" && Math.hypot(dx, dy) > 1.3 * UNIT_SIZE && dy > 0.3 * UNIT_SIZE) return dogleg(a, b);
                if (sharedLength(a, b) > 6) return dogleg(a, b);
                return [a, b];
            };
            const drawn = { vdd: [], vss: [], row: [], led: [], col: [] };
            const chain = (seq, netA, netB, color, width, dash, wire) => {
                const kind = wire.split(":")[0];
                for (let i = 0; i < seq.length - 1; i++) {
                    const b = link(seq[i].index, netA, seq[i + 1].index, netB);
                    b.a.used = b.b.used = true;
                    const pts = shape(b.a, b.b, kind);
                    for (let j = 0; j < pts.length - 1; j++) obstacles.push({ a: pts[j], b: pts[j + 1] });
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
                chains.push({ side: +side, count: seq.length, first: seq[0] && seq[0].index });
            });

            // Pads on top so they stay visible. Pads with a wire are drawn bold; the rest only
            // when "Unused pads" is ticked, small and faint.
            keyGeo.forEach(k => padsOf[k.index].forEach(p => {
                if (!p.used && !layers.pads) return;
                const c = document.createElementNS(NS, "circle");
                c.setAttribute("cx", p.x); c.setAttribute("cy", p.y); c.setAttribute("r", p.used ? "2.8" : "1.6");
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

        function validateMatrixIntegrity(layout, selectedProfile, activeRows, activeCols) {
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
            if (boardProfiles[selectedProfile] && selectedProfile !== "json_file") {
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

        function renderAmoebaLegend(chains, ledPin, activeRows, activeCols) {
            if (!amoebaLegend) return;
            const total = chains.reduce((n, c) => n + c.count, 0);
            const sw = (color, dash) => `<span style="display:inline-block;width:26px;height:0;border-top:3px ${dash ? 'dashed' : 'solid'} ${color};vertical-align:middle;margin-right:6px"></span>`;
            const perHalf = chains.length > 1 ? ` (${chains.map(c => (c.side ? 'right ' : 'left ') + c.count).join(', ')} — one chain per half)` : '';
            amoebaLegend.innerHTML = [
                `<b>🧬 Amoeba Royale v2.0 — solder side.</b> Pads: <span style="color:${AMOEBA.colors.SR}">● R row</span> · <span style="color:${AMOEBA.colors.SC}">● C column</span> · <span style="color:${AMOEBA.colors.VDD}">● LED +</span> · <span style="color:${AMOEBA.colors.VSS}">● LED −</span> · <span style="color:${AMOEBA.colors.DIN}">● LED data in/out</span>`,
                `${sw('#cdd6f4')}Row wires: R pad → R pad, to row pins ${activeRows.join(', ')}. ${sw('#cdd6f4', true)}Column wires: C pad → C pad, to column pins ${activeCols.join(', ')}.`,
                `<span style="color:${AMOEBA.colors.DIN}">LED data</span>: DOUT → next DIN along the numbers L0 → L${Math.max(total - 1, 0)}${perHalf}. L0's DIN goes to <b>${ledPin || 'a free pin (none left on this board)'}</b>. LED + / − run along the same path; feed + from 5 V (VBUS), − from GND.`,
                `⚠️ The Amoeba's diode makes this <b>ROW2COL</b> — the Vial export switches to it while this box is ticked. ${total} SK6812MINI LEDs can draw up to ~${(total * 0.06).toFixed(1)} A at full white: cap brightness (RGB_MATRIX_MAXIMUM_BRIGHTNESS) to stay within USB's 0.5 A.`,
            ].join('<br>');
            amoebaLegend.style.display = 'block';
        }

        function renderKeyboard() {
            if (!currentJSON) return;

            stage.innerHTML = '';

            let layout = extractLayout(currentJSON);

            let activeRows = [];
            let activeCols = [];
            const selectedProfile = boardSelect.value;

            // Always prefer matrix_pins from the JSON (set by KLE import or uploaded file);
            // fall back to the raw board profile only when no matrix_pins are present.
            if (currentJSON.matrix_pins) {
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
            if (currentJSON.matrix_pins && currentJSON.matrix_pins.rows) {
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
            const validation = validateMatrixIntegrity(layout, selectedProfile, activeRows, activeCols);
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
            let keyGeo = []; // per-key draw centre + matrix info, for the Amoeba layer
            const amoebaMode = !!(amoebaToggle && amoebaToggle.checked && isBottomView);

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

                    rowPin = activeRows[normalizedRow] || "N/A (Pin Limit Exceeded)";
                    colPin = activeCols[c] || "N/A (Pin Limit Exceeded)";

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
                    const geo = { index, cx, cy, rot: key.rot || 0, side, normRow: normalizedRow, c };
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
                        tooltipText += `Matrix: Row ${r}, Col ${c}\nPhysical MCU Pins:\nRow -> ${rowPin}\nCol -> ${colPin}`;
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
                    const chains = drawAmoebaLayer(svg, keyGeo, activeRows, ledPin, pinColor, amoebaLayers());
                    amoebaSvg = svg;
                    stage.appendChild(svg);
                    renderAmoebaLegend(chains, ledPin, activeRows, activeCols);
                    stage.style.width = (max_x_logical * UNIT_SIZE + 20) + 'px';
                    stage.style.height = Math.max(max_y * UNIT_SIZE + 20, 250) + 'px';
                    return;
                }

                // Draw ROWS: Connect anchors left-to-right
                Object.values(rowGroups).forEach(group => {
                    group.pts.sort((a, b) => a.x - b.x);
                    drawChain(group.pts, pinColor(group.pinIdx), ""); // solid
                });

                // Draw COLS: Connect anchors top-to-bottom
                Object.values(colGroups).forEach(group => {
                    group.pts.sort((a, b) => a.y - b.y);
                    drawChain(group.pts, pinColor(group.pinIdx), "10,6"); // dash
                });

                stage.appendChild(svg);
            }

            stage.style.width = (max_x_logical * UNIT_SIZE + 20) + 'px';
            stage.style.height = Math.max(max_y * UNIT_SIZE + 20, 250) + 'px';
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
                const numRows     = activeRows.length;
                const numCols     = activeCols.length;
                const isSplit     = currentJSON.split || false;
                const selectedProfile = boardSelect.value;

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
                const splitLine = isSplit ? [
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
                const configH = [
                    `// SPDX-License-Identifier: GPL-2.0-or-later`,
                    `// Auto-generated by Cubify`,
                    `#pragma once`,
                    ``,
                    `#define MATRIX_ROWS ${logicalRows}`,
                    `#define MATRIX_COLS ${numCols}`,
                    `#define MATRIX_ROW_PINS { ${activeRows.join(', ')} }`,
                    `#define MATRIX_COL_PINS { ${activeCols.join(', ')} }`,
                    `#define DIODE_DIRECTION ${diodeDirection}${splitLine}`,
                ].join('\n');

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
                    diode_direction: diodeDirection,
                    ...(isSplit ? { split: { enabled: true } } : {}),
                    matrix_pins: { rows: activeRows, cols: activeCols },
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

