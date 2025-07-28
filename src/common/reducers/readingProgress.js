import { READING_PROGRESS } from '../constants/actionTypes';

const initState = {
  items: {}, // novelId -> ReadingProgress object
};

export default function readingProgress(state = initState, action) {
  switch (action.type) {
    case READING_PROGRESS.SET: {
      const { novelId, progress } = action.payload;
      return {
        ...state,
        items: {
          ...state.items,
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
        },
      };
    }
    case READING_PROGRESS.CLEAR: {
      const { novelId } = action.payload;
      const newItems = { ...state.items };
      delete newItems[novelId];
      return {
        ...state,
        items: newItems,
      };
    }
    case READING_PROGRESS.RESTORE:
      return {
        ...state,
        ...action.payload.state,
      };
    default:
      return state;
  }
}
