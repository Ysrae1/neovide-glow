/* Explicit local diagnostic import only; never scrolls or captures the screen. */
import './phase-render-trace.js?v=20261025-visible-scope1';

if (!document.getElementById('glow-phase-manual-controls')) {
  const MAX_MS = 90000, MAX_TICKS = 12000;
  const workflowSource = document.querySelector('script[src*="workflow-lab.js"],script[src*="_s526-before.js"]')?.getAttribute('src') || '';
  const workflowVersion = workflowSource.includes('_s526-before') ? '修改前对照（旧版）' :
    new URL(workflowSource || location.href, location.href).searchParams.get('v') || '未标记';
  const host = document.createElement('div');
  host.id = 'glow-phase-manual-controls';
  host.setAttribute('data-no-translate', '');
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', '手动渲染记录');
  host.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;gap:8px;flex-wrap:wrap;max-width:calc(100vw - 24px);padding:9px 11px;background:Canvas;color:CanvasText;border:1px solid GrayText;font:12px/1.4 system-ui;';
  const startButton = document.createElement('button');
  const stopButton = document.createElement('button');
  const status = document.createElement('span');
  const syncInfo = document.createElement('span');
  startButton.type = stopButton.type = 'button';
  startButton.textContent = '开始记录';
  stopButton.textContent = '停止并导出日志';
  stopButton.disabled = true;
  status.textContent = '00:00.000 / 同步序号 S000000 · 最长 90 秒';
  status.style.fontVariantNumeric = 'tabular-nums';
  status.setAttribute('aria-live', 'off');
  syncInfo.textContent = `页面版本 ${workflowVersion} · 自动对时序号，不是实际 Paint 或显示器帧号`;
  syncInfo.style.cssText = 'flex-basis:100%;font-size:10px;overflow-wrap:anywhere;';
  host.append(startButton, stopButton, status, syncInfo);
  document.body.append(host);

  let recording = false, profiling = false, started = 0, startedAt = '';
  let markers = [], syncTicks = [], syncFrame = 0, deadline, savedReport, stoppedAt = '', elapsed = 0;
  let startWallTimeMs = 0, syncIndex = 0, flashUntil = 0, displayElapsedMs = 0;
  const clock = () => {
    const ms = Math.max(0, Math.floor(Math.min(MAX_MS, displayElapsedMs)));
    return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  const syncId = () => `S${String(syncIndex).padStart(6, '0')}`;
  const updateStatus = () => {
    const flash = recording && performance.now() < flashUntil;
    status.textContent = `${clock()} / 同步序号 ${syncId()}${flash ? ' · 同步 START' : ''}`;
    status.style.background = flash ? '#ffdc38' : '';
    status.style.color = flash ? '#151515' : '';
    status.style.fontWeight = flash ? '750' : '';
  };
  function finishRecording() {
    if (!recording) return;
    elapsed = Math.min(MAX_MS, performance.now() - started);
    recording = false;
    cancelAnimationFrame(syncFrame); syncFrame = 0; clearTimeout(deadline);
    savedReport = window.GlowPhaseTrace.stop();
    stoppedAt = new Date().toISOString();
    if (profiling) { console.profileEnd?.('GlowManualPhase'); profiling = false; }
    updateStatus();
  }
  function syncTick() {
    syncFrame = 0;
    if (!recording) return;
    const performanceNowMs = performance.now();
    displayElapsedMs = performanceNowMs - started;
    syncIndex++;
    syncTicks.push({ syncId: syncId(), performanceNowMs,
      elapsedMs: +displayElapsedMs.toFixed(3), wallTimeMs: Date.now() });
    updateStatus();
    if (syncTicks.length >= MAX_TICKS || displayElapsedMs >= MAX_MS) {
      finishRecording();
      status.textContent = `${clock()} / 同步序号 ${syncId()} · 已到记录上限，请导出日志`;
      return;
    }
    syncFrame = requestAnimationFrame(syncTick);
  }
  function filename() {
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    return `glow-phase-manual-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.json`;
  }
  startButton.addEventListener('click', () => {
    if (recording) return;
    if (window.GlowPhaseTrace.report().active) {
      status.textContent = '已有其他记录运行，请先停止该记录。'; return;
    }
    try {
      console.profile?.('GlowManualPhase'); profiling = true;
      started = performance.now(); startWallTimeMs = Date.now(); startedAt = new Date(startWallTimeMs).toISOString();
      window.GlowPhaseTrace.start();
      syncIndex = 0; syncTicks = []; displayElapsedMs = 0;
      markers = [{ id: 'START', label: '同步 START', performanceNowMs: started,
        elapsedMs: 0, wallTimeMs: startWallTimeMs, at: startedAt }];
      savedReport = null; stoppedAt = ''; elapsed = 0; recording = true;
      flashUntil = performance.now() + 1000;
      syncInfo.textContent = `页面版本 ${workflowVersion} · START ${startedAt} · S序号不是Paint或显示帧号`;
      console.timeStamp?.(`GlowManualPhase START ${startedAt}`);
      startButton.disabled = true; stopButton.disabled = false;
      updateStatus(); syncFrame = requestAnimationFrame(syncTick);
      deadline = setTimeout(() => {
        finishRecording();
        status.textContent = `${clock()} / 同步序号 ${syncId()} · 已到时停止，请点击导出日志`;
      }, MAX_MS);
    } catch (error) {
      if (profiling) { console.profileEnd?.('GlowManualPhase'); profiling = false; }
      status.textContent = `无法开始记录：${error.message}`;
    }
  });
  stopButton.addEventListener('click', () => {
    finishRecording();
    if (!savedReport) return;
    const data = { ...savedReport, manualSession: { startedAt, stoppedAt,
      startISOString: startedAt, performanceTimeOriginMs: performance.timeOrigin,
      startPerformanceNowMs: started, startWallTimeMs, elapsedMs: +elapsed.toFixed(2),
      pageUrl: location.href, workflowSource, workflowVersion,
      traceToVideoOffsetMs: +(savedReport.startPerformanceNowMs - started).toFixed(3),
      viewport: { width:innerWidth, height:innerHeight, devicePixelRatio },
      comparison: { field:document.documentElement.dataset.brandField, stageOpaque:false },
      timingPurpose: 'Automatic recording/log synchronization only; sync IDs are not Paint or display frame IDs' }, markers, syncTicks };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const download = document.createElement('a');
    download.href = url; download.download = filename(); download.hidden = true;
    document.body.append(download); download.click(); download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = `${clock()} / 同步序号 ${syncId()} · 已导出`;
    startButton.disabled = false; stopButton.disabled = true;
  });
  addEventListener('pagehide', finishRecording, { once: true });
}
