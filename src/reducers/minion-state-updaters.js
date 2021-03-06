// Copyright (c) 2021 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import { disableStackCapturing, withTask } from 'react-palm/tasks';
import {
  GRAPHQL_QUERY_TASK,
  GRAPHQL_MUTATION_TASK,
  ACTION_TASK,
  DELAY_TASK
} from 'tasks/tasks';

import {
  GQL_GET_MINIONS,
  GQL_GET_STATIC_DATA,
  GQL_DELETE_SIGNAL_SAMPLES,
  GQL_INSERT_MINION,
  GQL_UPDATE_MINION,
  GQL_DELETE_MINION
} from 'graphqls';

import {
  loadMinions,
  loadMinionsSuccess,
  loadMinionsError,
  loadStaticDataSuccess,
  deleteFilteredDataSuccess,
  deleteFilteredDataError,
  addMinionSuccess,
  addMinionError,
  updateMinionSuccess,
  updateMinionError,
  deleteMinionSuccess,
  deleteMinionError
} from 'actions/minion-state-actions';

import { reloadDataset } from 'actions/provider-actions';
import { closeDeleteDataModal } from 'actions/ui-state-actions';
import { addMarker, removeMarker } from 'actions/vis-state-actions';
import { updateMap, fitBounds } from 'actions/map-state-actions';

import { SIGNAL_QUALITY } from 'constants/default-settings';

import moment from 'moment';
import _ from 'lodash';
import $ from 'jquery';

// react-palm
// disable capture exception for react-palm call to withTask
disableStackCapturing();

/**
 * Updaters for `minionState` reducer. Can be used in your root reducer to directly modify kepler.gl's state.
 * Read more about [Using updaters](../advanced-usage/using-updaters.md)
 *
 * @public
 * @example
 *
 * import keplerGlReducer, {minionStateUpdaters} from 'kepler.gl/reducers';
 * // Root Reducer
 * const reducers = combineReducers({
 *  keplerGl: keplerGlReducer,
 *  app: appReducer
 * });
 *
 * const composedReducer = (state, action) => {
 *  switch (action.type) {
 *    case 'CLICK_BUTTON':
 *      return {
 *        ...state,
 *        keplerGl: {
 *          ...state.keplerGl,
 *          foo: {
 *             ...state.keplerGl.foo,
 *             minionState: minionStateUpdaters.enlargeFilterUpdater(
 *               state.keplerGl.foo.minionState,
 *               {idx: 0}
 *             )
 *          }
 *        }
 *      };
 *  }
 *  return reducers(state, action);
 * };
 *
 * export default composedReducer;
 */
/* eslint-disable no-unused-vars */
// @ts-ignore
const minionStateUpdaters = null;
/* eslint-enable no-unused-vars */

/**
 * Default initial `minionState`
 * @memberof minionStateUpdaters
 * @constant
 * @type {minionState}
 * @public
 */
export const INITIAL_MINION_STATE = {
  details: {},
  selectedMinions: [],
  operationMode: null,
  sleepInterval: null,
  sessionId: null,
  lastAck: {},
  command: null,
  commands: [],
  antennas: [],
  isCommandExecuting: false,
  mqttClient: null,
  mqttMessage: null,
  mqttTopic: null,
  selectedAll: false,
  markerScale: 'large',
  loopingEnabled: false,
  minions: []
};

export function setLoopingEnabledUpdater(state, { enabled }) {
  return {
    ...state,
    loopingEnabled: enabled
  }
};

/**
 * Start to load minions data
 * @type {typeof import('./minion-state-updaters').loadMinionsUpdater}
 *
 */
export function loadMinionsUpdater(state, { firstLoading }) {
  if (firstLoading) {
    $('#minion-grid').LoadingOverlay('show');
  }
  const query = GQL_GET_MINIONS(state.selectedMinions[0]?.name);
  const loadMinionTask = GRAPHQL_QUERY_TASK({ query, fetchPolicy: 'network-only' }).bimap(
    result => {
      const minions = _.orderBy(result.data.signal_db_minions, ['name'], ['asc']);
      const sample = result.data.signal_db_signal_samples?.[0];
      return loadMinionsSuccess(minions, sample);
    },
    error => loadMinionsError(error)
  );

  const newState = {
    ...state,
    // loopingEnabled: !!firstLoading,
    isLoadingMinions: true
  };

  return withTask(newState, loadMinionTask);
}


