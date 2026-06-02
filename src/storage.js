// LocalStorage helpers for state persistence

const STORAGE_KEYS = {
  FOLDER_NAME: "backingTracks_folderName",
  CURRENT_SONG: "backingTracks_currentSong",
  ACTIVE_CHANNEL: "backingTracks_activeChannel",
  CHANNEL1_VOLUME: "backingTracks_channel1Volume",
  CHANNEL2_VOLUME: "backingTracks_channel2Volume",
  CHANNEL1_LEFT: "backingTracks_channel1Left",
  CHANNEL1_RIGHT: "backingTracks_channel1Right",
  CHANNEL2_LEFT: "backingTracks_channel2Left",
  CHANNEL2_RIGHT: "backingTracks_channel2Right",
};

export function saveState(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("Failed to save to localStorage:", e);
  }
}

export function loadState(key, defaultValue) {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.warn("Failed to load from localStorage:", e);
    return defaultValue;
  }
}

export { STORAGE_KEYS };
