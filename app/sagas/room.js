import { Alert } from 'react-native';
import prompt from 'react-native-prompt-android';
import {
	takeLatest, take, select, delay, race, put
} from 'redux-saga/effects';

import Navigation from '../lib/Navigation';
import * as types from '../actions/actionsTypes';
import { removedRoom } from '../actions/room';
import RocketChat from '../lib/rocketchat';
import log from '../utils/log';
import I18n from '../i18n';

const watchUserTyping = function* watchUserTyping({ rid, status }) {
	const auth = yield select(state => state.login.isAuthenticated);
	if (!auth) {
		yield take(types.LOGIN.SUCCESS);
	}

	try {
		yield RocketChat.emitTyping(rid, status);

		if (status) {
			yield delay(5000);
			yield RocketChat.emitTyping(rid, false);
		}
	} catch (e) {
		log(e);
	}
};

const handleRemovedRoom = function* handleRemovedRoom() {
	yield Navigation.navigate('RoomsListView');
	// types.ROOM.REMOVE is triggered by `subscriptions-changed` with `removed` arg
	const { timeout } = yield race({
		deleteFinished: take(types.ROOM.REMOVED),
		timeout: delay(3000)
	});
	if (timeout) {
		put(removedRoom());
	}
};

const handleLeaveRoom = function* handleLeaveRoom({ rid, t }) {
	try {
		const result = yield RocketChat.leaveRoom(rid, t);
		if (result.success) {
			yield handleRemovedRoom();
		}
	} catch (e) {
		if (e.data && e.data.errorType === 'error-you-are-last-owner') {
			Alert.alert(I18n.t('Oops'), I18n.t(e.data.errorType));
		} else {
			Alert.alert(I18n.t('Oops'), I18n.t('There_was_an_error_while_action', { action: I18n.t('leaving_room') }));
		}
	}
};

const handleDeleteRoom = function* handleDeleteRoom({ rid, t }) {
	try {
		const result = yield RocketChat.deleteRoom(rid, t);
		if (result.success) {
			yield handleRemovedRoom();
		}
	} catch (e) {
		Alert.alert(I18n.t('Oops'), I18n.t('There_was_an_error_while_action', { action: I18n.t('deleting_room') }));
	}
};

const handleCloseRoom = function* handleCloseRoom({ rid }) {
	const requestComment = yield select(state => state.settings.Livechat_request_comment_when_closing_conversation);

	const closeRoom = async(comment = '') => {
		try {
			await RocketChat.closeLivechat(rid, comment);
			Navigation.navigate('RoomsListView');
		} catch {
			// do nothing
		}
	};

	if (!requestComment) {
		const comment = I18n.t('Chat_closed_by_agent');
		return closeRoom(comment);
	}

	prompt(
		I18n.t('Closing_chat'),
		I18n.t('Please_add_a_comment'),
		[
			{ text: I18n.t('Cancel'), onPress: () => { }, style: 'cancel' },
			{
				text: I18n.t('Submit'),
				onPress: comment => closeRoom(comment)
			}
		],
		{
			cancelable: true
		}
	);
};

const root = function* root() {
	yield takeLatest(types.ROOM.USER_TYPING, watchUserTyping);
	yield takeLatest(types.ROOM.LEAVE, handleLeaveRoom);
	yield takeLatest(types.ROOM.DELETE, handleDeleteRoom);
	yield takeLatest(types.ROOM.CLOSE, handleCloseRoom);
};
export default root;
