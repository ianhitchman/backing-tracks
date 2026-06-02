// Web Audio API engine with soundtouchjs for independent pitch/tempo control
import { SoundTouch, SimpleFilter, WebAudioBufferSource } from 'soundtouchjs';

export class AudioEngine {
  constructor() {
    this.audioContext = null;
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

    // Audio buffer management
    this.originalBuffer = null;
    this.processedBuffer = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.pausedAt = 0;
    this.currentTime = 0;
    
    // Event callbacks
    this.eventCallbacks = {
      play: [],
      pause: [],
      timeupdate: [],
      ended: [],
      durationchange: [],
    };

    this.initialized = false;
    this.updateInterval = null;
  }

  async init() {
    if (this.initialized) return;

    // Create audio context
    this.audioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();

    // Splitter splits stereo input into separate L/R channels
    this.splitter = this.audioContext.createChannelSplitter(2);

    // Create gain nodes for each output channel
    this.channel1Gain = this.audioContext.createGain();
    this.channel2Gain = this.audioContext.createGain();

    // Merger combines channels back to stereo output
    this.merger = this.audioContext.createChannelMerger(2);

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

    // Stop current playback
    this.stop();

    // Load and decode audio file
    const arrayBuffer = await file.arrayBuffer();
    this.originalBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
    
    // Process with current effects settings
    await this.processAudio();
    
    // Reset playback state
    this.pausedAt = 0;
    this.currentTime = 0;
    
    // Trigger duration change event
    this.triggerEvent('durationchange');
  }

  async processAudio() {
    if (!this.originalBuffer) return;

    // If no effects are active, use original buffer
    if (this.pitchShift === 0 && this.tempoRate === 1.0) {
      this.processedBuffer = this.originalBuffer;
      return;
    }

    console.log('Processing audio with pitch:', this.pitchShift, 'semitones, tempo:', this.tempoRate);

    try {
      const sampleRate = this.originalBuffer.sampleRate;
      const numberOfChannels = this.originalBuffer.numberOfChannels;
      
      // Create SoundTouch instance and configure it
      const soundTouch = new SoundTouch();
      soundTouch.pitchSemitones = this.pitchShift;
      soundTouch.tempo = this.tempoRate;
      
      console.log('SoundTouch configured: pitchSemitones=', this.pitchShift, 'tempo=', this.tempoRate);
      
      // Create source from buffer
      const source = new WebAudioBufferSource(this.originalBuffer);
      
      // Create filter with source and soundtouch
      const filter = new SimpleFilter(source, soundTouch);
      
      // Process audio in frames (stereo)
      const processedSamples = [];
      const batchSize = 4096; // frames, not samples
      const tempBuffer = new Float32Array(batchSize * 2); // interleaved stereo
      
      let totalFrames = 0;
      while (true) {
        const framesExtracted = filter.extract(tempBuffer, batchSize);
        if (framesExtracted === 0) break;
        
        // Store the interleaved stereo samples
        for (let i = 0; i < framesExtracted * 2; i++) {
          processedSamples.push(tempBuffer[i]);
        }
        totalFrames += framesExtracted;
      }
      
      console.log('Extracted', totalFrames, 'frames,', processedSamples.length, 'samples total');
      
      // Ensure we got valid data
      if (processedSamples.length === 0) {
        console.warn('Audio processing produced no output, using original buffer');
        this.processedBuffer = this.originalBuffer;
        return;
      }
      
      // Create new audio buffer with processed data
      // De-interleave the stereo data back into separate channels
      this.processedBuffer = this.audioContext.createBuffer(
        numberOfChannels,
        totalFrames,
        sampleRate
      );
      
      const leftChannel = this.processedBuffer.getChannelData(0);
      const rightChannel = numberOfChannels > 1 ? this.processedBuffer.getChannelData(1) : leftChannel;
      
      for (let i = 0; i < totalFrames; i++) {
        leftChannel[i] = processedSamples[i * 2];
        if (numberOfChannels > 1) {
          rightChannel[i] = processedSamples[i * 2 + 1];
        }
      }
      
      console.log('Audio processing complete, duration:', this.processedBuffer.duration);
    } catch (error) {
      console.error('Error processing audio with effects:', error);
      // Fall back to original buffer if processing fails
      this.processedBuffer = this.originalBuffer;
    }
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
    if (!this.processedBuffer || this.isPlaying) return Promise.resolve();

    // Resume audio context if needed
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    // Stop any existing source
    if (this.sourceNode) {
      // Clear the onended handler to prevent it from interfering
      this.sourceNode.onended = null;
      try {
        this.sourceNode.stop();
      } catch (e) {
        // Source might already be stopped
      }
      this.sourceNode.disconnect();
    }

    // Create new buffer source
    this.sourceNode = this.audioContext.createBufferSource();
    this.sourceNode.buffer = this.processedBuffer;
    
    // Connect to audio graph
    this.sourceNode.connect(this.splitter);
    
    // Handle ended event
    this.sourceNode.onended = () => {
      if (this.isPlaying) {
        this.isPlaying = false;
        this.pausedAt = 0;
        this.currentTime = 0;
        this.triggerEvent('ended');
        this.stopTimeUpdate();
      }
    };
    
    // Start playback from current position
    this.startTime = this.audioContext.currentTime - this.pausedAt;
    this.sourceNode.start(0, this.pausedAt);
    this.isPlaying = true;
    
    this.triggerEvent('play');
    this.startTimeUpdate();
    
    return Promise.resolve();
  }