export function calcLevel(val, factor, type) {
  let quality = [];

  if (factor == 'sinr_ecio') {
    quality = SIGNAL_QUALITY[type === 'WCDMA' ? 'ecio' : 'sinr'];
  }
  else {
    quality = SIGNAL_QUALITY[factor];
  }

  const lvls = quality.length - 1;

  for (let i = 1; i <= lvls; i++) {
    if (parseInt(val) >= parseInt(quality[i])) {
      return {
        [factor + '_level']: i - 1,
        [factor + '_prog']: (lvls - i) * 25 + 25 * (val - quality[i]) / (quality[i - 1] - quality[i])
      };
    }
  }

  return {
    [factor + '_level']: lvls,
    [factor + '_prog']: 0
  };
};

/**
 * Process loaded minions data
 * @type {typeof import('./minion-state-updaters').loadMinionsSuccessUpdater}
 *
 */
export function loadMinionsSuccessUpdater(state, { minions, signalSample }) {
  const { selectedMinions, loopingEnabled } = state;
  let newState = {
    ...state,
    isLoadingMinions: false,
    isSelectingAll: false,
    isUnselectingAll: false,
    minions,
    details: signalSample ? state.details : {}
  };

  $('#minion-grid').LoadingOverlay('hide', true);

  if (loopingEnabled == false) {
    return newState;
  }

  if (selectedMinions.length == 1) {
    const { name } = selectedMinions[0];
    const minionDetails = minions.find(m => m.name == name);
    let details = minionDetails;

    if (signalSample && name == signalSample.minion_id) {
      const { rssi, rsrq, rsrp_rscp, sinr_ecio, cqi, mcs, connection_type: conn } = signalSample;
      details = {
        ...signalSample,
        ...minionDetails,
        ...calcLevel(rssi, 'rssi', conn),
        ...calcLevel(rsrq, 'rsrq', conn),
        ...calcLevel(rsrp_rscp, 'rsrp_rscp', conn),
        ...calcLevel(sinr_ecio, 'sinr_ecio', conn),
        ...calcLevel(cqi, 'cqi', conn),
        ...calcLevel(mcs, 'mcs', conn),
      };
    }
    
    newState = {
      ...newState,
      details,
      operationMode: details?.operation_mode,
      sleepInterval: details?.sleep_interval,
      sessionId: details?.session_id
    };

    $('#minion-group').LoadingOverlay('hide', true);
  }
  else if (selectedMinions.length > 1) {
    $('#minion-group').LoadingOverlay('hide', true);
  }

  
  if (minions.length) {
    const markers = minions.map(m => ({
      lngLat: [m.longitude, m.latitude],
      info: m,
      id: m.name
    }));

    const tasks = [
      DELAY_TASK(3000).map(loadMinions),
      ACTION_TASK().map(_ => removeMarker()),
      ACTION_TASK().map(_ => addMarker(markers))
    ];

    return withTask(newState, tasks);
  }
  else {
    return INITIAL_MINION_STATE;
  }
}

/**
 * Handle error occured in loading minions data
 * @type {typeof import('./minion-state-updaters').loadMinionsSuccessUpdater}
 *
 */
export function loadMinionsErrorUpdater(state, { error }) {
  return {
    ...state,
    isLoadingMinions: false,
    error
  }
}

/**
 * Set selected minion's name and index
 * @type {typeof import('./minion-state-updaters').selectMinionUpdater}
 *
 */
export function selectMinionUpdater(state, { minions }) {
  const { mqttClient } = state;

  if (mqttClient) {
    minions.forEach(m => mqttClient.subscribe(`${m.name}/ack`));
  }

  return {
    ...state,
    isSelectingAll: false,
    isUnselectingAll: false,
    selectedMinions: minions
  };
}

/**
 * Set minion sleep interval
 * @type {typeof import('./minion-state-updaters').setSleepIntervalUpdater}
 *
 */
export function setSleepIntervalUpdater(state, { interval }) {
  const { mqttClient, selectedMinions, selectedAll } = state;

  if (!mqttClient || selectedMinions.length == 0) {
    return state;
  }

  selectedMinions.forEach(({ name }) => {
    const topic = `${name}/interval`;
    mqttClient.subscribe(topic, err => {
      err || mqttClient.publish(topic, interval.toString());
    });
  });


  return {
    ...state,
    isCommandExecuting: true,
    sleepInterval: selectedAll ? null : interval
  };
}

/**
 * Set minion sleep interval
 * @type {typeof import('./minion-state-updaters').setOperationMode}
 *
 */
export function setOperationModeUpdater(state, { mode }) {
  const { mqttClient, selectedMinions, selectedAll } = state;

  if (!mqttClient || selectedMinions.length == 0) {
    return state;
  }

  selectedMinions.forEach(({ name }) => {
    const topic = `${name}/operation_mode`;
    mqttClient.subscribe(topic, err => {
      err || mqttClient.publish(topic, mode.toString());
    });
  });

  return {
    ...state,
    isCommandExecuting: true,
    operationMode: selectedAll ? null : mode
  };
}

