/* Precompose the small phase-button fill for the continuous-corner fallback.
 * The decoded colour frame and grain share document coordinates;
 * the corner layer continues to own clipping, borders, and shadows. Original
 * labels retain layout and accessibility after their pixels move to the canvas.
 */
export function createPhaseFlatFill({ grainUrl, grainSize = 180, onReady = () => {} }) {
  const root = document.documentElement;
  const records = new Map();
  const probes = new Map();
  const grain = new Image();
  const tileSize = Number.isFinite(grainSize) && grainSize > 0 ? grainSize : 180;
  let frame = null, frameViewport = null, frameSerial = 0, grainReady = false;
  let tile = null, tileDpr = 0;
  let draws = 0, lastDrawMs = 0, maxDrawMs = 0, failures = 0, lastError = '';

  // This is the same static SVG used by the CSS path. Decode it once; no frame
  // image is encoded here, and only a small retina grain tile is retained.
  grain.src = grainUrl;
  grain.decode().then(() => {
    grainReady = true;
    onReady();
  }, error => {
    lastError = String(error?.message || error);
  });

  function releaseCanvas(el) {
    const record = records.get(el);
    if (record) {
      record.canvas.remove();
      records.delete(el);
    }
    for (const name of ['brand-field-flat', 'brand-field-flat-text', 'brand-field-phase-text']) {
      if (el?.classList.contains(name)) el.classList.remove(name);
    }
  }

  function release(el) {
    releaseCanvas(el);
    const probe = probes.get(el);
    if (probe) {
      probe.marker.remove();
      probes.delete(el);
    }
  }

  function canvasTextColour(color) {
    // WebKit may retain a wide-colour CSS object even for an sRGB declaration.
    // Use an ordinary 8-bit colour for the same channels when painting text.
    const match = color.trim().match(/^color\(\s*srgb\s+(.+)\)$/i);
    if (!match) return color;
    const [channels, opacity = '1'] = match[1].split(/\s*\/\s*/);
    const number = value => value.endsWith('%') ? Number.parseFloat(value) / 100 : Number(value);
    const rgb = channels.trim().split(/\s+/).map(number);
    const alpha = number(opacity.trim());
    if (rgb.length !== 3 || !rgb.every(Number.isFinite) || !Number.isFinite(alpha)) return color;
    return `rgba(${rgb.map(channel => Math.round(channel * 255)).join(',')},${alpha})`;
  }

  function grainTile(dpr) {
    if (tile && tileDpr === dpr) return tile;
    const next = document.createElement('canvas');
    next.width = next.height = Math.ceil(tileSize * dpr);
    const context = next.getContext('2d');
    if (!context) throw new Error('Phase grain canvas is unavailable');
    context.drawImage(grain, 0, 0, next.width, next.height);
    tile = next;
    tileDpr = dpr;
    return tile;
  }

  function paintPlainText(el, geometry, label, record) {
    const { width, height, scaleX, scaleY, dpr } = geometry;
    const values = [width, height, scaleX, scaleY, dpr];
    const direction = label.direction === 'rtl' ? 'rtl' : 'ltr';
    const letterSpacing = !label.letterSpacing || label.letterSpacing === 'normal' ? '0px' : label.letterSpacing;
    const textX = direction === 'rtl' ? label.x + label.width : label.x;
    if (!values.every(n => Number.isFinite(n) && n > 0) ||
        !Number.isFinite(textX) || !Number.isFinite(label.baseline) ||
        typeof label.font !== 'string' || !label.font || typeof label.color !== 'string' || !label.color) {
      releaseCanvas(el);
      return false;
    }
    const bitmapWidth = Math.ceil(width * scaleX * dpr);
    const bitmapHeight = Math.ceil(height * scaleY * dpr);
    if (!Number.isSafeInteger(bitmapWidth) || !Number.isSafeInteger(bitmapHeight)) {
      releaseCanvas(el);
      return false;
    }
    const text = String(label.text ?? '');
    // Plain labels have no viewport-aligned material. Scrolling the button or
    // publishing a new colour frame must not redraw these unchanged glyphs.
    const key = JSON.stringify([...values, text, label.x, label.width, label.baseline,
      label.font, label.color, letterSpacing, direction, label.fontKerning]);
    if (record?.geometryKey === key && record.labelNode === label.node) return true;
    const began = performance.now();
    const canvas = record?.canvas || document.createElement('canvas');
    try {
      if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
      if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;
      const context = record?.context || canvas.getContext('2d');
      if (!context) throw new Error('Phase label canvas is unavailable');
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.clearRect(0, 0, bitmapWidth, bitmapHeight);
      context.setTransform(bitmapWidth / width, 0, 0, bitmapHeight / height, 0, 0);
      context.font = label.font;
      context.fillStyle = canvasTextColour(label.color);
      context.textBaseline = 'alphabetic';
      context.textAlign = direction === 'rtl' ? 'right' : 'left';
      if ('direction' in context) context.direction = direction;
      if ('letterSpacing' in context) context.letterSpacing = letterSpacing;
      if ('fontKerning' in context) context.fontKerning = label.fontKerning || 'auto';
      context.fillText(text, textX, label.baseline);
      if (!record) {
        canvas.className = 'brand-field-phase-label-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        el.append(canvas);
        record = { canvas, context, plainText: true, geometryKey: key,
          labelNode: label.node, textDrawn: true };
        records.set(el, record);
      } else record.geometryKey = key;
      if (!el.classList.contains('brand-field-phase-text')) el.classList.add('brand-field-phase-text');
      draws++;
      lastDrawMs = performance.now() - began;
      maxDrawMs = Math.max(maxDrawMs, lastDrawMs);
      lastError = '';
      return true;
    } catch (error) {
      failures++;
      lastError = String(error?.message || error);
      canvas.remove();
      release(el);
      return false;
    }
  }

  function paint(el, geometry) {
    if (!root.classList.contains('cc-fallback') ||
        !el?.matches('.wf-phases button') ||
        (el.classList.contains('brand-field-fill') && !el.classList.contains('cc-host'))) {
      release(el);
      return false;
    }
    const label = geometry?.label;
    const labelNode = label?.node;
    if (!labelNode?.append || !el.contains(labelNode)) {
      release(el);
      return false;
    }
    const plainText = !el.classList.contains('brand-field-fill');
    const fill = plainText ? null : el.querySelector(':scope > .cc-paint > .cc-fill');
    const parent = plainText ? el : fill;
    let record = records.get(el);
    let probe = probes.get(el);
    if (record && (!!record.plainText !== plainText || (!plainText && record.fill !== fill) ||
        record.canvas.parentNode !== parent)) {
      releaseCanvas(el);
      record = null;
    }
    if (probe && (probe.node !== labelNode || probe.marker.parentNode !== labelNode)) {
      release(el);
      record = null;
      probe = null;
    }
    if (!probe) {
      const marker = document.createElement('span');
      marker.className = 'brand-field-baseline';
      marker.setAttribute('aria-hidden', 'true');
      labelNode.append(marker);
      probes.set(el, { node: labelNode, marker });
      // Its zero-height inline box exposes the real alphabetic baseline. The
      // caller reads it with the next existing geometry batch, avoiding layout
      // reads in this paint path and leaving the DOM label visible meanwhile.
      onReady();
      return false;
    }
    if (plainText) return paintPlainText(el, geometry, label, record);
    if (!frame || !frameViewport || !grainReady || !fill) {
      releaseCanvas(el);
      return false;
    }
    const { left, top, width, height, scaleX, scaleY, dpr } = geometry;
    const {frameWidth,frameHeight,left:frameLeft,top:frameTop} = frameViewport;
    const values = [left, top, width, height, scaleX, scaleY, frameWidth, frameHeight, frameLeft, frameTop, dpr];
    const direction = label.direction === 'rtl' ? 'rtl' : 'ltr';
    const letterSpacing = !label.letterSpacing || label.letterSpacing === 'normal' ? '0px' : label.letterSpacing;
    const textX = direction === 'rtl' ? label.x + label.width : label.x;
    if (!values.every(Number.isFinite) ||
        ![width, height, scaleX, scaleY, frameWidth, frameHeight, dpr].every(n => n > 0) ||
        !Number.isFinite(textX) || !Number.isFinite(label.baseline) ||
        typeof label.font !== 'string' || !label.font || typeof label.color !== 'string' || !label.color) {
      releaseCanvas(el);
      return false;
    }
    const bitmapWidth = Math.ceil(width * scaleX * dpr);
    const bitmapHeight = Math.ceil(height * scaleY * dpr);
    if (!Number.isSafeInteger(bitmapWidth) || !Number.isSafeInteger(bitmapHeight)) {
      releaseCanvas(el);
      return false;
    }

    const text = String(label.text ?? '');
    const emphasis = Number.isFinite(geometry.emphasis) ? Math.max(0, Math.min(1, geometry.emphasis)) : 1;
    const key = JSON.stringify([...values, emphasis, text, label.x, label.width, label.baseline,
      label.font, label.color, letterSpacing, direction, label.fontKerning]);
    if (record?.frameSerial === frameSerial && record.geometryKey === key &&
        record.labelNode === labelNode) return true;

    const began = performance.now();
    const canvas = record?.canvas || document.createElement('canvas');
    const background = record?.background || document.createElement('canvas');
    try {
      const grainCanvas = grainTile(dpr);
      if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
      if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;
      if (background.width !== bitmapWidth) background.width = bitmapWidth;
      if (background.height !== bitmapHeight) background.height = bitmapHeight;
      const context = record?.context || canvas.getContext('2d');
      const backgroundContext = record?.backgroundContext || background.getContext('2d');
      if (!context || !backgroundContext) throw new Error('Phase fill canvas is unavailable');
      backgroundContext.setTransform(bitmapWidth / width, 0, 0, bitmapHeight / height, 0, 0);
      backgroundContext.globalAlpha = 1;
      backgroundContext.globalCompositeOperation = 'source-over';
      backgroundContext.fillStyle = '#969af7';
      backgroundContext.fillRect(0, 0, width, height);
      if(frameViewport.repeatY){
        const fieldPattern=backgroundContext.createPattern(frame,'repeat-y');
        if(!fieldPattern?.setTransform)throw new Error('Phase field transform is unavailable');
        fieldPattern.setTransform(new DOMMatrix([frameWidth/scaleX/frame.naturalWidth,0,
          0,frameHeight/scaleY/frame.naturalHeight,(frameLeft-left)/scaleX,(frameTop-top)/scaleY]));
        backgroundContext.fillStyle=fieldPattern;
        backgroundContext.fillRect(0,0,width,height);
      }else backgroundContext.drawImage(frame, (frameLeft-left) / scaleX, (frameTop-top) / scaleY,
        frameWidth / scaleX, frameHeight / scaleY);

      const pattern = backgroundContext.createPattern(grainCanvas, 'repeat');
      if (!pattern?.setTransform) throw new Error('Phase grain transform is unavailable');
      pattern.setTransform(new DOMMatrix([
        tileSize / scaleX / grainCanvas.width, 0,
        0, tileSize / scaleY / grainCanvas.height,
        -left / scaleX, -top / scaleY
      ]));
      backgroundContext.globalCompositeOperation = 'overlay';
      if (backgroundContext.globalCompositeOperation !== 'overlay') throw new Error('Phase overlay blend is unavailable');
      backgroundContext.fillStyle = pattern;
      backgroundContext.fillRect(0, 0, width, height);
      backgroundContext.globalCompositeOperation = 'source-over';

      // Apply the emphasis once to the complete opaque material. Text retains
      // its own alpha even when the animated button material is fully absent.
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.clearRect(0, 0, bitmapWidth, bitmapHeight);
      context.globalAlpha = emphasis;
      context.drawImage(background, 0, 0);
      context.globalAlpha = 1;
      context.setTransform(bitmapWidth / width, 0, 0, bitmapHeight / height, 0, 0);
      context.font = label.font;
      context.fillStyle = canvasTextColour(label.color);
      context.textBaseline = 'alphabetic';
      context.textAlign = direction === 'rtl' ? 'right' : 'left';
      if ('direction' in context) context.direction = direction;
      if ('letterSpacing' in context) context.letterSpacing = letterSpacing;
      if ('fontKerning' in context) context.fontKerning = label.fontKerning || 'auto';
      context.fillText(text, textX, label.baseline);

      if (!record) {
        canvas.className = 'brand-field-flat-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        fill.append(canvas);
        record = { canvas, context, background, backgroundContext, fill,
          frameSerial, geometryKey: key, labelNode, textDrawn: true };
        records.set(el, record);
      } else {
        record.frameSerial = frameSerial;
        record.geometryKey = key;
      }
      // Keep the CSS fill until the first complete composition is available.
      if (!el.classList.contains('brand-field-flat')) el.classList.add('brand-field-flat');
      if (!el.classList.contains('brand-field-flat-text')) el.classList.add('brand-field-flat-text');
      draws++;
      lastDrawMs = performance.now() - began;
      maxDrawMs = Math.max(maxDrawMs, lastDrawMs);
      lastError = '';
      return true;
    } catch (error) {
      failures++;
      lastError = String(error?.message || error);
      canvas.remove();
      release(el);
      return false;
    }
  }

  return {
    setFrame(image, viewport) {
      frame = image;
      frameViewport = viewport;
      frameSerial++;
    },
    paint,
    release,
    clear() {
      for (const el of new Set([...records.keys(), ...probes.keys()])) release(el);
    },
    get state() {
      return {
        draws, activeCanvases: records.size, lastDrawMs, maxDrawMs,
        textCanvases: [...records.values()].filter(record => record.textDrawn).length,
        plainTextCanvases: [...records.values()].filter(record => record.plainText).length,
        baselineProbes: probes.size,
        ready: grainReady, frame: !!frame, frameSerial, tileDpr, failures, lastError
      };
    }
  };
}
