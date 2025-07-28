import AsyncStorage from '@react-native-community/async-storage';

// Storage keys
const READING_PROGRESS_KEY = '@PxView:readingProgress';
// const READING_SESSION_KEY = '@PxView:readingSession';  // Not currently used

/**
 * Reading Progress Interface
 * @typedef {Object} ReadingProgress
 * @property {string} novelId - Unique identifier for the novel
 * @property {number} position - Current reading position (0-1 as percentage)
 * @property {number} chapterIndex - Current chapter index (0-based)
 * @property {number} scrollPosition - Scroll position within current chapter
 * @property {number} scrollPercentage - Scroll percentage within current chapter (0-1)
 * @property {string} lastReadTime - ISO string of last read time
 * @property {boolean} isCompleted - Whether the novel is completed
 * @property {number} totalChapters - Total number of chapters
 * @property {number} readingTimeSpent - Total reading time in seconds
 */

/**
 * Save reading progress to AsyncStorage
 * @param {string} novelId - Novel ID
 * @param {ReadingProgress} progress - Progress data
 * @returns {Promise<boolean>} Success status
 */
let storedData = null;

async function getStoredReadingProgress() {
  if (storedData !== null) {
    return storedData;
  }

  try {
    const data = await AsyncStorage.getItem(READING_PROGRESS_KEY);
    storedData = data ? JSON.parse(data) : {};
    return storedData;
  } catch (error) {
    console.error('Failed to get stored reading progress:', error);
    return {};
  }
}

/**
 * Save reading progress to AsyncStorage
 * @param {string} novelId - Novel ID
 * @param {ReadingProgress} progress - Progress data
 * @returns {Promise<boolean>} Success status
 */
export async function saveReadingProgress(novelId, progress) {
  try {
    const existingData = await getStoredReadingProgress();
    const updatedData = {
      ...existingData,
      [novelId]: {
        novelId,
        position: progress.position || 0,
        chapterIndex: progress.chapterIndex || 0,
        scrollPosition: progress.scrollPosition || 0,
        scrollPercentage: progress.scrollPercentage || 0,
        lastReadTime: progress.lastReadTime || new Date().toISOString(),
        isCompleted: progress.isCompleted || false,
        totalChapters: progress.totalChapters || 1,
        readingTimeSpent: progress.readingTimeSpent || 0,
      },
    };

    await AsyncStorage.setItem(
      READING_PROGRESS_KEY,
      JSON.stringify(updatedData),
    );
    storedData = updatedData;
    return true;
  } catch (error) {
    console.error('Failed to save reading progress:', error);
    return false;
  }
}

/**
 * Get reading progress for a specific novel
 * @param {string} novelId - Novel ID
 * @returns {Promise<ReadingProgress|null>} Progress data or null
 */
export async function getReadingProgress(novelId) {
  try {
    const data = await getStoredReadingProgress();
    return data[novelId] || null;
  } catch (error) {
    console.error('Failed to get reading progress:', error);
    return null;
  }
}

/**
 * Get all stored reading progress data
 * @returns {Promise<Object>} All progress data
 */
// This function is defined above

export { getStoredReadingProgress, ReadingSession, ReadingProgressAutoSave };

/**
 * Clear reading progress for a specific novel
 * @param {string} novelId - Novel ID
 * @returns {Promise<boolean>} Success status
 */
export async function clearReadingProgress(novelId) {
  try {
    const existingData = await getStoredReadingProgress();
    delete existingData[novelId];
    await AsyncStorage.setItem(
      READING_PROGRESS_KEY,
      JSON.stringify(existingData),
    );
    return true;
  } catch (error) {
    console.error('Failed to clear reading progress:', error);
    return false;
  }
}

/**
 * Calculate reading progress percentage
 * @param {number} chapterIndex - Current chapter index
 * @param {number} totalChapters - Total chapters
 * @param {number} scrollPosition - Scroll position within chapter (0-1)
 * @returns {number} Progress percentage (0-1)
 */
