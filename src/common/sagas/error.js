import { takeEvery } from 'redux-saga/effects';
import { ERROR } from '../constants/actionTypes';

// todo
export function* handleAlertError(action) {
  const error = action.payload;
  // yield call(showMessage, {
  //   message: error,
  //   type: 'danger',
  // });
  // yield put(clearError());
}

export function* watchError() {
  yield takeEvery(ERROR.ADD, handleAlertError);
}
