const DOM = [
  'canvas', 'brushSize', 'brushSizeNum', 'hue', 'saturation', 'lightness', 'alpha',
  'gridWidth', 'gridHeight', 'generateGrid', 'clearGrid', 'exportJSON', 'exportSVG',
  'exportPNG', 'importFile', 'pixelPerfect', 'exportScaleInput', 'hexInputColorPicker',
  'zoomRange', 'zoomValue', 'backgroundSelectGrid', 'backgroundSelectPage', 'editor'
].reduce((acc, id) => (acc[id] = document.getElementById(id), acc), {});

DOM.colorPickerBtn.addEventListener('click', () => {
  currentTool = 'color-picker';
  DOM.colorPickerBtn.classList.add('active');
});

const ctx = DOM.canvas.getContext('2d');
let gridWidth = +DOM.gridWidth.value, gridHeight = +DOM.gridHeight.value;
let pixelSize = 20, brushSize = +DOM.brushSize.value;
let drawingData = [], history = [], redoStack = [];

let pixelColor = {
  h: +DOM.hue.value,
  s: +DOM.saturation.value,
  l: +DOM.lightness.value,
  a: +DOM.alpha.value
};

const toolButtons = document.querySelectorAll('.tool-button');
let currentTool = document.querySelector('.tool-button.selected')?.dataset.tool || 'brush';

toolButtons.forEach(btn => btn.addEventListener('click', () => {
  toolButtons.forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  currentTool = btn.dataset.tool;
}));

const hslToRgba = (h, s, l, a) => {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255), a };
};

const hslToHex = (h, s, l, a = 1) => {
  const { r, g, b } = hslToRgba(h, s, l, a);
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, '0')).join('')}`;
};

const hexToHsla = hex => {
  let r = 0, g = 0, b = 0;
  if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else return null;

  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r: h = ((g - b) / d) % 6; break;
      case g: h = ((b - r) / d) + 2; break;
      case b: h = ((r - g) / d) + 4; break;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
    a: 1
  };
};

const rgbToHex = (r, g, b) => {
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
};

const updateHexInput = () => {
  const { r, g, b } = hslaToRgba(pixelColor.h, pixelColor.s, pixelColor.l, pixelColor.a);
  DOM.hex.value = rgbToHex(r, g, b);
};

const updateHexInputBackground = () => {
  const { r, g, b, a } = hslToRgba(pixelColor.h, pixelColor.s, pixelColor.l, pixelColor.a);
  const rgba = `rgba(${r}, ${g}, ${b}, ${a})`;
  DOM.hexInputColorPicker.style.background = `linear-gradient(to right, ${rgba}, ${rgba}),
    radial-gradient(farthest-corner at 50% 65%, #429effff 0%, #0000ff00 70%),
    radial-gradient(farthest-corner at 20% 50%, #ffff00ff 0%, #ffffff00 70%),
    radial-gradient(farthest-corner at 80% 40%, #ff00ffff 0%, #ff000000 70%)`;
};

DOM.hexInputColorPicker.addEventListener('input', e => {
  const hsla = hexToHsla(e.target.value);
  if (!hsla) return;
  pixelColor = hsla;
  DOM.hue.value = hsla.h;
  DOM.saturation.value = hsla.s;
  DOM.lightness.value = hsla.l;
  updateHexInputBackground();
});

const getMousePos = e => {
  const rect = DOM.canvas.getBoundingClientRect(), scaleX = DOM.canvas.width / rect.width, scaleY = DOM.canvas.height / rect.height;
  return { x: Math.floor((e.clientX - rect.left) * scaleX / pixelSize), y: Math.floor((e.clientY - rect.top) * scaleY / pixelSize) };
};

const createEmptyGrid = (w, h) => {
  drawingData = Array.from({ length: h }, () => Array(w).fill(null));
  saveHistory();
};

const resizeCanvas = (w, h, pxSize) => {
  DOM.canvas.width = w * pxSize;
  DOM.canvas.height = h * pxSize;
};

const drawGrid = () => {
  ctx.clearRect(0, 0, DOM.canvas.width, DOM.canvas.height);
  for (let y = 0; y < gridHeight; y++)
    for (let x = 0; x < gridWidth; x++) {
      const c = drawingData[y][x];
      if (c) {
        ctx.fillStyle = `rgba(${c.r},${c.g},${c.b},${c.a})`;
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
      }
    }
  ctx.strokeStyle = '#555'; ctx.lineWidth = 1;
  for (let i = 0; i <= gridWidth; i++) {
    ctx.beginPath(); ctx.moveTo(i * pixelSize, 0); ctx.lineTo(i * pixelSize, gridHeight * pixelSize); ctx.stroke();
  }
  for (let i = 0; i <= gridHeight; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * pixelSize); ctx.lineTo(gridWidth * pixelSize, i * pixelSize); ctx.stroke();
  }
};

const paintPixel = (cx, cy, color) => {
  if (cx < 0 || cy < 0 || cx >= gridWidth || cy >= gridHeight) return;
  const half = Math.floor(brushSize / 2);
  for (let dy = -half; dy <= half; dy++)
    for (let dx = -half; dx <= half; dx++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && ny >= 0 && nx < gridWidth && ny < gridHeight) drawingData[ny][nx] = color;
    }
};

