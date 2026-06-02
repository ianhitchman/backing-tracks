<script>
  import { onMount } from "svelte";
  import { AudioEngine } from "./audioEngine.js";
  import { saveState, loadState, STORAGE_KEYS } from "./storage.js";
  import FileSelector from "./FileSelector.svelte";
  import {
    Play,
    Pause,
    SkipBack,
    Rewind,
    FastForward,
    FlagTriangleLeft,
    FlagTriangleRight,
    Repeat,
    ChevronsLeftRightEllipsis,
    SlidersHorizontal,
  } from "lucide-svelte";

  // State
  let audioEngine = new AudioEngine();
  let files = [];
  let currentFile = null;
  let currentTitle = "No Track Selected";
  let isPlaying = false;
  let currentTime = 0;
  let duration = 0;
  let showFileSelector = false;
  let showChannelSelector = false;
  let showEffectsDialog = false;
  let activeChannel = "left";
  let folderName = "";
  let waveformData = [];
  let waveformCanvas;

  // Playback control state
  let markIn = null;
  let markOut = null;
  let isLooping = false;

  // Channel volumes and mixing
  let channel1Volume = 1.0;
  let channel2Volume = 1.0;
  let channel1Left = 1.0;
  let channel1Right = 0.0;
  let channel2Left = 0.0;
  let channel2Right = 1.0;

  // Seeking state
  let isSeeking = false;

  // Effects state (pitch and tempo)
  let pitchShift = 0; // in semitones
  let tempoRate = 100; // percentage (100 = normal speed)

  onMount(async () => {
    // Load saved state
    folderName = loadState(STORAGE_KEYS.FOLDER_NAME, "");
    activeChannel = loadState(STORAGE_KEYS.ACTIVE_CHANNEL, "left");
    channel1Volume = loadState(STORAGE_KEYS.CHANNEL1_VOLUME, 1.0);
    channel2Volume = loadState(STORAGE_KEYS.CHANNEL2_VOLUME, 1.0);
    channel1Left = loadState(STORAGE_KEYS.CHANNEL1_LEFT, 1.0);
    channel1Right = loadState(STORAGE_KEYS.CHANNEL1_RIGHT, 0.0);
    channel2Left = loadState(STORAGE_KEYS.CHANNEL2_LEFT, 0.0);
    channel2Right = loadState(STORAGE_KEYS.CHANNEL2_RIGHT, 1.0);

    // Initialize audio engine first
    await audioEngine.init();

    // Apply settings to audio engine
    audioEngine.setChannel1Volume(channel1Volume);
    audioEngine.setChannel2Volume(channel2Volume);
    audioEngine.setChannel1Mix(channel1Left, channel1Right);
    audioEngine.setChannel2Mix(channel2Left, channel2Right);

    // Set up audio event listeners
    audioEngine.addEventListener("timeupdate", handleTimeUpdate);
    audioEngine.addEventListener("durationchange", handleDurationChange);
    audioEngine.addEventListener("ended", handleEnded);
    audioEngine.addEventListener("play", () => (isPlaying = true));
    audioEngine.addEventListener("pause", () => (isPlaying = false));

    // Handle window resize for waveform canvas
    const handleResize = () => {
      if (waveformCanvas) {
        const container = waveformCanvas.parentElement;
        waveformCanvas.width = container.offsetWidth;
        waveformCanvas.height = container.offsetHeight;
        drawWaveform();
      }
    };

    window.addEventListener("resize", handleResize);

    // Set initial canvas size
    if (waveformCanvas) {
      const container = waveformCanvas.parentElement;
      waveformCanvas.width = container.offsetWidth;
      waveformCanvas.height = container.offsetHeight;
    }

    return () => {
      audioEngine.removeEventListener("timeupdate", handleTimeUpdate);
      audioEngine.removeEventListener("durationchange", handleDurationChange);
      audioEngine.removeEventListener("ended", handleEnded);
      window.removeEventListener("resize", handleResize);
    };
  });

  function handleTimeUpdate() {
    if (!isSeeking) {
      currentTime = audioEngine.currentTime;

      // Check if we've reached the out mark
      if (markOut !== null && currentTime >= markOut) {
        if (isLooping && markIn !== null) {
          // Loop back to in point
          audioEngine.currentTime = markIn;
        } else if (isLooping) {
          // Loop entire track
          audioEngine.currentTime = 0;
        } else {
          // Stop at out mark
          audioEngine.pause();
        }
      }
    }
  }

  function handleDurationChange() {
    duration = audioEngine.duration;
  }

  function handleEnded() {
    if (isLooping && markIn !== null && markOut !== null) {
      // Loop back to in point
      audioEngine.currentTime = markIn;
      audioEngine.play();
    } else if (isLooping) {
      // Loop entire track
      audioEngine.currentTime = 0;
      audioEngine.play();
    } else {
      isPlaying = false;
      currentTime = 0;
    }
  }

  async function selectFolder() {
    try {
      // Try File System Access API first (supported on desktop Chrome/Edge)
      if ("showDirectoryPicker" in window) {
        const dirHandle = await window.showDirectoryPicker();
        folderName = dirHandle.name;
        saveState(STORAGE_KEYS.FOLDER_NAME, folderName);

        files = [];
        for await (const entry of dirHandle.values()) {
          if (entry.kind === "file") {
            const file = await entry.getFile();
            files.push(file);
          }
        }
        files = files; // Trigger reactivity
      } else {
        // Fallback to input file picker
        const input = document.createElement("input");
        input.type = "file";
        input.webkitdirectory = true;
        input.multiple = true;

        input.onchange = (e) => {
          const fileList = Array.from(e.target.files);
          if (fileList.length > 0) {
            // Extract folder name from path
            const path = fileList[0].webkitRelativePath || fileList[0].name;
            folderName = path.split("/")[0];
            saveState(STORAGE_KEYS.FOLDER_NAME, folderName);
            files = fileList;
          }
        };

        input.click();
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Error selecting folder:", err);
      }
    }
  }

  async function selectFile(event) {
    const file = event.detail;
    currentFile = file;
    currentTitle = file.name.replace(/\.(mp3|ogg|flac|wav)$/i, "");
    saveState(STORAGE_KEYS.CURRENT_SONG, file.name);

    await audioEngine.loadFile(file);
    showFileSelector = false;

    // Reset effects when changing songs
    resetEffects();

    // Generate waveform with more detail
    waveformData = await audioEngine.getWaveformData(file, 800);
    drawWaveform();

    // Don't auto-play, let user control playback
    isPlaying = false;
  }

  function drawWaveform() {
    if (!waveformCanvas || waveformData.length === 0) return;

    const canvas = waveformCanvas;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw waveform
    const barWidth = width / waveformData.length;
    const maxVal = Math.max(...waveformData);

    // Calculate mark positions in waveform indices
    const markInIndex =
      markIn !== null ? (markIn / duration) * waveformData.length : null;
    const markOutIndex =
      markOut !== null ? (markOut / duration) * waveformData.length : null;

    waveformData.forEach((value, i) => {
      const barHeight = (value / maxVal) * height * 0.9;
      const x = i * barWidth;
      const y = (height - barHeight) / 2;

      // Determine color based on mark positions
      let isInActiveRegion = true;

      if (markIn !== null && i < markInIndex) {
        isInActiveRegion = false; // Before mark in
      } else if (markOut !== null && i > markOutIndex) {
        isInActiveRegion = false; // After mark out
      }

      ctx.fillStyle = isInActiveRegion
        ? "rgba(255, 255, 255, 0.6)" // White for active region
        : "rgba(100, 100, 100, 0.2)"; // Grey for inactive regions

      // Draw thinner bars for more detail
      ctx.fillRect(x, y, Math.max(barWidth * 0.8, 0.5), barHeight);
    });
  }

  function togglePlayPause() {
    if (!currentFile) {
      showFileSelector = true;
      return;
    }

    if (isPlaying) {
      audioEngine.pause();
    } else {
      audioEngine.play();
    }
  }

  function handleSeekStart() {
    isSeeking = true;
  }

  function handleSeekEnd() {
    isSeeking = false;
    audioEngine.currentTime = currentTime;
  }

  function formatTime(seconds) {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  function updateChannel1Volume(e) {
    channel1Volume = parseFloat(e.target.value);
    audioEngine.setChannel1Volume(channel1Volume);
    saveState(STORAGE_KEYS.CHANNEL1_VOLUME, channel1Volume);
  }

  function updateChannel2Volume(e) {
    channel2Volume = parseFloat(e.target.value);
    audioEngine.setChannel2Volume(channel2Volume);
    saveState(STORAGE_KEYS.CHANNEL2_VOLUME, channel2Volume);
  }

  function updateChannel1Mix() {
    audioEngine.setChannel1Mix(channel1Left, channel1Right);
    saveState(STORAGE_KEYS.CHANNEL1_LEFT, channel1Left);
    saveState(STORAGE_KEYS.CHANNEL1_RIGHT, channel1Right);
  }

  function updateChannel2Mix() {
    audioEngine.setChannel2Mix(channel2Left, channel2Right);
    saveState(STORAGE_KEYS.CHANNEL2_LEFT, channel2Left);
    saveState(STORAGE_KEYS.CHANNEL2_RIGHT, channel2Right);
  }

  function openFileSelector() {
    showFileSelector = true;
    if (files.length === 0) {
      selectFolder();
    }
  }

  function skipToStart() {
    audioEngine.currentTime = markIn !== null ? markIn : 0;
  }

  function rewindSeconds() {
    audioEngine.currentTime = Math.max(0, audioEngine.currentTime - 5);
  }

  function fastForwardSeconds() {
    audioEngine.currentTime = Math.min(duration, audioEngine.currentTime + 5);
  }

  function setMarkIn() {
    markIn = markIn !== null ? null : currentTime;
    drawWaveform();
  }

  function setMarkOut() {
    markOut = markOut !== null ? null : currentTime;
    drawWaveform();
  }

  function toggleLoop() {
    isLooping = !isLooping;
  }

  function openChannelSelector() {
    showChannelSelector = true;
  }

  function selectChannel(channel) {
    activeChannel = channel;
    saveState(STORAGE_KEYS.ACTIVE_CHANNEL, channel);
    showChannelSelector = false;
  }

  function openEffectsDialog() {
    showEffectsDialog = true;
  }

  function closeEffectsDialog() {
    showEffectsDialog = false;
  }

  function updatePitch(e) {
    pitchShift = parseFloat(e.target.value);
    audioEngine.setPitchShift(pitchShift);
  }

  function updateTempo(e) {
    tempoRate = parseFloat(e.target.value);
    audioEngine.setTempoRate(tempoRate / 100);
  }

  function resetEffects() {
    pitchShift = 0;
    tempoRate = 100;
    audioEngine.setPitchShift(0);
    audioEngine.setTempoRate(1.0);
  }

  $: effectsActive = pitchShift !== 0 || tempoRate !== 100;
</script>

{#if showFileSelector}
  <FileSelector
    {files}
    {currentFile}
    on:select={selectFile}
    on:close={() => (showFileSelector = false)}
    on:changefolder={selectFolder}
  />
{/if}

<div class="player">
  <!-- Header with title -->
  <div class="header">
    <div class="header-content" on:click={openFileSelector}>
      <h1 class="title">{currentTitle}</h1>
    </div>
    <button
      class="effects-btn {effectsActive ? 'active' : ''}"
      on:click={openEffectsDialog}
      title="Pitch & Tempo"
    >
      <SlidersHorizontal size={24} />
    </button>
  </div>

  <!-- Main play button -->
  <div class="play-section">
    <button class="control-btn" on:click={skipToStart} title="Skip to start">
      <SkipBack size={28} />
    </button>

    <button class="control-btn" on:click={rewindSeconds} title="Rewind 5s">
      <Rewind size={28} />
    </button>

    <button
      class="control-btn"
      on:click={fastForwardSeconds}
      title="Fast forward 5s"
    >
      <FastForward size={28} />
    </button>

    <button class="play-btn" on:click={togglePlayPause}>
      {#if isPlaying}
        <Pause size={48} />
      {:else}
        <Play size={48} />
      {/if}
    </button>

    <button
      class="control-btn"
      class:active={markIn !== null}
      on:click={setMarkIn}
      title="Mark in point"
    >
      <FlagTriangleLeft size={28} />
    </button>

    <button
      class="control-btn"
      class:active={markOut !== null}
      on:click={setMarkOut}
      title="Mark out point"
    >
      <FlagTriangleRight size={28} />
    </button>

    <button
      class="control-btn"
      class:active={isLooping}
      on:click={toggleLoop}
      title="Toggle loop"
    >
      <Repeat size={28} />
    </button>
  </div>

  <!-- Seek bar -->
  <div class="seek-section">
    <div class="time-display">
      <span>{formatTime(currentTime)}</span>
      <span>{formatTime(duration)}</span>
    </div>
    <div class="waveform-container">
      <canvas bind:this={waveformCanvas} class="waveform-canvas"></canvas>
      <input
        type="range"
        class="seek-bar"
        min="0"
        max={duration || 0}
        value={currentTime}
        on:input={(e) => {
          currentTime = parseFloat(e.target.value);
        }}
        on:mousedown={handleSeekStart}
        on:mouseup={handleSeekEnd}
        on:touchstart={handleSeekStart}
        on:touchend={handleSeekEnd}
        style="--range-value: {duration > 0
          ? (currentTime / duration) * 100
          : 0}%;"
      />
    </div>
  </div>

  <!-- Channel controls -->
  <div class="channels">
    <div class="channel">
      <div class="channel-header">
        <h3>{activeChannel === "left" ? "Left output" : "Right output"}</h3>
        <button
          class="channel-switch-btn"
          on:click={openChannelSelector}
          title="Switch channel"
        >
          <ChevronsLeftRightEllipsis size={24} />
        </button>
      </div>

      {#if activeChannel === "left"}
        <div class="volume-sliders">
          <div class="volume-slider">
            <label>Click</label>
            <input
              type="range"
              class="range-click"
              min="0"
              max="1"
              step="0.01"
              bind:value={channel1Left}
              on:input={updateChannel1Mix}
              style="--range-value: {channel1Left * 100}%;"
            />
            <span class="slider-value">{Math.round(channel1Left * 100)}%</span>
          </div>

          <div class="volume-slider">
            <label>Track</label>
            <input
              type="range"
              class="range-track"
              min="0"
              max="1"
              step="0.01"
              bind:value={channel1Right}
              on:input={updateChannel1Mix}
              style="--range-value: {channel1Right * 100}%;"
            />
            <span class="slider-value">{Math.round(channel1Right * 100)}%</span>
          </div>

          <div class="volume-slider">
            <label>Master</label>
            <input
              type="range"
              class="range-master"
              min="0"
              max="1"
              step="0.01"
              value={channel1Volume}
              on:input={updateChannel1Volume}
              style="--range-value: {channel1Volume * 100}%;"
            />
            <span class="slider-value">{Math.round(channel1Volume * 100)}%</span
            >
          </div>
        </div>
      {:else}
        <div class="volume-sliders">
          <div class="volume-slider">
            <label>Click</label>
            <input
              type="range"
              class="range-click"
              min="0"
              max="1"
              step="0.01"
              bind:value={channel2Left}
              on:input={updateChannel2Mix}
              style="--range-value: {channel2Left * 100}%;"
            />
            <span class="slider-value">{Math.round(channel2Left * 100)}%</span>
          </div>

          <div class="volume-slider">
            <label>Track</label>
            <input
              type="range"
              class="range-track"
              min="0"
              max="1"
              step="0.01"
              bind:value={channel2Right}
              on:input={updateChannel2Mix}
              style="--range-value: {channel2Right * 100}%;"
            />
            <span class="slider-value">{Math.round(channel2Right * 100)}%</span>
          </div>

          <div class="volume-slider">
            <label>Master</label>
            <input
              type="range"
              class="range-master"
              min="0"
              max="1"
              step="0.01"
              value={channel2Volume}
              on:input={updateChannel2Volume}
              style="--range-value: {channel2Volume * 100}%;"
            />
            <span class="slider-value">{Math.round(channel2Volume * 100)}%</span
            >
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

{#if showChannelSelector}
  <div class="channel-selector-overlay">
    <div class="channel-selector">
      <h2>Select Output Channel</h2>
      <div class="channel-options">
        <button
          class="channel-option {activeChannel === 'left' ? 'active' : ''}"
          on:click={() => selectChannel("left")}
        >
          Left Output
        </button>
        <button
          class="channel-option {activeChannel === 'right' ? 'active' : ''}"
          on:click={() => selectChannel("right")}
        >
          Right Output
        </button>
      </div>
      <button class="close-btn" on:click={() => (showChannelSelector = false)}>
        Close
      </button>
    </div>
  </div>
{/if}

{#if showEffectsDialog}
  <div class="effects-overlay">
    <div class="effects-dialog">
      <div class="effects-header">
        <h2>Pitch & Tempo</h2>
        <button class="close-btn-icon" on:click={closeEffectsDialog}>✕</button>
      </div>

      <div class="effects-content">
        <div class="effect-control">
          <label>Pitch Shift</label>
          <div class="effect-value">
            {pitchShift > 0 ? "+" : ""}{pitchShift.toFixed(2)} semitones
          </div>
          <input
            type="range"
            class="effect-slider"
            min="-12"
            max="12"
            step="0.25"
            value={pitchShift}
            on:input={updatePitch}
          />
          <div class="effect-range">-12 to +12 semitones</div>
        </div>

        <div class="effect-control">
          <label>Tempo</label>
          <div class="effect-value">{tempoRate}%</div>
          <input
            type="range"
            class="effect-slider"
            min="50"
            max="200"
            step="5"
            value={tempoRate}
            on:input={updateTempo}
          />
          <div class="effect-range">50% to 200%</div>
        </div>
      </div>

      <div class="effects-footer">
        <button class="reset-btn" on:click={resetEffects}
          >Reset to Default</button
        >
        <button class="done-btn" on:click={closeEffectsDialog}>Done</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .player {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    padding: 1rem;
    gap: 1.5rem;
    /* justify-content: space-between; */
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    background: var(--bg-secondary);
    gap: 1rem;
  }

  .header-content {
    flex: 1;
    text-align: center;
    cursor: pointer;
    user-select: none;
  }

  .header-content:active {
    opacity: 0.8;
  }

  .title {
    font-size: 1.75rem;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .effects-btn {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    flex-shrink: 0;
  }

  .effects-btn.active {
    background: var(--accent-primary);
  }

  .effects-btn:active {
    opacity: 0.8;
  }

  .folder-name {
    font-size: 1rem;
    color: var(--text-secondary);
  }

  .play-section {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 1rem 0;
    gap: 1rem;
  }

  .control-btn {
    width: 3.5rem;
    height: 3.5rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .control-btn:active {
    transform: scale(0.95);
    background: var(--bg-tertiary);
  }

  .control-btn.active {
    background: var(--accent-secondary);
    color: var(--bg-primary);
  }

  .play-btn {
    width: 8rem;
    height: 8rem;
    background: var(--accent-primary);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s;
  }

  .play-btn:active {
    transform: scale(0.95);
  }

  .seek-section {
    padding: 0;
  }

  .time-display {
    display: flex;
    justify-content: space-between;
    margin-bottom: 0.75rem;
    font-size: 1.25rem;
    color: var(--text-secondary);
  }

  .waveform-container {
    position: relative;
    width: 100%;
    height: 100px;
    background: var(--bg-secondary);
    overflow: hidden;
  }

  .waveform-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 0;
  }

  .seek-bar {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100px;
    z-index: 1;
    margin: 0;
    padding: 0;
    background: linear-gradient(var(--accent-primary), var(--accent-primary)) 0 /
      var(--range-value) 100% no-repeat transparent;
    opacity: 0.5;
  }

  .seek-bar::-webkit-slider-track {
    height: 100px;
    background: transparent;
    border: none;
  }

  .seek-bar::-webkit-slider-runnable-track {
    height: 100px;
    background: transparent;
  }

  .seek-bar::-moz-range-track {
    height: 100px;
    background: var(--bg-tertiary);
    border: none;
  }

  .seek-bar::-moz-range-progress {
    height: 100px;
    background: var(--accent-primary);
  }

  .seek-bar::-webkit-slider-thumb {
    width: 0;
    height: 0;
    margin-top: 0;
    background: transparent;
    border: none;
    -webkit-appearance: none;
  }

  .seek-bar::-moz-range-thumb {
    width: 0;
    height: 0;
    background: transparent;
    border: none;
  }

  .channels {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    flex: 1;
    overflow-y: auto;
  }

  .channel {
    background: var(--bg-secondary);
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .channel-header {
    margin-bottom: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .channel-header h3 {
    font-size: 1.5rem;
    font-weight: 600;
  }

  .channel-switch-btn {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .channel-switch-btn:active {
    background: var(--accent-secondary);
  }

  .volume-sliders {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    flex: 1;
  }

  .volume-slider {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    position: relative;
  }

  .volume-slider input[type="range"] {
    margin: 0;
    padding: 0;
    display: block;
  }

  .volume-slider label {
    position: absolute;
    bottom: 0;
    left: 0.75rem;
    height: 40px;
    line-height: 40px;
    font-size: 1.125rem;
    font-weight: 600;
    color: #ffffff !important;
    pointer-events: none;
    text-transform: uppercase;
  }

  .slider-value {
    position: absolute;
    bottom: 0;
    right: 0.75rem;
    height: 40px;
    line-height: 40px;
    font-size: 1.125rem;
    font-weight: 600;
    color: #ffffff !important;
    pointer-events: none;
  }

  /* Range slider styling with visual track */
  /* Click - Pink/Magenta */
  input[type="range"].range-click {
    height: 40px;
    margin: 0;
    padding: 0;
    background: linear-gradient(#ec4899, #ec4899) 0 / var(--range-value) 100%
      no-repeat #4a1a30;
  }

  input[type="range"].range-click::-webkit-slider-track {
    height: 40px;
    background: transparent;
    border: none;
  }

  input[type="range"].range-click::-webkit-slider-runnable-track {
    height: 40px;
    background: transparent;
  }

  input[type="range"].range-click::-moz-range-track {
    height: 40px;
    background: #4a1a30;
    border: none;
  }

  input[type="range"].range-click::-moz-range-progress {
    height: 40px;
    background: #ec4899;
  }

  input[type="range"].range-click::-webkit-slider-thumb {
    background: transparent;
    width: 0;
    height: 0;
    margin-top: 0;
    border: none;
    -webkit-appearance: none;
  }

  input[type="range"].range-click::-moz-range-thumb {
    background: transparent;
    width: 0;
    height: 0;
    border: none;
  }

  /* Track - Cyan/Teal */
  input[type="range"].range-track {
    height: 40px;
    margin: 0;
    padding: 0;
    background: linear-gradient(#06b6d4, #06b6d4) 0 / var(--range-value) 100%
      no-repeat #1a3a3a;
  }

  input[type="range"].range-track::-webkit-slider-track {
    height: 40px;
    background: transparent;
    border: none;
  }

  input[type="range"].range-track::-webkit-slider-runnable-track {
    height: 40px;
    background: transparent;
  }

  input[type="range"].range-track::-moz-range-track {
    height: 40px;
    background: #1a3a3a;
    border: none;
  }

  input[type="range"].range-track::-moz-range-progress {
    height: 40px;
    background: #06b6d4;
  }

  input[type="range"].range-track::-webkit-slider-thumb {
    background: transparent;
    width: 0;
    height: 0;
    margin-top: 0;
    border: none;
    -webkit-appearance: none;
  }

  input[type="range"].range-track::-moz-range-thumb {
    background: transparent;
    width: 0;
    height: 0;
    border: none;
  }

  /* Master - Orange/Brown */
  input[type="range"].range-master {
    height: 40px;
    margin: 0;
    padding: 0;
    background: linear-gradient(#f97316, #f97316) 0 / var(--range-value) 100%
      no-repeat #3a2a1a;
  }

  input[type="range"].range-master::-webkit-slider-track {
    height: 40px;
    background: transparent;
    border: none;
  }

  input[type="range"].range-master::-webkit-slider-runnable-track {
    height: 40px;
    background: transparent;
  }

  input[type="range"].range-master::-moz-range-track {
    height: 40px;
    background: #3a2a1a;
    border: none;
  }

  input[type="range"].range-master::-moz-range-progress {
    height: 40px;
    background: #f97316;
  }

  input[type="range"].range-master::-webkit-slider-thumb {
    background: transparent;
    width: 0;
    height: 0;
    margin-top: 0;
    border: none;
    -webkit-appearance: none;
  }

  input[type="range"].range-master::-moz-range-thumb {
    background: transparent;
    width: 0;
    height: 0;
    border: none;
  }

  .slider-value {
    color: var(--text-secondary);
  }

  /* Channel Selector Dialog */
  .channel-selector-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-primary);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    padding: 2rem;
  }

  .channel-selector h2 {
    font-size: 2rem;
    font-weight: 600;
    margin-bottom: 2rem;
    text-align: center;
  }

  .channel-options {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    flex: 1;
  }

  .channel-option {
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 1.5rem;
    font-weight: 600;
    padding: 2rem;
    text-align: center;
    width: 100%;
  }

  .channel-option.active {
    background: var(--accent-primary);
  }

  .channel-option:active {
    opacity: 0.8;
  }

  .channel-selector .close-btn {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 1.25rem;
    font-weight: 600;
    padding: 1.5rem;
    margin-top: 2rem;
  }

  .channel-selector .close-btn:active {
    background: var(--bg-secondary);
  }

  /* Effects Dialog */
  .effects-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--bg-primary);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    padding: 2rem;
  }

  .effects-dialog {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .effects-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .effects-header h2 {
    font-size: 2rem;
    font-weight: 600;
  }

  .close-btn-icon {
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 1.5rem;
    width: 3rem;
    height: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  }

  .close-btn-icon:active {
    background: var(--bg-secondary);
  }

  .effects-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3rem;
    padding: 2rem 0;
  }

  .effect-control {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .effect-control label {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .effect-value {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--accent-primary);
    text-align: center;
  }

  .effect-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 100%;
    height: 50px;
    background: var(--bg-secondary);
    outline: none;
  }

  .effect-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 30px;
    height: 50px;
    background: var(--accent-primary);
    cursor: pointer;
  }

  .effect-slider::-moz-range-thumb {
    width: 30px;
    height: 50px;
    background: var(--accent-primary);
    cursor: pointer;
    border: none;
  }

  .effect-range {
    font-size: 1rem;
    color: var(--text-secondary);
    text-align: center;
  }

  .effects-footer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 2rem;
  }

  .reset-btn,
  .done-btn {
    font-size: 1.25rem;
    font-weight: 600;
    padding: 1.5rem;
  }

  .reset-btn {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  .reset-btn:active {
    background: var(--bg-secondary);
  }

  .done-btn {
    background: var(--accent-primary);
    color: var(--text-primary);
  }

  .done-btn:active {
    opacity: 0.8;
  }

  /* Mobile responsive - smaller icons */
  @media (max-width: 500px) {
    .control-btn {
      width: 2rem;
      height: 2rem;
    }

    .play-btn {
      width: 4rem;
      height: 4rem;
    }

    .control-btn :global(svg) {
      width: 14px !important;
      height: 14px !important;
    }

    .play-btn :global(svg) {
      width: 24px !important;
      height: 24px !important;
    }

    .channel-switch-btn :global(svg) {
      width: 12px !important;
      height: 12px !important;
    }
  }
</style>