  pause() {
    if (!this.isPlaying) return;

    // Stop the source
    if (this.sourceNode) {
      // Clear the onended handler to prevent it from interfering
      this.sourceNode.onended = null;
      try {
        this.sourceNode.stop();
      } catch (e) {
        // Source might already be stopped
      }
    }
    
    // Save current position
    this.pausedAt = this.audioContext.currentTime - this.startTime;
    this.currentTime = this.pausedAt;
    this.isPlaying = false;
    
    this.triggerEvent('pause');
    this.stopTimeUpdate();
  }

  stop() {
    if (this.sourceNode) {
      // Clear the onended handler to prevent it from interfering
      this.sourceNode.onended = null;
      try {
        this.sourceNode.stop();
      } catch (e) {
        // Already stopped
      }
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    
    this.isPlaying = false;
    this.pausedAt = 0;
    this.currentTime = 0;
    this.stopTimeUpdate();
  }

  get duration() {
    return this.processedBuffer ? this.processedBuffer.duration : 0;
  }

  get paused() {
    return !this.isPlaying;
  }
  
  // Getter returns current playback position
  getCurrentTime() {
    if (this.isPlaying) {
      return this.audioContext.currentTime - this.startTime;
    }
    return this.pausedAt;
  }
  
  // Setter seeks to new position
  setCurrentTime(time) {
    this.seekTo(time);
  }

  seekTo(time) {
    const wasPlaying = this.isPlaying;
    
    if (this.isPlaying) {
      this.stop();
    }
    
    this.pausedAt = Math.max(0, Math.min(time, this.duration));
    
    if (wasPlaying) {
      this.play();
    }
  }

  startTimeUpdate() {
    this.stopTimeUpdate();
    this.updateInterval = setInterval(() => {
      if (this.isPlaying) {
        this.currentTime = this.audioContext.currentTime - this.startTime;
        this.triggerEvent('timeupdate');
      }
    }, 100); // Update every 100ms
  }

  stopTimeUpdate() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
  }

  addEventListener(event, callback) {
    if (!this.eventCallbacks[event]) {
      this.eventCallbacks[event] = [];
    }
    this.eventCallbacks[event].push(callback);
  }

  removeEventListener(event, callback) {
    if (this.eventCallbacks[event]) {
      this.eventCallbacks[event] = this.eventCallbacks[event].filter(
        (cb) => cb !== callback
      );
    }
  }

  triggerEvent(event) {
    if (this.eventCallbacks[event]) {
      this.eventCallbacks[event].forEach((callback) => callback());
    }
  }

  async setPitchShift(semitones) {
    this.pitchShift = semitones;
    await this.reprocessAudio();
  }

  async setTempoRate(rate) {
    this.tempoRate = rate;
    await this.reprocessAudio();
  }

  async reprocessAudio() {
    if (!this.originalBuffer) return;

    const wasPlaying = this.isPlaying;
    const savedTime = this.getCurrentTime();

    // Stop current playback
    if (this.isPlaying) {
      this.stop();
    }

    // Reprocess audio with new settings
    await this.processAudio();

    // Restore playback position
    this.pausedAt = Math.min(savedTime, this.duration);
    
    // Trigger duration change event (duration may have changed due to tempo)
    this.triggerEvent('durationchange');

    // Resume playback if it was playing
    if (wasPlaying) {
      this.play();
    }
  }

  removeEventListener(event, callback) {
    if (this.audioElement) {
      this.audioElement.removeEventListener(event, callback);
    }
  }
}
