// Web Audio API engine for stereo channel mixing and routing

export class AudioEngine {
  constructor() {
    this.audioContext = null;
    this.audioElement = null;
    this.sourceNode = null;
    this.splitter = null;
    this.merger = null;
    this.channel1Gain = null;
    this.channel2Gain = null;

    // Mix settings: how much of L/R input goes to each output channel
    this.channel1Mix = { left: 1.0, right: 0.0 }; // Ch1 = 100% left input
    this.channel2Mix = { left: 0.0, right: 1.0 }; // Ch2 = 100% right input

    // Effects settings
    this.pitchShift = 0; // in semitones
    this.tempoRate = 1.0; // 1.0 = normal speed

    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    // Create audio context
    this.audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();

    // Create audio element
    this.audioElement = new Audio();
    this.audioElement.crossOrigin = "anonymous";

    // Create Web Audio nodes
    this.sourceNode = this.audioContext.createMediaElementSource(
      this.audioElement,
    );

    // Splitter splits stereo input into separate L/R channels
    this.splitter = this.audioContext.createChannelSplitter(2);

    // Create gain nodes for each output channel
    this.channel1Gain = this.audioContext.createGain();
    this.channel2Gain = this.audioContext.createGain();

    // Merger combines channels back to stereo output
    this.merger = this.audioContext.createChannelMerger(2);

    // Connect: source -> splitter
    this.sourceNode.connect(this.splitter);

    // We'll set up the mixing connections
    this.updateMixing();

    // Connect gains to merger
    this.channel1Gain.connect(this.merger, 0, 0); // Ch1 to left output
    this.channel2Gain.connect(this.merger, 0, 1); // Ch2 to right output

    // Connect to destination
    this.merger.connect(this.audioContext.destination);

    this.initialized = true;
  }

  updateMixing() {
    if (!this.initialized) return;

    // Disconnect existing connections
    this.splitter.disconnect();

    // Create gain nodes for mixing
    const ch1LeftGain = this.audioContext.createGain();
    const ch1RightGain = this.audioContext.createGain();
    const ch2LeftGain = this.audioContext.createGain();
    const ch2RightGain = this.audioContext.createGain();

    // Set mix levels
    ch1LeftGain.gain.value = this.channel1Mix.left;
    ch1RightGain.gain.value = this.channel1Mix.right;
    ch2LeftGain.gain.value = this.channel2Mix.left;
    ch2RightGain.gain.value = this.channel2Mix.right;

    // Channel 1 mixing: L input * mix.left + R input * mix.right -> Ch1 Gain
    this.splitter.connect(ch1LeftGain, 0); // Left input
    this.splitter.connect(ch1RightGain, 1); // Right input
    ch1LeftGain.connect(this.channel1Gain);
    ch1RightGain.connect(this.channel1Gain);

    // Channel 2 mixing: L input * mix.left + R input * mix.right -> Ch2 Gain
    this.splitter.connect(ch2LeftGain, 0); // Left input
    this.splitter.connect(ch2RightGain, 1); // Right input
    ch2LeftGain.connect(this.channel2Gain);
    ch2RightGain.connect(this.channel2Gain);
  }

  setChannel1Mix(left, right) {
    this.channel1Mix = { left, right };
    this.updateMixing();
  }

  setChannel2Mix(left, right) {
    this.channel2Mix = { left, right };
    this.updateMixing();
  }

  setChannel1Volume(volume) {
    if (this.channel1Gain) {
      this.channel1Gain.gain.value = volume;
    }
  }

  setChannel2Volume(volume) {
    if (this.channel2Gain) {
      this.channel2Gain.gain.value = volume;
    }
  }

  async loadFile(file) {
    await this.init();

    // Resume audio context if suspended (required for some browsers)
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    const url = URL.createObjectURL(file);
    this.audioElement.src = url;
    await this.audioElement.load();
  }

  async getWaveformData(file, samples = 500) {
    await this.init();

    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

    const channels = audioBuffer.numberOfChannels;
    const blockSize = Math.floor(audioBuffer.length / samples);
    const waveformData = [];

    for (let i = 0; i < samples; i++) {
      let blockStart = blockSize * i;
      let max = 0;

      // Mix both channels together
      for (let j = 0; j < blockSize; j++) {
        let mixedSample = 0;

        // Sum all channels
        for (let ch = 0; ch < channels; ch++) {
          const channelData = audioBuffer.getChannelData(ch);
          mixedSample += channelData[blockStart + j];
        }

        // Average the mixed sample
        mixedSample = mixedSample / channels;

        // Track maximum
        max = Math.max(max, Math.abs(mixedSample));
      }

      waveformData.push(max);
    }

    return waveformData;
  }

  play() {
    if (this.audioElement) {
      return this.audioElement.play();
    }
  }

  pause() {
    if (this.audioElement) {
      this.audioElement.pause();
    }
  }

  get currentTime() {
    return this.audioElement ? this.audioElement.currentTime : 0;
  }

  set currentTime(time) {
    if (this.audioElement) {
      this.audioElement.currentTime = time;
    }
  }

  get duration() {
    return this.audioElement ? this.audioElement.duration : 0;
  }

  get paused() {
    return this.audioElement ? this.audioElement.paused : true;
  }

  addEventListener(event, callback) {
    if (this.audioElement) {
      this.audioElement.addEventListener(event, callback);
    }
  }

  setPitchShift(semitones) {
    // Store pitch shift value for future implementation
    this.pitchShift = semitones;
    this.updatePlaybackRate();
  }

  setTempoRate(rate) {
    // Store tempo rate (1.0 = normal, 0.5 = half speed, 2.0 = double speed)
    this.tempoRate = rate;
    this.updatePlaybackRate();
  }

  updatePlaybackRate() {
    if (!this.audioElement) return;

    // For now, use a combined approach:
    // playbackRate affects both pitch and tempo
    // We'll use playbackRate for tempo and compensate pitch later
    const tempoMultiplier = this.tempoRate || 1.0;
    const pitchMultiplier = this.pitchShift
      ? Math.pow(2, this.pitchShift / 12)
      : 1.0;

    // For independent control, we'd need to:
    // 1. Use playbackRate for tempo
    // 2. Apply pitch shifting separately to compensate
    // For now, this is a simplified version
    this.audioElement.playbackRate = tempoMultiplier;

    // TODO: Add independent pitch shifting using soundtouchjs or similar
    // This would require processing the audio through a pitch shifter
    // while keeping the tempo constant
  }

  removeEventListener(event, callback) {
    if (this.audioElement) {
      this.audioElement.removeEventListener(event, callback);
    }
  }
}
