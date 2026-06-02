<script>
  import { createEventDispatcher } from "svelte";

  export let files = [];
  export let currentFile = null;

  const dispatch = createEventDispatcher();

  const audioExtensions = [".mp3", ".ogg", ".flac", ".wav"];

  $: audioFiles = files
    .filter((file) =>
      audioExtensions.some((ext) => file.name.toLowerCase().endsWith(ext)),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  function selectFile(file) {
    dispatch("select", file);
  }

  function closeSelector() {
    dispatch("close");
  }

  function changeFolder() {
    dispatch("changefolder");
  }
</script>

<div class="file-selector">
  <div class="header">
    <h2>Select Track</h2>
    <button class="close-btn" on:click={closeSelector}>✕</button>
  </div>

  <div class="file-list">
    {#if audioFiles.length === 0}
      <div class="empty-state">
        <p>No audio files found</p>
        <button class="change-folder-btn" on:click={changeFolder}>
          Select Folder
        </button>
      </div>
    {:else}
      {#each audioFiles as file}
        <button
          class="file-item"
          class:active={currentFile && currentFile.name === file.name}
          on:click={() => selectFile(file)}
        >
          <span class="file-name">{file.name}</span>
        </button>
      {/each}
    {/if}
  </div>

  {#if audioFiles.length > 0}
    <div class="footer">
      <button class="change-folder-btn" on:click={changeFolder}>
        Change Folder
      </button>
    </div>
  {/if}
</div>

<style>
  .file-selector {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: var(--bg-primary);
    z-index: 1000;
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 2px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .header h2 {
    font-size: 1.75rem;
    font-weight: 600;
  }

  .close-btn {
    width: 3rem;
    height: 3rem;
    background: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 1.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:active {
    background: var(--accent-primary);
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .file-item {
    width: 100%;
    padding: 1.5rem;
    margin-bottom: 0.75rem;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 1.25rem;
    text-align: left;
    transition: background 0.2s;
  }

  .file-item:active {
    background: var(--accent-primary);
  }

  .file-item.active {
    background: var(--accent-secondary);
  }

  .file-name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .footer {
    padding: 1.5rem;
    border-top: 2px solid var(--border-color);
    background: var(--bg-secondary);
  }

  .change-folder-btn {
    width: 100%;
    padding: 1.5rem;
    background: var(--accent-primary);
    color: var(--text-primary);
    font-size: 1.25rem;
    font-weight: 600;
  }

  .change-folder-btn:active {
    opacity: 0.8;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 2rem;
  }

  .empty-state p {
    font-size: 1.5rem;
    color: var(--text-secondary);
  }
</style>