export function calculateProgressPercentage(
  chapterIndex,
  totalChapters,
  scrollPosition = 0,
) {
  if (totalChapters <= 0) return 0;

  const chapterProgress = chapterIndex / totalChapters;
  const withinChapterProgress = scrollPosition / totalChapters;

  return Math.min(1, chapterProgress + withinChapterProgress);
}

/**
 * Reading session management for tracking reading time
 */
class ReadingSession {
  constructor(novelId) {
    this.novelId = novelId;
    this.startTime = Date.now();
    this.lastUpdateTime = this.startTime;
    this.isActive = true;
  }

  /**
   * Update the session with current reading state
   * @param {Object} state - Current reading state
   */
  update(state) {
    if (!this.isActive) return;

    this.lastUpdateTime = Date.now();
    this.currentState = state;
  }

  /**
   * End the reading session and return total time spent
   * @returns {number} Time spent in seconds
   */
  end() {
    if (!this.isActive) return 0;

    this.isActive = false;
    const timeSpent = Math.floor((Date.now() - this.startTime) / 1000);
    return timeSpent;
  }

  /**
   * Get current session duration
   * @returns {number} Current duration in seconds
   */
  getCurrentDuration() {
    if (!this.isActive) return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }
}

/**
 * Auto-save manager for reading progress
 */
class ReadingProgressAutoSave {
  constructor(novelId, onSave) {
    this.novelId = novelId;
    this.onSave = onSave;
    this.saveInterval = null;
    this.lastSaveTime = 0;
    this.pendingProgress = null;
    this.saveDelay = 2000; // Save after 2 seconds of inactivity
    this.minSaveInterval = 10000; // Minimum 10 seconds between saves
  }

  /**
   * Schedule a save operation
   * @param {ReadingProgress} progress - Progress to save
   */
  scheduleSave(progress) {
    this.pendingProgress = progress;

    // Clear existing timeout
    if (this.saveInterval) {
      clearTimeout(this.saveInterval);
    }

    // Schedule new save
    this.saveInterval = setTimeout(() => {
      this.executeSave();
    }, this.saveDelay);
  }

  /**
   * Execute the save operation
   */
  async executeSave() {
    if (!this.pendingProgress) return;

    const now = Date.now();

    // Respect minimum save interval
    if (now - this.lastSaveTime < this.minSaveInterval) {
      // Reschedule for later
      this.saveInterval = setTimeout(() => {
        this.executeSave();
      }, this.minSaveInterval - (now - this.lastSaveTime));
      return;
    }

    try {
      await this.onSave(this.novelId, this.pendingProgress);
      this.lastSaveTime = now;
      this.pendingProgress = null;
    } catch (error) {
      console.error('Auto-save failed:', error);
      // Retry after a delay
      this.saveInterval = setTimeout(() => {
        this.executeSave();
      }, 5000);
    }
  }

  /**
   * Force immediate save
   */
  async forceSave() {
    if (this.saveInterval) {
      clearTimeout(this.saveInterval);
      this.saveInterval = null;
    }

    if (this.pendingProgress) {
      await this.executeSave();
    }
  }

  /**
   * Stop auto-save and cleanup
   */
  stop() {
    if (this.saveInterval) {
      clearTimeout(this.saveInterval);
      this.saveInterval = null;
    }
  }
}

/**
 * Utility to restore reading position in a scroll view
 * @param {Object} scrollViewRef - Reference to scroll view
 * @param {number} scrollPosition - Position to restore
 * @param {boolean} animated - Whether to animate the scroll
 */
export function restoreScrollPosition(
  scrollViewRef,
  scrollPosition,
  animated = false,
) {
  if (scrollViewRef && scrollViewRef.current && scrollPosition > 0) {
    setTimeout(() => {
      scrollViewRef.current.scrollTo({
        y: scrollPosition,
        animated,
      });
    }, 100); // Small delay to ensure content is rendered
  }
}

/**
 * Debounce utility for scroll position tracking
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}