const bucketFill = (x, y, target, replacement) => {
  if (!colorsEqual(drawingData[y][x], target) || colorsEqual(target, replacement)) return;
  const stack = [{ x, y }];
  while (stack.length) {
    const { x: cx, y: cy } = stack.pop();
    if (cx < 0 || cy < 0 || cx >= gridWidth || cy >= gridHeight) continue;
    if (!colorsEqual(drawingData[cy][cx], target)) continue;
    drawingData[cy][cx] = replacement;
    stack.push({ x: cx + 1, y: cy }, { x: cx - 1, y: cy }, { x: cx, y: cy + 1 }, { x: cx, y: cy - 1 });
  }
};

const colorsEqual = (c1, c2) => c1 === null && c2 === null || c1 && c2 && c1.r === c2.r && c1.g === c2.g && c1.b === c2.b && Math.abs(c1.a - c2.a) < 0.01;

const saveHistory = () => { history.push(JSON.stringify(drawingData)); if (history.length > 100) history.shift(); redoStack = []; };

const undo = () => { if (!history.length) return; redoStack.push(JSON.stringify(drawingData)); drawingData = JSON.parse(history.pop()); drawGrid(); };
const redo = () => { if (!redoStack.length) return; history.push(JSON.stringify(drawingData)); drawingData = JSON.parse(redoStack.pop()); drawGrid(); };

document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
  if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) { e.preventDefault(); redo(); }
});

let isDrawing = false;
DOM.canvas.addEventListener('mousedown', e => { isDrawing = true; onCanvasClick(e); });
DOM.canvas.addEventListener('mouseup', () => isDrawing = false);
DOM.canvas.addEventListener('mouseleave', () => isDrawing = false);
DOM.canvas.addEventListener('mousemove', e => {
  if (!isDrawing || DOM.pixelPerfect.checked) return;
  const pos = getMousePos(e);
  paintPixel(pos.x, pos.y, currentTool === 'eraser' ? null : hslToRgba(pixelColor.h, pixelColor.s, pixelColor.l, pixelColor.a));
  drawGrid();
});
DOM.canvas.addEventListener('click', e => { if (DOM.pixelPerfect.checked) onCanvasClick(e); });

const onCanvasClick = e => {
  const { x, y } = getMousePos(e);
  if (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight) return;
  saveHistory();
  if (currentTool === 'fill') {
    bucketFill(x, y, drawingData[y][x], hslToRgba(pixelColor.h, pixelColor.s, pixelColor.l, pixelColor.a));
  } else {
    paintPixel(x, y, currentTool === 'eraser' ? null : hslToRgba(pixelColor.h, pixelColor.s, pixelColor.l, pixelColor.a));
  }
  if (currentTool === 'color-picker') {
    const c = drawingData[y]?.[x];
    if (c) {
      const rgbToHsla = (r, g, b) => {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;
        const d = max - min;
      
        if (d !== 0) {
          s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
          switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
          }
          h *= 60;
        }
      
        return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
      };      
    }
    currentTool = 'pen'; // revenir au crayon après avoir pické
    DOM.colorPickerBtn.classList.remove('active');
    return;
  }  
  
};

DOM.brushSize.addEventListener('input', e => (DOM.brushSizeNum.value = e.target.value, brushSize = +e.target.value));
DOM.brushSizeNum.addEventListener('input', e => {
  let v = Math.min(Math.max(+e.target.value, 1), 5);
  DOM.brushSizeNum.value = v; brushSize = v; DOM.brushSize.value = v;
});
[DOM.hue, DOM.saturation, DOM.lightness, DOM.alpha].forEach(input => input.addEventListener('input', () => {
  pixelColor = { h: +DOM.hue.value, s: +DOM.saturation.value, l: +DOM.lightness.value, a: +DOM.alpha.value };
  updateHexInput();
}));