/**
 * Set minion sleep interval
 * @type {typeof import('./minion-state-updaters').sendSessionCommandUpdater}
 *
 */
export function sendSessionCommandUpdater(state, { isIncrement }) {
  const { mqttClient, selectedMinions, sessionId, selectedAll } = state;

  if (!mqttClient || selectedMinions.length == 0) {
    return state;
  }

  const payload = isIncrement ? 'increment' : sessionId.toString();
  selectedMinions.forEach(({ name }) => {
    const topic = `${name}/session_id`;
    mqttClient.subscribe(topic, err => {
      err || mqttClient.publish(topic, payload);
    });
  });

  return {
    ...state,
    isCommandExecuting: true,
    sessionId: selectedAll ? null : (isIncrement ? parseInt(sessionId) + 1 : sessionId)
  };
}

/**
 * Set minion session id
 * @type {typeof import('./minion-state-updaters').setSessionId}
 *
 */
export function setSessionIdUpdater(state, { sessionId }) {
  return {
    ...state,
    sessionId
  };
}

/**
 * Set command to selected minion
 * @type {typeof import('./minion-state-updaters').setCommand}
 *
 */
export function setCommandUpdater(state, { command }) {
  return {
    ...state,
    command
  };
}

/**
 * Send command to selected minion
 * @type {typeof import('./minion-state-updaters').setCommand}
 *
 */
export function sendCommandUpdater(state) {
  const { mqttClient, selectedMinions, command } = state;

  if (!mqttClient || !command || selectedMinions.length == 0) {
    return state;
  }

  selectedMinions.forEach(({ name }) => {
    const topic = `${name}/command`;
    mqttClient.subscribe(topic, err => {
      err || mqttClient.publish(topic, command.toString());
    });
  });

  return {
    ...state,
    isCommandExecuting: true
  };
}

/**
 * Set mqtt client connected
 * @type {typeof import('./minion-state-updaters').setMqttClientUpdater}
 *
 */
export function setMqttClientUpdater(state, { mqttClient }) {
  return {
    ...state,
    mqttClient
  };
}

/**
 * Set mqtt message received
 * @type {typeof import('./minion-state-updaters').setMqttMessageUpdater}
 *
 */
export function setMqttMessageUpdater(state, { mqttTopic: topic, mqttMessage: payload }) {
  const { lastAck } = state;
  topic = topic.toString();
  payload = payload.toString();
  const minion = topic.split('/')?.[0];
  const cmd = topic.split('/')?.[1];

  if (!minion || cmd != 'ack') {
    return state;
  }

  return {
    ...state,
    lastAck: {
      ...lastAck,
      [minion]: payload + moment().format(' @ HH:mm:ss')
    },
    isCommandExecuting: false,
  };
}

export function loadStaticDataUpdater(state) {
  const query = GQL_GET_STATIC_DATA();
  const task = GRAPHQL_QUERY_TASK({ query, fetchPolicy: 'network-only' }).bimap(
    res => loadStaticDataSuccess(res.data),
    err => { }
  );

  return withTask(state, task);
}

export function loadStaticDataSuccessUpdater(state, { data }) {
  return {
    ...state,
    commands: data.signal_db_minion_commands.map(c => c.command),
    antennas: data.signal_db_antennas.map(a => a.antenna_type)
  }
}

export function selectAllUpdater(state) {
  const { minions, selectedMinions } = state;
  return {
    ...state,
    selectedMinions: minions,
    operationMode: null,
    sleepInterval: null,
    sessionId: null,
    lastAck: {},
    details: {},
    command: null,
    targetMinions: minions,
    isSelectingAll: minions.length != selectedMinions.length,
    isUnselectingAll: minions.length == selectedMinions.length,
  }
}

export function expandUpdater(state) {
  const { minions } = state;

  if (minions.length == 0) {
    return state;
  }
  else if (minions.length == 1) {
    const { longitude, latitude } = minions[0];
    const task = ACTION_TASK().map(_ => updateMap({ longitude, latitude }));

    return withTask(state, task);
  }

  const { minLat, minLnt, maxLat, maxLnt } = minions.reduce((acc, { latitude: lat, longitude: lnt }) => {
    if (acc.minLat > lat) {
      acc.minLat = lat;
    }
    if (acc.minLnt > lnt) {
      acc.minLnt = lnt;
    }
    if (acc.maxLat < lat) {
      acc.maxLat = lat;
    }
    if (acc.maxLnt < lnt) {
      acc.maxLnt = lnt;
    }

    return acc;
  }, { minLat: 90, minLnt: 180, maxLat: -90, maxLnt: -180 });

  const task = ACTION_TASK().map(_ => fitBounds([
    minLnt,
    minLat,
    maxLnt,
    maxLat,
    true
  ]));

  return withTask(state, task);
}

