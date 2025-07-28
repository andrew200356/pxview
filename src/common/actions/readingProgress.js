/* eslint-disable import/prefer-default-export */

import { READING_PROGRESS } from '../constants/actionTypes';

export function setReadingProgress(novelId, progress) {
  return {
    type: READING_PROGRESS.SET,
    payload: {
      novelId,
      progress,
    },
  };
}

export function restoreReadingProgress(state) {
  return {
    type: READING_PROGRESS.RESTORE,
    payload: {
      state,
    },
  };
}

export function clearReadingProgress(novelId) {
  return {
    type: READING_PROGRESS.CLEAR,
    payload: {
      novelId,
    },
  };
}