DOM.generateGrid.addEventListener('click', () => {
  gridWidth = Math.min(Math.max(+DOM.gridWidth.value, 1), 64);
  gridHeight = Math.min(Math.max(+DOM.gridHeight.value, 1), 64);
  createEmptyGrid(gridWidth, gridHeight);
  resizeCanvas(gridWidth, gridHeight, pixelSize);
  drawGrid();
});

DOM.clearGrid.addEventListener('click', () => { createEmptyGrid(gridWidth, gridHeight); drawGrid(); });

DOM.importFile.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      const json = JSON.parse(evt.target.result);
      if (!Array.isArray(json)) throw new Error("Invalide.");
      gridHeight = json.length; gridWidth = json[0].length;
      drawingData = json.map(row => row.map(hex => {
        if (!hex) return null;
        const b = parseInt(hex.slice(1), 16);
        return { r: (b >> 24) & 255, g: (b >> 16) & 255, b: (b >> 8) & 255, a: (b & 255) / 255 };
      }));
      resizeCanvas(gridWidth, gridHeight, pixelSize); drawGrid(); saveHistory();
    } catch (err) {
      alert("Erreur : " + err.message);
    }
  };
  reader.readAsText(file);
});

DOM.exportJSON.addEventListener('click', () => {
  const data = drawingData.map(row => row.map(px => {
    if (!px) return null;
    return `#${px.r.toString(16).padStart(2, '0')}${px.g.toString(16).padStart(2, '0')}${px.b.toString(16).padStart(2, '0')}${Math.round(px.a * 255).toString(16).padStart(2, '0')}`;
  }));
  downloadText(JSON.stringify(data), "grid.json", "application/json");
});

DOM.exportSVG.addEventListener('click', () => {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${gridWidth * pixelSize}" height="${gridHeight * pixelSize}">`;
  for (let y = 0; y < gridHeight; y++)
    for (let x = 0; x < gridWidth; x++) {
      const px = drawingData[y][x];
      if (px) svg += `<rect x="${x * pixelSize}" y="${y * pixelSize}" width="${pixelSize}" height="${pixelSize}" fill="rgba(${px.r},${px.g},${px.b},${px.a})"/>`;
    }
  svg += `</svg>`;
  downloadText(svg, "grid.svg", "image/svg+xml");
});

DOM.exportPNG.addEventListener('click', () => {
  const scale = Math.max(1, +DOM.exportScaleInput.value || 1);
  const ec = document.createElement('canvas');
  ec.width = gridWidth * pixelSize * scale;
  ec.height = gridHeight * pixelSize * scale;
  const ect = ec.getContext('2d');
  for (let y = 0; y < gridHeight; y++)
    for (let x = 0; x < gridWidth; x++) {
      const px = drawingData[y][x];
      ect.fillStyle = px ? `rgba(${px.r},${px.g},${px.b},${px.a})` : 'rgba(0,0,0,0)';
      ect.fillRect(x * pixelSize * scale, y * pixelSize * scale, pixelSize * scale, pixelSize * scale);
    }
  const a = document.createElement('a');
  a.href = ec.toDataURL('image/png');
  a.download = 'grid.png';
  a.click();
});

DOM.zoomRange.addEventListener('input', e => {
  pixelSize = +e.target.value;
  DOM.zoomValue.textContent = `${pixelSize}px`;
  resizeCanvas(gridWidth, gridHeight, pixelSize);
  drawGrid();
});

DOM.backgroundSelectGrid.addEventListener('change', e => {
  DOM.canvas.style.background = e.target.value;
});

DOM.backgroundSelectPage.addEventListener('change', e => {
  const v = e.target.value;
  DOM.editor.style.background = v === 'gradient'
    ? `radial-gradient(farthest-corner at 50% 65%, #429effff 0%, #0000ff00 70%),
       radial-gradient(farthest-corner at 65% 0%, #ff914dff 0%, #0000ff00 70%),
       radial-gradient(farthest-corner at 85% 50%, #33f1ffff 0%, #0000ff00 70%),
       radial-gradient(farthest-corner at 25% 25%, #eb52ffff 0%, #0000ff00 70%),
       radial-gradient(farthest-corner at 25% 75%, #ff7300ff 0%, #0000ff00 70%),
       linear-gradient(to top, #ebebffff 0% 100%, #ffffffff 100%)`
    : v;
});

const downloadText = (text, filename, type = 'text/plain') => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
};

[DOM.hue, DOM.saturation, DOM.lightness, DOM.alpha].forEach(i => i.addEventListener('input', updateHexInputBackground));
updateHexInputBackground();

createEmptyGrid(gridWidth, gridHeight);
resizeCanvas(gridWidth, gridHeight, pixelSize);
drawGrid();
updateHexInput();