export function collapseUpdater(state) {
  const { selectedMinions, minions } = state;

  if (selectedMinions.length == 0) {
    return state;
  }

  const { name } = selectedMinions[0];
  const { longitude, latitude } = minions.find(m => m.name == name);
  const task = ACTION_TASK().map(_ => updateMap({ longitude, latitude }));

  return withTask(state, task);
};

export function setMarkerScaleUpdater(state, { markerScale }) {
  return {
    ...state,
    markerScale
  }
};

export function deleteFilteredDataUpdater(state, { dataset, visState }) {
  const { fields, filteredIndexForDomain, allData } = dataset;
  const dateFieldIdx = fields.findIndex(f => f.name == 'date');

  if (dateFieldIdx < 0) {
    return state;
  }

  const datesToDelete = filteredIndexForDomain.map(i => `"${allData[i][dateFieldIdx]}"`);
  const mutation = GQL_DELETE_SIGNAL_SAMPLES(datesToDelete);
  const task = GRAPHQL_MUTATION_TASK({ mutation }).bimap(
    () => deleteFilteredDataSuccess(dataset, visState),
    err => deleteFilteredDataError(err)
  );

  return withTask(state, task);
};

export function deleteFilteredDataSuccessUpdater(state, { dataset, visState }) {
  const tasks = [
    ACTION_TASK().map(_ => reloadDataset(dataset, visState)),
    ACTION_TASK().map(_ => closeDeleteDataModal())
  ];

  return withTask(state, tasks);
};

export function deleteFilteredDataErrorUpdater(state, { error }) {
  const tasks = [
    ACTION_TASK().map(_ => closeDeleteDataModal(error))
  ];

  return withTask(state, tasks);
};

export function addMinionUpdater(state, {data}) {
  $('#minion-grid').LoadingOverlay('show');

  const mutation = GQL_INSERT_MINION();
  const task = GRAPHQL_MUTATION_TASK({ 
    variables: data, 
    mutation 
  }).bimap(
    res => addMinionSuccess(res.data.insert_signal_db_minions_one),
    err => addMinionError(err)
  );

  return withTask(state, task);
};

export function addMinionSuccessUpdater(state, {data}) {  
  $('#minion-grid').LoadingOverlay('hide', true);

  return {
    ...state,
    minions: _.orderBy([
      ...state.minions,
      data
    ], ['lastupdate', 'name'], ['desc', 'asc']),
    isUnselectingAll: true
  }
}

export function addMinionErrorUpdater(state, {error}) {
  $('#minion-grid').LoadingOverlay('hide', true);
  console.log(error);
  
  return {
    ...state
  }
}

export function updateMinionUpdater(state,  {data}) {
  $('#minion-grid').LoadingOverlay('show');
  
  const mutation = GQL_UPDATE_MINION();
  const task = GRAPHQL_MUTATION_TASK({ 
    variables: data, 
    mutation 
  }).bimap(
    res => updateMinionSuccess(res.data.update_signal_db_minions_by_pk),
    err => updateMinionError(err)
  );

  return withTask(state, task);
};

export function updateMinionSuccessUpdater(state, {data}) {  
  $('#minion-grid').LoadingOverlay('hide', true);

  return {
    ...state,
    minions: state.minions.map(m => m.id == data.id ? data : m),
  }
}

export function updateMinionErrorUpdater(state, {error}) {
  $('#minion-grid').LoadingOverlay('hide', true);
  console.log(error);
  
  return {
    ...state
  }
}

export function deleteMinionUpdater(state, {ids}) {
  $('#minion-grid').LoadingOverlay('show');

  const mutation = GQL_DELETE_MINION(ids);
  const task = GRAPHQL_MUTATION_TASK({ mutation }).bimap(
    res => deleteMinionSuccess(ids, res.data.affected_rows),
    err => deleteMinionError(err)
  );

  return withTask(state, task);
};

export function deleteMinionSuccessUpdater(state, {data}) {  
  $('#minion-grid').LoadingOverlay('hide', true);

  return {
    ...state,
    minions: state.minions.filter(m => data.findIndex(id => id == m.id) < 0),
    isUnselectingAll: true
  }
}

export function deleteMinionErrorUpdater(state, {error}) {
  $('#minion-grid').LoadingOverlay('hide', true);
  console.log(error);
  
  return {
    ...state
  }
}