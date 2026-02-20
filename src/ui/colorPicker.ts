export interface ColorPickerOptions {
  value: string;
  onChange: (color: string) => void;
}

export function createColorPicker(container: HTMLElement, options: ColorPickerOptions): { update: (color: string) => void; destroy: () => void } {
  const popup = document.createElement('div');
  popup.className = 'color-picker-popup';
  popup.innerHTML = `
    <div class="color-spectrum">
      <div class="spectrum-gradient"></div>
      <div class="spectrum-cursor"></div>
    </div>
    <div class="hue-slider">
      <label>H</label>
      <div class="hue-track">
        <div class="hue-cursor"></div>
      </div>
    </div>
    <div class="color-preview"></div>
    <div class="color-inputs">
      <input type="text" class="hex-input" maxlength="7">
      <span>HEX</span>
    </div>
  `;
  
  container.appendChild(popup);

  const spectrum = popup.querySelector('.color-spectrum') as HTMLElement;
  const spectrumCursor = popup.querySelector('.spectrum-cursor') as HTMLElement;
  const hueTrack = popup.querySelector('.hue-track') as HTMLElement;
  const hueCursor = popup.querySelector('.hue-cursor') as HTMLElement;
  const preview = popup.querySelector('.color-preview') as HTMLElement;
  const hexInput = popup.querySelector('.hex-input') as HTMLInputElement;

  let hue = 0;
  let saturation = 100;
  let lightness = 50;
  let currentColor = options.value;

  function hexToHsl(hex: string): { h: number; s: number; l: number } {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: h * 360, s: s * 100, l: l * 100 };
  }

  function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  function updateUI() {
    const hex = hslToHex(hue, saturation, lightness);
    currentColor = hex;
    preview.style.background = hex;
    hexInput.value = hex;
    spectrumCursor.style.left = saturation + '%';
    spectrumCursor.style.top = (100 - lightness) + '%';
    spectrum.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hue},100%,50%))`;
    hueCursor.style.left = (hue / 360 * 100) + '%';
  }

  function handleSpectrumClick(e: MouseEvent) {
    const rect = spectrum.getBoundingClientRect();
    saturation = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    lightness = Math.max(0, Math.min(100, 100 - ((e.clientY - rect.top) / rect.height) * 100));
    updateUI();
    options.onChange(currentColor);
  }

  function handleHueClick(e: MouseEvent) {
    const rect = hueTrack.getBoundingClientRect();
    hue = Math.max(0, Math.min(360, ((e.clientX - rect.left) / rect.width) * 360));
    updateUI();
    options.onChange(currentColor);
  }

  spectrum.addEventListener('mousedown', (e) => {
    handleSpectrumClick(e);
    const onMove = (e: MouseEvent) => handleSpectrumClick(e);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  hueTrack.addEventListener('mousedown', (e) => {
    handleHueClick(e);
    const onMove = (e: MouseEvent) => handleHueClick(e);
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  hexInput.addEventListener('input', () => {
    const val = hexInput.value;
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      const hsl = hexToHsl(val);
      hue = hsl.h;
      saturation = hsl.s;
      lightness = hsl.l;
      updateUI();
      options.onChange(val);
    }
  });

  const init = (color: string) => {
    const hsl = hexToHsl(color);
    hue = hsl.h;
    saturation = hsl.s;
    lightness = hsl.l;
    updateUI();
  };

  init(options.value);

  return {
    update(color: string) {
      init(color);
    },
    destroy() {
      popup.remove();
    }
  };
}

export function getColorPickerStyles(): string {
  return `
    .color-picker-popup {
      position: absolute;
      display: flex;
      flex-direction: column;
      gap: 10px;
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, rgba(128,128,128,.4));
      border-radius: 8px;
      padding: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,.5);
      z-index: 1000;
      width: 220px;
    }
    .color-spectrum {
      position: relative;
      width: 100%;
      height: 120px;
      border-radius: 6px;
      cursor: crosshair;
      overflow: hidden;
    }
    .spectrum-gradient {
      width: 100%;
      height: 100%;
      background: linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(0,100%,50%));
    }
    .spectrum-cursor {
      position: absolute;
      width: 14px;
      height: 14px;
      border: 2px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 4px rgba(0,0,0,.5);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .hue-slider {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .hue-slider label {
      font-size: 10px;
      color: var(--vscode-editor-foreground, #ccc);
      width: 20px;
    }
    .hue-track {
      position: relative;
      flex: 1;
      height: 14px;
      border-radius: 7px;
      background: linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%);
      cursor: pointer;
    }
    .hue-cursor {
      position: absolute;
      width: 4px;
      height: 14px;
      background: #fff;
      border-radius: 2px;
      box-shadow: 0 0 3px rgba(0,0,0,.5);
      transform: translateX(-50%);
      pointer-events: none;
    }
    .color-preview {
      width: 100%;
      height: 24px;
      border-radius: 4px;
      border: 1px solid rgba(128,128,128,.3);
    }
    .color-inputs {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .color-inputs input {
      flex: 1;
      padding: 4px 6px;
      font-size: 11px;
      font-family: monospace;
      background: var(--vscode-input-background, #252526);
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,.4));
      border-radius: 3px;
      color: var(--vscode-input-foreground, #ccc);
    }
    .color-inputs span {
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #888);
    }
  `;
}
