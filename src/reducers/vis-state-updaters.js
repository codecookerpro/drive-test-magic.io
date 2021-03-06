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

import {console as Console} from 'global/window';
import {disableStackCapturing, withTask} from 'react-palm/tasks';
import cloneDeep from 'lodash.clonedeep';
import uniq from 'lodash.uniq';
import get from 'lodash.get';
import xor from 'lodash.xor';
import copy from 'copy-to-clipboard';
import {parseFieldValue} from 'utils/data-utils';
// Tasks
import {
  LOAD_FILE_TASK, 
  UNWRAP_TASK, 
  PROCESS_FILE_DATA, 
  DELAY_TASK, 
  ACTION_TASK,
  GRAPHQL_QUERY_TASK,
  GRAPHQL_MUTATION_TASK
} from 'tasks/tasks';
// Actions
import {
  loadFilesErr,
  loadFilesSuccess,
  loadFileStepSuccess,
  loadNextFile,
  nextFileBatch
} from 'actions/vis-state-actions';
// Utils
import {findFieldsToShow, getDefaultInteraction} from 'utils/interaction-utils';
import {
  applyFilterFieldName,
  applyFiltersToDatasets,
  featureToFilterValue,
  FILTER_UPDATER_PROPS,
  filterDatasetCPU,
  generatePolygonFilter,
  getDefaultFilter,
  getDefaultFilterPlotType,
  getFilterIdInFeature,
  getFilterPlot,
  isInRange,
  LIMITED_FILTER_EFFECT_PROPS,
  updateFilterDataId
} from 'utils/filter-utils';
import {assignGpuChannel, setFilterGpuMode} from 'utils/gpu-filter-utils';
import {createNewDataEntry} from 'utils/dataset-utils';
import {sortDatasetByColumn} from 'utils/table-utils/kepler-table';
import {set, toArray, arrayInsert, generateHashId} from 'utils/utils';

import {calculateLayerData, findDefaultLayer} from 'utils/layer-utils';

import {
  isValidMerger,
  VIS_STATE_MERGERS,
  validateLayerWithData,
  createLayerFromConfig,
  serializeLayer
} from './vis-state-merger';

import {
  addNewLayersToSplitMap,
  computeSplitMapLayers,
  removeLayerFromSplitMaps
} from 'utils/split-map-utils';

import {Layer, LayerClasses, LAYER_ID_LENGTH} from 'layers';
import {DEFAULT_TEXT_LABEL} from 'layers/layer-factory';
import {
  EDITOR_MODES, 
  SORT_ORDER, 
  AGGREGATION_TYPES, 
  REPORT_TYPES, 
  HEXBIN_GROUPING_TIMES
} from 'constants/default-settings';
import {pick_, merge_} from './composer-helpers';
import {processFileContent, removeLayer, onMouseMove, startReloadingDataset} from 'actions/vis-state-actions';

import KeplerGLSchema from 'schemas';
import {applyProfile} from 'actions/map-profile-actions';
import {toggleModal} from 'actions/ui-state-actions';

import {aggregate} from 'utils/aggregate-utils';
import {notNullorUndefined} from 'utils/data-utils';
import _ from 'lodash';
import {addDataToMap} from 'actions/actions';
import {
  extractOperation,
  restrictSession,
  makeDataset
} from 'utils/gql-utils';
import moment from 'moment';
import {gql} from '@apollo/client';
import {GQL_UPDATE_DATASET} from 'graphqls';
import {mean, min, max, median, deviation, variance, sum} from 'd3-array';

// type imports
/** @typedef {import('./vis-state-updaters').Field} Field */
/** @typedef {import('./vis-state-updaters').Filter} Filter */
/** @typedef {import('./vis-state-updaters').KeplerTable} KeplerTable */
/** @typedef {import('./vis-state-updaters').VisState} VisState */
/** @typedef {import('./vis-state-updaters').Datasets} Datasets */
/** @typedef {import('./vis-state-updaters').AnimationConfig} AnimationConfig */
/** @typedef {import('./vis-state-updaters').Editor} Editor */

// react-palm
// disable capture exception for react-palm call to withTask
disableStackCapturing();

/**
 * Updaters for `visState` reducer. Can be used in your root reducer to directly modify kepler.gl's state.
 * Read more about [Using updaters](../advanced-usage/using-updaters.md)
 *
 * @public
 * @example
 *
 * import keplerGlReducer, {visStateUpdaters} from 'kepler.gl/reducers';
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
 *             visState: visStateUpdaters.enlargeFilterUpdater(
 *               state.keplerGl.foo.visState,
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
const visStateUpdaters = null;
/* eslint-enable no-unused-vars */

/** @type {AnimationConfig} */
export const DEFAULT_ANIMATION_CONFIG = {
  domain: null,
  currentTime: null,
  speed: 1,
  isAnimating: false
};

/** @type {Editor} */
export const DEFAULT_EDITOR = {
  mode: EDITOR_MODES.DRAW_POLYGON,
  features: [],
  selectedFeature: null,
  visible: true
};

/**
 * Default initial `visState`
 * @memberof visStateUpdaters
 * @constant
 * @type {VisState}
 * @public
 */
export const INITIAL_VIS_STATE = {
  // map info
  mapInfo: {
    title: '',
    description: ''
  },
  // layers
  layers: [],
  layerData: [],
  layerToBeMerged: [],
  layerOrder: [],

  // filters
  filters: [],
  filterToBeMerged: [],

  // a collection of multiple dataset
  datasets: {},
  editingDataset: undefined,

  interactionConfig: getDefaultInteraction(),
  interactionToBeMerged: undefined,

  layerBlending: 'normal',
  hoverInfo: undefined,
  clicked: undefined,
  marked: [],
  mousePos: {},

  // this is used when user split maps
  splitMaps: [
    // this will contain a list of objects to
    // describe the state of layer availability and visibility for each map
    // [
    //   {
    //      layers: {layer_id: true | false}
    //   }
    // ]
  ],
  splitMapsToBeMerged: [],

  // defaults layer classes
  layerClasses: LayerClasses,

  // default animation
  // time in unix timestamp (milliseconds) (the number of seconds since the Unix Epoch)
  animationConfig: DEFAULT_ANIMATION_CONFIG,

  editor: DEFAULT_EDITOR,

  fileLoading: false,
  fileLoadingProgress: {},

  loaders: [],
  loadOptions: {},

  // visStateMergers
  mergers: VIS_STATE_MERGERS,

  schema: KeplerGLSchema,
  
  dataReport: {
    toggled: false,
    dataId: null,
    field: null,
    aggregation: AGGREGATION_TYPES.average,
    interval: 10,
    type: REPORT_TYPES.normal,
    chartData: null
  }
};

/**
 * Update state with updated layer and layerData
 * @type {typeof import('./vis-state-updaters').updateStateWithLayerAndData}
 *
 */
export function updateStateWithLayerAndData(state, {layerData, layer, idx}) {
  return {
    ...state,
    layers: state.layers.map((lyr, i) => (i === idx ? layer : lyr)),
    layerData: layerData
      ? state.layerData.map((d, i) => (i === idx ? layerData : d))
      : state.layerData
  };
}

export function updateStateOnLayerVisibilityChange(state, layer) {
  let newState = state;
  if (state.splitMaps.length) {
    newState = {
      ...state,
      splitMaps: layer.config.isVisible
        ? addNewLayersToSplitMap(state.splitMaps, layer)
        : removeLayerFromSplitMaps(state.splitMaps, layer)
    };
  }

  if (layer.config.animation.enabled) {
    newState = updateAnimationDomain(state);
  }

  return newState;
}

/**
 * Update layer base config: dataId, label, column, isVisible
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').layerConfigChangeUpdater}
 * @returns nextState
 */
export function layerConfigChangeUpdater(state, action) {
  const {oldLayer} = action;
  const idx = state.layers.findIndex(l => l.id === oldLayer.id);
  const props = Object.keys(action.newConfig);
  if (typeof action.newConfig.dataId === 'string') {
    const {dataId, ...restConfig} = action.newConfig;
    const stateWithDataId = layerDataIdChangeUpdater(state, {
      oldLayer,
      newConfig: {dataId}
    });
    const nextLayer = stateWithDataId.layers.find(l => l.id === oldLayer.id);
    return nextLayer
      ? layerConfigChangeUpdater(state, {oldLayer: nextLayer, newConfig: restConfig})
      : stateWithDataId;
  }

  let newLayer = oldLayer.updateLayerConfig(action.newConfig);

  let layerData;

  // let newLayer;
  if (newLayer.shouldCalculateLayerData(props)) {
    const oldLayerData = state.layerData[idx];

    if (action.newConfig.hasOwnProperty('legendDomain') || action.newConfig.hasOwnProperty('legendRange')) {
      newLayer.updateLayerDomain(state.datasets);
    }
    
    const updateLayerDataResult = calculateLayerData(newLayer, state, oldLayerData);

    layerData = updateLayerDataResult.layerData;
    newLayer = updateLayerDataResult.layer;
  }

  let newState = state;
  if ('isVisible' in action.newConfig) {
    newState = updateStateOnLayerVisibilityChange(state, newLayer);
  }

  return updateStateWithLayerAndData(newState, {
    layer: newLayer,
    layerData,
    idx
  });
}

function addOrRemoveTextLabels(newFields, textLabel) {
  let newTextLabel = textLabel.slice();

  const currentFields = textLabel.map(tl => tl.field && tl.field.name).filter(d => d);

  const addFields = newFields.filter(f => !currentFields.includes(f.name));
  const deleteFields = currentFields.filter(f => !newFields.find(fd => fd.name === f));

  // delete
  newTextLabel = newTextLabel.filter(tl => tl.field && !deleteFields.includes(tl.field.name));
  newTextLabel = !newTextLabel.length ? [DEFAULT_TEXT_LABEL] : newTextLabel;

  // add
  newTextLabel = [
    ...newTextLabel.filter(tl => tl.field),
    ...addFields.map(af => ({
      ...DEFAULT_TEXT_LABEL,
      field: af
    }))
  ];

  return newTextLabel;
}

function updateTextLabelPropAndValue(idx, prop, value, textLabel) {
  if (!textLabel[idx].hasOwnProperty(prop)) {
    return textLabel;
  }

  let newTextLabel = textLabel.slice();

  if (prop && (value || textLabel.length === 1)) {
    newTextLabel = textLabel.map((tl, i) => (i === idx ? {...tl, [prop]: value} : tl));
  } else if (prop === 'field' && value === null && textLabel.length > 1) {
    // remove label when field value is set to null
    newTextLabel.splice(idx, 1);
  }

  return newTextLabel;
}

/**
 * Update layer base config: dataId, label, column, isVisible
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').layerTextLabelChangeUpdater}
 * @returns nextState
 */
export function layerTextLabelChangeUpdater(state, action) {
  const {oldLayer, idx, prop, value} = action;
  const {textLabel} = oldLayer.config;

  let newTextLabel = textLabel.slice();
  if (!textLabel[idx] && idx === textLabel.length) {
    // if idx is set to length, add empty text label
    newTextLabel = [...textLabel, DEFAULT_TEXT_LABEL];
  }

  if (idx === 'all' && prop === 'fields') {
    newTextLabel = addOrRemoveTextLabels(value, textLabel);
  } else {
    newTextLabel = updateTextLabelPropAndValue(idx, prop, value, newTextLabel);
  }
  // update text label prop and value
  return layerConfigChangeUpdater(state, {
    oldLayer,
    newConfig: {textLabel: newTextLabel}
  });
}

function validateExistingLayerWithData(dataset, layerClasses, layer) {
  const loadedLayer = serializeLayer(layer);
  return validateLayerWithData(dataset, loadedLayer, layerClasses, {
    allowEmptyColumn: true
  });
}

/**
 * Update layer config dataId
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').layerDataIdChangeUpdater}
 * @returns nextState
 */
export function layerDataIdChangeUpdater(state, action) {
  const {oldLayer, newConfig} = action;
  const {dataId} = newConfig;

  if (!oldLayer || !state.datasets[dataId]) {
    return state;
  }
  const idx = state.layers.findIndex(l => l.id === oldLayer.id);

  let newLayer = oldLayer.updateLayerConfig({dataId});
  // this may happen when a layer is new (type: null and no columns) but it's not ready to be saved
  if (newLayer.isValidToSave()) {
    const validated = validateExistingLayerWithData(
      state.datasets[dataId],
      state.layerClasses,
      newLayer
    );
    // if cant validate it with data create a new one
    if (!validated) {
      newLayer = new state.layerClasses[oldLayer.type]({dataId, id: oldLayer.id});
    } else {
      newLayer = validated;
    }
  }

  newLayer = newLayer.updateLayerConfig({
    isVisible: oldLayer.config.isVisible,
    isConfigActive: true
  });

  newLayer.updateLayerDomain(state.datasets);
  const {layerData, layer} = calculateLayerData(newLayer, state, undefined);

  return updateStateWithLayerAndData(state, {layerData, layer, idx});
}

/**
 * Update layer type. Previews layer config will be copied if applicable.
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').layerTypeChangeUpdater}
 * @public
 */
export function layerTypeChangeUpdater(state, action) {
  const {oldLayer, newType} = action;
  if (!oldLayer) {
    return state;
  }
  const oldId = oldLayer.id;
  const idx = state.layers.findIndex(l => l.id === oldId);

  if (!state.layerClasses[newType]) {
    Console.error(`${newType} is not a valid layer type`);
    return state;
  }

  // get a mint layer, with new id and type
  // because deck.gl uses id to match between new and old layer.
  // If type has changed but id is the same, it will break
  const newLayer = new state.layerClasses[newType]();

  newLayer.assignConfigToLayer(oldLayer.config, oldLayer.visConfigSettings);

  newLayer.updateLayerDomain(state.datasets);
  const {layerData, layer} = calculateLayerData(newLayer, state);
  let newState = updateStateWithLayerAndData(state, {layerData, layer, idx});

  if (layer.config.animation.enabled || oldLayer.config.animation.enabled) {
    newState = updateAnimationDomain(newState);
  }

  // update splitMap layer id
  if (state.splitMaps.length) {
    newState = {
      ...newState,
      splitMaps: newState.splitMaps.map(settings => {
        const {[oldId]: oldLayerMap, ...otherLayers} = settings.layers;
        return oldId in settings.layers
          ? {
              ...settings,
              layers: {
                ...otherLayers,
                [layer.id]: oldLayerMap
              }
            }
          : settings;
      })
    };
  }

  return newState;
}

/**
 * Update layer visual channel
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').layerVisualChannelChangeUpdater}
 * @returns {Object} nextState
 * @public
 */
export function layerVisualChannelChangeUpdater(state, action) {
  const {oldLayer, newConfig, channel} = action;
  if (!oldLayer.config.dataId) {
    return state;
  }
  const dataset = state.datasets[oldLayer.config.dataId];

  const idx = state.layers.findIndex(l => l.id === oldLayer.id);
  const newLayer = oldLayer.updateLayerConfig(newConfig);

  newLayer.updateLayerVisualChannel(dataset, channel);

  const oldLayerData = state.layerData[idx];
  const {layerData, layer} = calculateLayerData(newLayer, state, oldLayerData);

  return updateStateWithLayerAndData(state, {layerData, layer, idx});
}

/**
 * Update layer `visConfig`
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').layerVisConfigChangeUpdater}
 * @public
 */
export function layerVisConfigChangeUpdater(state, action) {
  const {oldLayer} = action;
  const idx = state.layers.findIndex(l => l.id === oldLayer.id);
  const props = Object.keys(action.newVisConfig);
  const newVisConfig = {
    ...oldLayer.config.visConfig,
    ...action.newVisConfig
  };

  const newLayer = oldLayer.updateLayerConfig({visConfig: newVisConfig});

  if (newLayer.shouldCalculateLayerData(props)) {
    const oldLayerData = state.layerData[idx];
    const {layerData, layer} = calculateLayerData(newLayer, state, oldLayerData);
    return updateStateWithLayerAndData(state, {layerData, layer, idx});
  }

  return updateStateWithLayerAndData(state, {layer: newLayer, idx});
}

/**
 * Update filter property
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setFilterAnimationTimeUpdater}
 * @public
 */
export function setFilterAnimationTimeUpdater(state, action) {
  return setFilterUpdater(state, action);
}

/**
 * Update filter animation window
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setFilterAnimationWindowUpdater}
 * @public
 */
export function setFilterAnimationWindowUpdater(state, {id, animationWindow}) {
  return {
    ...state,
    filters: state.filters.map(f =>
      f.id === id
        ? {
            ...f,
            animationWindow
          }
        : f
    )
  };
}
/**
 * Update filter property
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setFilterUpdater}
 * @public
 */
export function setFilterUpdater(state, action) {
  const {idx, prop, value, valueIndex = 0} = action;
  const oldFilter = state.filters[idx];

  if (!oldFilter) {
    Console.error(`filters.${idx} is undefined`);
    return state;
  }
  let newFilter = set([prop], value, oldFilter);
  let newState = state;

  const {dataId} = newFilter;

  // Ensuring backward compatibility
  let datasetIds = toArray(dataId);

  switch (prop) {
    // TODO: Next PR for UI if we update dataId, we need to consider two cases:
    // 1. dataId is empty: create a default filter
    // 2. Add a new dataset id
    case FILTER_UPDATER_PROPS.dataId:
      // if trying to update filter dataId. create an empty new filter
      newFilter = updateFilterDataId(dataId);
      break;

    case FILTER_UPDATER_PROPS.name:
      // we are supporting the current functionality
      // TODO: Next PR for UI filter name will only update filter name but it won't have side effects
      // we are gonna use pair of datasets and fieldIdx to update the filter
      const datasetId = newFilter.dataId[valueIndex];
      const {filter: updatedFilter, dataset: newDataset} = applyFilterFieldName(
        newFilter,
        state.datasets[datasetId],
        value,
        valueIndex,
        {mergeDomain: false}
      );
      if (!updatedFilter) {
        return state;
      }

      newFilter = updatedFilter;

      if (newFilter.gpu) {
        newFilter = setFilterGpuMode(newFilter, state.filters);
        newFilter = assignGpuChannel(newFilter, state.filters);
      }

      newState = set(['datasets', datasetId], newDataset, state);

      // only filter the current dataset
      break;
    case FILTER_UPDATER_PROPS.layerId:
      // We need to update only datasetId/s if we have added/removed layers
      // - check for layerId changes (XOR works because of string values)
      // if no differences between layerIds, don't do any filtering
      // @ts-ignore
      const layerIdDifference = xor(newFilter.layerId, oldFilter.layerId);

      const layerDataIds = uniq(
        layerIdDifference
          .map(lid =>
            get(
              state.layers.find(l => l.id === lid),
              ['config', 'dataId']
            )
          )
          .filter(d => d)
      );

      // only filter datasetsIds
      datasetIds = layerDataIds;

      // Update newFilter dataIds
      const newDataIds = uniq(
        newFilter.layerId
          .map(lid =>
            get(
              state.layers.find(l => l.id === lid),
              ['config', 'dataId']
            )
          )
          .filter(d => d)
      );

      newFilter = {
        ...newFilter,
        dataId: newDataIds
      };

      break;

    case FILTER_UPDATER_PROPS.order:
      const destIdx = value == 'down' ? idx + 1 : (value == 'up' ? idx - 1 : idx);

      if (destIdx < 0 || destIdx >= state.filters.length) {
        newFilter = oldFilter;
      }
      else {
        newFilter = state.filters[destIdx];
        newState = set(['filters', destIdx], oldFilter, newState);
      }

      break;

    default:
      break;
  }

  const enlargedFilter = state.filters.find(f => f.enlarged);

  if (enlargedFilter && enlargedFilter.id !== newFilter.id) {
    // there should be only one enlarged filter
    newFilter.enlarged = false;
  }

  // save new filters to newState
  newState = set(['filters', idx], newFilter, newState);

  // if we are currently setting a prop that only requires to filter the current
  // dataset we will pass only the current dataset to applyFiltersToDatasets and
  // updateAllLayerDomainData otherwise we pass the all list of datasets as defined in dataId
  const datasetIdsToFilter = LIMITED_FILTER_EFFECT_PROPS[prop]
    ? [datasetIds[valueIndex]]
    : datasetIds;

  // filter data
  const {datasets, filters} = applyFiltersToDatasets(
    datasetIdsToFilter,
    newState.datasets,
    newState.filters,
    newState.layers
  );

  newState = set(['datasets'], datasets, newState);
  newState = set(['filters'], filters, newState);
  // dataId is an array
  // pass only the dataset we need to update
  newState = updateAllLayerDomainData(newState, datasetIdsToFilter, undefined);
  
  // update the report data
  const {dataId: reportId, field, aggregation, interval, type} = newState.dataReport;
  
  if (reportId && field && interval && type) {
    const chartData = generateDataReport(datasets[reportId], field, aggregation, interval, type);
    newState = set(['dataReport', 'chartData'], chartData, newState);
  }
  
  return newState;
}

/**
 * Set the property of a filter plot
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setFilterPlotUpdater}
 * @public
 */
export const setFilterPlotUpdater = (state, {idx, newProp, valueIndex = 0}) => {
  let newFilter = {...state.filters[idx], ...newProp};
  const prop = Object.keys(newProp)[0];
  if (prop === 'yAxis') {
    const plotType = getDefaultFilterPlotType(newFilter);
    // TODO: plot is not supported in multi dataset filter for now
    if (plotType) {
      newFilter = {
        ...newFilter,
        ...getFilterPlot({...newFilter, plotType}, state.datasets[newFilter.dataId[valueIndex]]),
        plotType
      };
    }
  }

  return {
    ...state,
    filters: state.filters.map((f, i) => (i === idx ? newFilter : f))
  };
};

/**
 * Add a new filter
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').addFilterUpdater}
 * @public
 */
export const addFilterUpdater = (state, action) =>
  !action.dataId
    ? state
    : {
        ...state,
        filters: [...state.filters, getDefaultFilter(action.dataId)]
      };

/**
 * Set layer color palette ui state
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').layerColorUIChangeUpdater}
 */
export const layerColorUIChangeUpdater = (state, {oldLayer, prop, newConfig}) => {
  const oldVixConfig = oldLayer.config.visConfig[prop];
  const newLayer = oldLayer.updateLayerColorUI(prop, newConfig);
  const newVisConfig = newLayer.config.visConfig[prop];
  if (oldVixConfig !== newVisConfig) {
    return layerVisConfigChangeUpdater(state, {
      oldLayer,
      newVisConfig: {
        [prop]: newVisConfig
      }
    });
  }
  return {
    ...state,
    layers: state.layers.map(l => (l.id === oldLayer.id ? newLayer : l))
  };
};

/**
 * Start and end filter animation
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').toggleFilterAnimationUpdater}
 * @public
 */
export const toggleFilterAnimationUpdater = (state, action) => ({
  ...state,
  filters: state.filters.map((f, i) => (i === action.idx ? {...f, isAnimating: !f.isAnimating} : f))
});

/**
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').toggleLayerAnimationUpdater}
 * @public
 */
export const toggleLayerAnimationUpdater = state => ({
  ...state,
  animationConfig: {
    ...state.animationConfig,
    isAnimating: !state.animationConfig.isAnimating
  }
});
/**
 * Change filter animation speed
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').updateFilterAnimationSpeedUpdater}
 * @public
 */
export const updateFilterAnimationSpeedUpdater = (state, action) => ({
  ...state,
  filters: state.filters.map((f, i) => (i === action.idx ? {...f, speed: action.speed} : f))
});

/**
 * Reset animation config current time to a specified value
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setLayerAnimationTimeUpdater}
 * @public
 *
 */
export const setLayerAnimationTimeUpdater = (state, {value}) => ({
  ...state,
  animationConfig: {
    ...state.animationConfig,
    currentTime: value
  }
});

/**
 * Update animation speed with the vertical speed slider
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').updateLayerAnimationSpeedUpdater}
 * @public
 *
 */
export const updateLayerAnimationSpeedUpdater = (state, {speed}) => {
  return {
    ...state,
    animationConfig: {
      ...state.animationConfig,
      speed
    }
  };
};

/**
 * Show larger time filter at bottom for time playback (apply to time filter only)
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').enlargeFilterUpdater}
 * @public
 */
export const enlargeFilterUpdater = (state, action) => {
  return {
    ...state,
    filters: state.filters.map((f, i) =>
      i === action.idx
        ? {
            ...f,
            enlarged: !f.enlarged
          }
        : f
    )
  };
};

/**
 * Toggles filter feature visibility
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').toggleFilterFeatureUpdater}
 */
export const toggleFilterFeatureUpdater = (state, action) => {
  const filter = state.filters[action.idx];
  const isVisible = get(filter, ['value', 'properties', 'isVisible']);
  const newFilter = {
    ...filter,
    value: featureToFilterValue(filter.value, filter.id, {
      isVisible: !isVisible
    })
  };

  return {
    ...state,
    filters: Object.assign([...state.filters], {[action.idx]: newFilter})
  };
};

/**
 * Remove a filter
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').removeFilterUpdater}
 * @public
 */
export const removeFilterUpdater = (state, action) => {
  const {idx} = action;
  const {dataId, id} = state.filters[idx];

  const newFilters = [
    ...state.filters.slice(0, idx),
    ...state.filters.slice(idx + 1, state.filters.length)
  ];

  const {datasets: filteredDatasets, filters: updatedFilters} = applyFiltersToDatasets(dataId, state.datasets, newFilters, state.layers);
  const newEditor =
    getFilterIdInFeature(state.editor.selectedFeature) === id
      ? {
          ...state.editor,
          selectedFeature: null
        }
      : state.editor;

  let newState = set(['filters'], updatedFilters, state);
  newState = set(['datasets'], filteredDatasets, newState);
  newState = set(['editor'], newEditor, newState);

  return updateAllLayerDomainData(newState, dataId, undefined);
};

/**
 * Add a new layer
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').addLayerUpdater}
 * @public
 */
export const addLayerUpdater = (state, action) => {
  let newLayer;
  let newLayerData;
  if (action.config) {
    newLayer = createLayerFromConfig(state, action.config);
    if (!newLayer) {
      Console.warn(
        'Failed to create layer from config, it usually means the config is not be in correct format',
        action.config
      );
      return state;
    }

    const result = calculateLayerData(newLayer, state);
    newLayer = result.layer;
    newLayerData = result.layerData;
  } else {
    // create an empty layer with the first available dataset
    const defaultDataset = Object.keys(state.datasets)[0];
    newLayer = new Layer({
      isVisible: true,
      isConfigActive: true,
      dataId: defaultDataset
    });
    newLayerData = {};
  }
  return {
    ...state,
    layers: [...state.layers, newLayer],
    layerData: [...state.layerData, newLayerData],
    layerOrder: [...state.layerOrder, state.layerOrder.length],
    splitMaps: addNewLayersToSplitMap(state.splitMaps, newLayer)
  };
};

/**
 * remove layer
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').removeLayerUpdater}
 * @public
 */
export const removeLayerUpdater = (state, {idx}) => {
  const {layers, layerData, clicked, hoverInfo} = state;
  const layerToRemove = state.layers[idx];
  const newMaps = removeLayerFromSplitMaps(state.splitMaps, layerToRemove);

  const newState = {
    ...state,
    layers: [...layers.slice(0, idx), ...layers.slice(idx + 1, layers.length)],
    layerData: [...layerData.slice(0, idx), ...layerData.slice(idx + 1, layerData.length)],
    layerOrder: state.layerOrder.filter(i => i !== idx).map(pid => (pid > idx ? pid - 1 : pid)),
    clicked: layerToRemove.isLayerHovered(clicked) ? undefined : clicked,
    hoverInfo: layerToRemove.isLayerHovered(hoverInfo) ? undefined : hoverInfo,
    splitMaps: newMaps
    // TODO: update filters, create helper to remove layer form filter (remove layerid and dataid) if mapped
  };

  return updateAnimationDomain(newState);
};

/**
 * duplicate layer
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').duplicateLayerUpdater}
 * @public
 */
export const duplicateLayerUpdater = (state, {idx}) => {
  const {layers} = state;
  const original = state.layers[idx];
  const originalLayerOrderIdx = state.layerOrder.findIndex(i => i === idx);

  if (!original) {
    Console.warn(`layer.${idx} is undefined`);
    return state;
  }
  let newLabel = `Copy of ${original.config.label}`;
  let postfix = 0;
  // eslint-disable-next-line no-loop-func
  while (layers.find(l => l.config.label === newLabel)) {
    newLabel = `Copy of ${original.config.label} ${++postfix}`;
  }

  // collect layer config from original
  const loadedLayer = serializeLayer(original);

  // assign new id and label to copied layer
  if (!loadedLayer.config) {
    return state;
  }
  loadedLayer.config.label = newLabel;
  loadedLayer.id = generateHashId(LAYER_ID_LENGTH);

  // add layer to state
  let nextState = addLayerUpdater(state, {config: loadedLayer});

  // new added layer are at the end, move it to be on top of original layer
  const newLayerOrderIdx = nextState.layerOrder.length - 1;
  const newLayerOrder = arrayInsert(
    nextState.layerOrder.slice(0, newLayerOrderIdx),
    originalLayerOrderIdx,
    newLayerOrderIdx
  );

  nextState = {
    ...nextState,
    layerOrder: newLayerOrder
  };

  return updateAnimationDomain(nextState);
};

/**
 * Reorder layer
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').reorderLayerUpdater}
 * @public
 */
export const reorderLayerUpdater = (state, {order}) => ({
  ...state,
  layerOrder: order
});

/**
 * Remove a dataset and all layers, filters, tooltip configs that based on it
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').removeDatasetUpdater}
 * @public
 */
export const removeDatasetUpdater = (state, action) => {
  // extract dataset key
  const {dataId: datasetKey} = action;
  const {datasets} = state;

  // check if dataset is present
  if (!datasets[datasetKey]) {
    return state;
  }

  /* eslint-disable no-unused-vars */
  const {
    layers,
    datasets: {[datasetKey]: dataset, ...newDatasets}
  } = state;
  /* eslint-enable no-unused-vars */

  const indexes = layers.reduce((listOfIndexes, layer, index) => {
    if (layer.config.dataId === datasetKey) {
      // @ts-ignore
      listOfIndexes.push(index);
    }
    return listOfIndexes;
  }, []);

  // remove layers and datasets
  const {newState} = indexes.reduce(
    ({newState: currentState, indexCounter}, idx) => {
      const currentIndex = idx - indexCounter;
      currentState = removeLayerUpdater(currentState, {idx: currentIndex});
      indexCounter++;
      return {newState: currentState, indexCounter};
    },
    {newState: {...state, datasets: newDatasets}, indexCounter: 0}
  );

  // remove filters
  const filters = state.filters.filter(filter => !filter.dataId.includes(datasetKey));

  // update interactionConfig
  let {interactionConfig} = state;
  const {tooltip} = interactionConfig;
  if (tooltip) {
    const {config} = tooltip;
    /* eslint-disable no-unused-vars */
    const {[datasetKey]: fields, ...fieldsToShow} = config.fieldsToShow;
    /* eslint-enable no-unused-vars */
    interactionConfig = {
      ...interactionConfig,
      tooltip: {...tooltip, config: {...config, fieldsToShow}}
    };
  }

  return {...newState, filters, interactionConfig};
};

/**
 * update layer blending mode
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').updateLayerBlendingUpdater}
 * @public
 */
export const updateLayerBlendingUpdater = (state, action) => ({
  ...state,
  layerBlending: action.mode
});

/**
 * Display dataset table in a modal
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').showDatasetTableUpdater}
 * @public
 */
export const showDatasetTableUpdater = (state, action) => {
  return {
    ...state,
    editingDataset: action.dataId
  };
};

/**
 * reset visState to initial State
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').resetMapConfigUpdater}
 * @public
 */
export const resetMapConfigUpdater = state => ({
  ...INITIAL_VIS_STATE,
  ...state.initialState,
  initialState: state.initialState
});

/**
 * Propagate `visState` reducer with a new configuration. Current config will be override.
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').receiveMapConfigUpdater}
 * @public
 */
export const receiveMapConfigUpdater = (state, {payload: {config = {}, options = {}}}) => {
  if (!config.visState) {
    return state;
  }

  const {keepExistingConfig} = options;

  // reset config if keepExistingConfig is falsy
  let mergedState = !keepExistingConfig ? resetMapConfigUpdater(state) : state;
  for (const merger of state.mergers) {
    if (isValidMerger(merger) && config.visState[merger.prop]) {
      mergedState = merger.merge(mergedState, config.visState[merger.prop], true);
    }
  }

  return mergedState;
};

/**
 * Trigger layer hover event with hovered object
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').layerHoverUpdater}
 * @public
 */
export const layerHoverUpdater = (state, action) => ({
  ...state,
  hoverInfo: action.info
});

/* eslint-enable max-statements */

/**
 * Update `interactionConfig`
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').interactionConfigChangeUpdater}
 * @public
 */
export function interactionConfigChangeUpdater(state, action) {
  const {config} = action;

  const interactionConfig = {
    ...state.interactionConfig,
    ...{[config.id]: config}
  };

  // Don't enable tooltip and brush at the same time
  // but coordinates can be shown at all time
  const contradict = ['brush', 'tooltip'];

  if (
    contradict.includes(config.id) &&
    config.enabled &&
    !state.interactionConfig[config.id].enabled
  ) {
    // only enable one interaction at a time
    contradict.forEach(k => {
      if (k !== config.id) {
        interactionConfig[k] = {...interactionConfig[k], enabled: false};
      }
    });
  }

  const newState = {
    ...state,
    interactionConfig
  };

  if (config.id === 'geocoder' && !config.enabled) {
    return removeDatasetUpdater(newState, {dataId: 'geocoder_dataset'});
  }

  return newState;
}

/**
 * Trigger layer click event with clicked object
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').layerClickUpdater}
 * @public
 */
export const layerClickUpdater = (state, action) => calcHexbinGraphData({
  ...state,
  mousePos: state.interactionConfig.coordinate.enabled
    ? {
        ...state.mousePos,
        pinned: state.mousePos.pinned ? null : cloneDeep(state.mousePos)
      }
    : state.mousePos,
  clicked: action.info && action.info.picked ? action.info : null
});

/**
 * Calculate Hexbin Graph Data whenever hexbin is clicked
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').calculateHexbinGraphData}
 * @public
 */
export const calcHexbinGraphData = (state) => {
  const {clicked, datasets, layers} = state;

  if (clicked == null) {
    return {...state, hexbinGraphData: null};
  }

  const {
    layer: {
      props: {
        id: layerId
      }
    },
    coordinate,
    object: {points}
  } = clicked;
  const layer = layers.find(l => l.id == layerId);
  const {
    config: {
      visConfig: {colorAggregation: aggregation}, 
      dataId, 
      colorField: aggrField
    }
  } = layer;
  
  if (!aggregation || aggregation == AGGREGATION_TYPES.count) {
    return {...state, hexbinGraphData: null};
  }

  const dataset = datasets[dataId];
  const enodebField = dataset.getColumnField("enodeb_id");
  const nameField = dataset.getColumnField("cell_name");
  const dateField = dataset.getColumnField("date");

  if (!enodebField || !dateField || !aggrField || !nameField) {
    return {...state, hexbinGraphData: null};
  }

  const {filteredIndexForDomain: filtered, allData} = dataset;
  const fieldData = filtered.map(i => allData[i]).map(aggrField.valueAccessor);
  const ymin = min(fieldData);
  const ymax = max(fieldData);

  const hexbinAllData = points.map(p => p.data);
  const cellNames = hexbinAllData.map(nameField.valueAccessor);
  const enodebs = hexbinAllData.map(enodebField.valueAccessor);
  const enodebMap = enodebs.reduce((acc, enodeb, idx) => ({
    ...acc,
    [enodeb]: cellNames[idx]
  }), {});

  // calculate lenght of bins
  const timestamps = hexbinAllData.map(dateField.valueAccessor).map(d => new Date(d).getTime());
  const startTime = min(timestamps);
  const endTime = max(timestamps);
  const diff = moment(endTime).diff(startTime, 'hours');
  let groupPeriod = 0;
  for (let p of HEXBIN_GROUPING_TIMES) {
    if (diff / p < 42) {
      groupPeriod = p * 3600000; // convert to milliseconds
      break;
    }
  }
  
  const hexbinValues = hexbinAllData.map(aggrField.valueAccessor);
  const hexbinEnodebs = hexbinAllData.map(enodebField.valueAccessor);
  const preparedData = timestamps.map((ts, idx) => {
    const groupTime = Math.floor((ts - startTime) / groupPeriod) * groupPeriod + startTime;
    const enodeb = hexbinEnodebs[idx]
    return {
      groupTime,
      enodeb,
      value: hexbinValues[idx]
    }
  });
  const aggrFuncMap = {
    [AGGREGATION_TYPES.average]: mean,
    [AGGREGATION_TYPES.maximum]: max,
    [AGGREGATION_TYPES.minimum]: min,
    [AGGREGATION_TYPES.median]: median,
    [AGGREGATION_TYPES.stdev]: deviation,
    [AGGREGATION_TYPES.sum]: sum,
    [AGGREGATION_TYPES.variance]: variance,
  };
  const groupedByEnodeb = _.groupBy(preparedData, 'enodeb');
  const groupTimes = [];
  for(let timer = startTime - groupPeriod; timer <= endTime + groupPeriod; timer += groupPeriod) {
    groupTimes.push(timer);
  }

  const groups = Object.keys(groupedByEnodeb).reduce((acc, enodeb) => {
    const enodebGroup = groupedByEnodeb[enodeb];
    const timeGroup = _.groupBy(enodebGroup, 'groupTime');
    const aggregatedData = Object.keys(timeGroup).reduce((acc, time) => ({
      ...acc,
      [time]: _.round(aggrFuncMap[aggregation](timeGroup[time], d => d.value), 2)
    }), []);
    const groupValues = Object.values(enodebGroup.map(d => d.value));

    return {
      ...acc,
      [enodeb]: {
        enodeb,
        cellName: enodebMap[enodeb],
        values: groupTimes.map(time => aggregatedData[time] || null),
        min: _.round(min(groupValues), 2),
        max: _.round(max(groupValues), 2),
        avg: _.round(mean(groupValues), 2),
        count: enodebGroup.length
      }
    }
  }, {});  
  
  const hexbinGraphData = {
    groups,
    ymin,
    ymax,
    startTime,
    endTime,
    groupPeriod,
    coordinate,
    aggrField,
    groupTimes
  };

  return {
    ...state,
    hexbinGraphData
  }
};

/**
 * Trigger map click event, unselect clicked object
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').mapClickUpdater}
 * @public
 */
export const mapClickUpdater = state => {
  return {
    ...state,
    clicked: null
  };
};

/**
 * Trigger map move event
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').mouseMoveUpdater}
 * @public
 */
export const mouseMoveUpdater = (state, {evt}) => {
  if (Object.values(state.interactionConfig).some(config => config.enabled)) {
    return {
      ...state,
      mousePos: {
        ...state.mousePos,
        mousePosition: [...evt.point],
        coordinate: [...evt.lngLat]
      }
    };
  }

  return state;
};
/**
 * Toggle visibility of a layer for a split map
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').toggleSplitMapUpdater}
 * @public
 */
export const toggleSplitMapUpdater = (state, action) =>
  state.splitMaps && state.splitMaps.length === 0
    ? {
        ...state,
        // maybe we should use an array to store state for a single map as well
        // if current maps length is equal to 0 it means that we are about to split the view
        splitMaps: computeSplitMapLayers(state.layers)
      }
    : closeSpecificMapAtIndex(state, action);

/**
 * Toggle visibility of a layer in a split map
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').toggleLayerForMapUpdater}
 * @public
 */
export const toggleLayerForMapUpdater = (state, {mapIndex, layerId}) => {
  const {splitMaps} = state;

  return {
    ...state,
    splitMaps: splitMaps.map((sm, i) =>
      i === mapIndex
        ? {
            ...splitMaps[i],
            layers: {
              ...splitMaps[i].layers,
              // if layerId not in layers, set it to visible
              [layerId]: !splitMaps[i].layers[layerId]
            }
          }
        : sm
    )
  };
};

/**
 * Add new dataset to `visState`, with option to load a map config along with the datasets
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').updateVisDataUpdater}
 * @public
 */
/* eslint-disable max-statements */
// eslint-disable-next-line complexity
export const updateVisDataUpdater = (state, action) => {
  // datasets can be a single data entries or an array of multiple data entries
  const {config, options} = action;
  const datasets = toArray(action.datasets);

  const newDataEntries = datasets.reduce(
    (accu, {info = {}, data, metadata} = {}) => ({
      ...accu,
      ...(createNewDataEntry({info, data, metadata}, state.datasets) || {})
    }),
    {}
  );

  const dataEmpty = Object.keys(newDataEntries).length < 1;

  // apply config if passed from action
  const previousState = config
    ? receiveMapConfigUpdater(state, {
        payload: {config, options}
      })
    : state;

  let mergedState = {
    ...previousState,
    datasets: {
      ...previousState.datasets,
      ...newDataEntries
    }
  };

  // merge state with config to be merged
  for (const merger of mergedState.mergers) {
    if (isValidMerger(merger) && merger.toMergeProp && mergedState[merger.toMergeProp]) {
      const toMerge = mergedState[merger.toMergeProp];
      mergedState[merger.toMergeProp] = INITIAL_VIS_STATE[merger.toMergeProp];
      mergedState = merger.merge(mergedState, toMerge);
    }
  }

  let newLayers = !dataEmpty
    ? mergedState.layers.filter(l => l.config.dataId && l.config.dataId in newDataEntries)
    : [];

  if (!newLayers.length && (options || {}).autoCreateLayers !== false) {
    // no layer merged, find defaults
    const result = addDefaultLayers(mergedState, newDataEntries);
    mergedState = result.state;
    newLayers = result.newLayers;
  }

  if (mergedState.splitMaps.length) {
    // if map is split, add new layers to splitMaps
    newLayers = mergedState.layers.filter(
      l => l.config.dataId && l.config.dataId in newDataEntries
    );
    mergedState = {
      ...mergedState,
      splitMaps: addNewLayersToSplitMap(mergedState.splitMaps, newLayers)
    };
  }

  // if no tooltips merged add default tooltips
  Object.keys(newDataEntries).forEach(dataId => {
    const tooltipFields = mergedState.interactionConfig.tooltip.config.fieldsToShow[dataId];
    if (!Array.isArray(tooltipFields) || !tooltipFields.length) {
      mergedState = addDefaultTooltips(mergedState, newDataEntries[dataId]);
    }
  });

  let updatedState = updateAllLayerDomainData(
    mergedState,
    dataEmpty ? Object.keys(mergedState.datasets) : Object.keys(newDataEntries),
    undefined
  );

  // register layer animation domain,
  // need to be called after layer data is calculated
  updatedState = updateAnimationDomain(updatedState);

  return updatedState;
};
/* eslint-enable max-statements */

/**
 * Rename an existing dataset in `visState`
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').renameDatasetUpdater}
 * @public
 */
export function renameDatasetUpdater(state, action) {
  const {dataId, label} = action;
  const {datasets} = state;
  const existing = datasets[dataId];
  // @ts-ignore
  return existing
    ? {
        ...state,
        datasets: {
          ...datasets,
          [dataId]: {
            ...existing,
            label
          }
        }
      }
    : // No-op if the dataset doesn't exist
      state;
}

/**
 * When a user clicks on the specific map closing icon
 * the application will close the selected map
 * and will merge the remaining one with the global state
 * TODO: i think in the future this action should be called merge map layers with global settings
 * @param {Object} state `visState`
 * @param {Object} action action
 * @returns {Object} nextState
 */
function closeSpecificMapAtIndex(state, action) {
  // retrieve layers meta data from the remaining map that we need to keep
  const indexToRetrieve = 1 - action.payload;
  const mapLayers = state.splitMaps[indexToRetrieve].layers;
  const {layers} = state;

  // update layer visibility
  const newLayers = layers.map(layer =>
    !mapLayers[layer.id] && layer.config.isVisible
      ? layer.updateLayerConfig({
          // if layer.id is not in mapLayers, it should be inVisible
          isVisible: false
        })
      : layer
  );

  // delete map
  return {
    ...state,
    layers: newLayers,
    splitMaps: []
  };
}

/**
 * Trigger file loading dispatch `addDataToMap` if succeed, or `loadFilesErr` if failed
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').loadFilesUpdater}
 * @public
 */
export const loadFilesUpdater = (state, action) => {
  const {files, onFinish = loadFilesSuccess} = action;
  if (!files.length) {
    return state;
  }

  const fileLoadingProgress = Array.from(files).reduce(
    (accu, f, i) => merge_(initialFileLoadingProgress(f, i))(accu),
    {}
  );

  const fileLoading = {
    fileCache: [],
    filesToLoad: files,
    onFinish
  };

  const nextState = merge_({fileLoadingProgress, fileLoading})(state);

  return loadNextFileUpdater(nextState);
};

/**
 * Sucessfully loaded one file, move on to the next one
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').loadFileStepSuccessUpdater}
 * @public
 */
export function loadFileStepSuccessUpdater(state, action) {
  if (!state.fileLoading) {
    return state;
  }
  const {fileName, fileCache} = action;
  const {filesToLoad, onFinish} = state.fileLoading;
  const stateWithProgress = updateFileLoadingProgressUpdater(state, {
    fileName,
    progress: {percent: 1, message: 'Done'}
  });

  // save processed file to fileCache
  const stateWithCache = pick_('fileLoading')(merge_({fileCache}))(stateWithProgress);

  return withTask(
    stateWithCache,
    DELAY_TASK(200).map(filesToLoad.length ? loadNextFile : () => onFinish(fileCache))
  );
}

// withTask<T>(state: T, task: any): T

/**
 *
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').loadNextFileUpdater}
 * @public
 */
export function loadNextFileUpdater(state) {
  if (!state.fileLoading) {
    return state;
  }
  const {filesToLoad} = state.fileLoading;
  const [file, ...remainingFilesToLoad] = filesToLoad;

  // save filesToLoad to state
  const nextState = pick_('fileLoading')(merge_({filesToLoad: remainingFilesToLoad}))(state);

  const stateWithProgress = updateFileLoadingProgressUpdater(nextState, {
    fileName: file.name,
    progress: {percent: 0, message: 'loading...'}
  });

  const {loaders, loadOptions} = state;
  return withTask(
    stateWithProgress,
    makeLoadFileTask(file, nextState.fileLoading.fileCache, loaders, loadOptions)
  );
}

export function makeLoadFileTask(file, fileCache, loaders = [], loadOptions = {}) {
  return LOAD_FILE_TASK({file, fileCache, loaders, loadOptions}).bimap(
    // prettier ignore
    // success
    gen =>
      nextFileBatch({
        gen,
        fileName: file.name,
        onFinish: result =>
          processFileContent({
            content: result,
            fileCache
          })
      }),

    // error
    err => loadFilesErr(file.name, err)
  );
}

/**
 *
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').processFileContentUpdater}
 * @public
 */
export function processFileContentUpdater(state, action) {
  const {content, fileCache} = action.payload;

  const stateWithProgress = updateFileLoadingProgressUpdater(state, {
    fileName: content.fileName,
    progress: {percent: 1, message: 'processing...'}
  });

  return withTask(
    stateWithProgress,
    PROCESS_FILE_DATA({content, fileCache}).bimap(
      result => loadFileStepSuccess({fileName: content.fileName, fileCache: result}),
      err => loadFilesErr(content.fileName, err)
    )
  );
}

export function parseProgress(prevProgress = {}, progress) {
  // This happens when receiving query metadata or other cases we don't
  // have an update for the user.
  if (!progress || !progress.percent) {
    return {};
  }

  return {
    percent: progress.percent
  };
}

/**
 * gets called with payload = AsyncGenerator<???>
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').nextFileBatchUpdater}
 * @public
 */
export const nextFileBatchUpdater = (
  state,
  {payload: {gen, fileName, progress, accumulated, onFinish}}
) => {
  const stateWithProgress = updateFileLoadingProgressUpdater(state, {
    fileName,
    progress: parseProgress(state.fileLoadingProgress[fileName], progress)
  });
  return withTask(
    stateWithProgress,
    UNWRAP_TASK(gen.next()).bimap(
      ({value, done}) => {
        return done
          ? onFinish(accumulated)
          : nextFileBatch({
              gen,
              fileName,
              progress: value.progress,
              accumulated: value,
              onFinish
            });
      },
      err => loadFilesErr(fileName, err)
    )
  );
};

/**
 * Trigger loading file error
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').loadFilesErrUpdater}
 * @public
 */
export const loadFilesErrUpdater = (state, {error, fileName}) => {
  // update ui with error message
  Console.warn(error);
  if (!state.fileLoading) {
    return state;
  }
  const {filesToLoad, onFinish, fileCache} = state.fileLoading;

  const nextState = updateFileLoadingProgressUpdater(state, {
    fileName,
    progress: {error}
  });

  // kick off next file or finish
  return withTask(
    nextState,
    DELAY_TASK(200).map(filesToLoad.length ? loadNextFile : () => onFinish(fileCache))
  );
};

/**
 * When select dataset for export, apply cpu filter to selected dataset
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').applyCPUFilterUpdater}
 * @public
 */
export const applyCPUFilterUpdater = (state, {dataId}) => {
  // apply cpuFilter
  const dataIds = toArray(dataId);

  return dataIds.reduce((accu, id) => filterDatasetCPU(accu, id), state);
};

/**
 * User input to update the info of the map
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setMapInfoUpdater}
 * @public
 */
export const setMapInfoUpdater = (state, action) => ({
  ...state,
  mapInfo: {
    ...state.mapInfo,
    ...action.info
  }
});
/**
 * Helper function to update All layer domain and layer data of state
 * @type {typeof import('./vis-state-updaters').addDefaultLayers}
 */
export function addDefaultLayers(state, datasets) {
  /** @type {Layer[]} */
  const empty = [];
  const defaultLayers = Object.values(datasets).reduce((accu, dataset) => {
    const foundLayers = findDefaultLayer(dataset, state.layerClasses);
    return foundLayers && foundLayers.length ? accu.concat(foundLayers) : accu;
  }, empty);

  return {
    state: {
      ...state,
      layers: [...state.layers, ...defaultLayers],
      layerOrder: [
        // put new layers on top of old ones
        ...defaultLayers.map((_, i) => state.layers.length + i),
        ...state.layerOrder
      ]
    },
    newLayers: defaultLayers
  };
}

/**
 * helper function to find default tooltips
 * @param {Object} state
 * @param {Object} dataset
 * @returns {Object} nextState
 */
export function addDefaultTooltips(state, dataset) {
  const tooltipFields = findFieldsToShow(dataset);
  const merged = {
    ...state.interactionConfig.tooltip.config.fieldsToShow,
    ...tooltipFields
  };

  return set(['interactionConfig', 'tooltip', 'config', 'fieldsToShow'], merged, state);
}

export function initialFileLoadingProgress(file, index) {
  const fileName = file.name || `Untitled File ${index}`;
  return {
    [fileName]: {
      // percent of current file
      percent: 0,
      message: '',
      fileName,
      error: null
    }
  };
}

export function updateFileLoadingProgressUpdater(state, {fileName, progress}) {
  return pick_('fileLoadingProgress')(pick_(fileName)(merge_(progress)))(state);
}
/**
 * Helper function to update layer domains for an array of datasets
 * @type {typeof import('./vis-state-updaters').updateAllLayerDomainData}
 */
export function updateAllLayerDomainData(state, dataId, updatedFilter) {
  const dataIds = typeof dataId === 'string' ? [dataId] : dataId;
  const newLayers = [];
  const newLayerData = [];

  state.layers.forEach((oldLayer, i) => {
    if (oldLayer.config.dataId && dataIds.includes(oldLayer.config.dataId)) {
      // No need to recalculate layer domain if filter has fixed domain
      const newLayer =
        updatedFilter && updatedFilter.fixedDomain
          ? oldLayer
          : oldLayer.updateLayerDomain(state.datasets, updatedFilter);

      const {layerData, layer} = calculateLayerData(newLayer, state, state.layerData[i]);

      newLayers.push(layer);
      newLayerData.push(layerData);
    } else {
      newLayers.push(oldLayer);
      newLayerData.push(state.layerData[i]);
    }
  });

  const newState = {
    ...state,
    layers: newLayers,
    layerData: newLayerData
  };

  return newState;
}

export function updateAnimationDomain(state) {
  // merge all animatable layer domain and update global config
  const animatableLayers = state.layers.filter(
    l =>
      l.config.isVisible &&
      l.config.animation &&
      l.config.animation.enabled &&
      Array.isArray(l.animationDomain)
  );

  if (!animatableLayers.length) {
    return {
      ...state,
      animationConfig: DEFAULT_ANIMATION_CONFIG
    };
  }

  const mergedDomain = animatableLayers.reduce(
    (accu, layer) => [
      Math.min(accu[0], layer.animationDomain[0]),
      Math.max(accu[1], layer.animationDomain[1])
    ],
    [Number(Infinity), -Infinity]
  );

  return {
    ...state,
    animationConfig: {
      ...state.animationConfig,
      currentTime: isInRange(state.animationConfig.currentTime, mergedDomain)
        ? state.animationConfig.currentTime
        : mergedDomain[0],
      domain: mergedDomain
    }
  };
}

/**
 * Update the status of the editor
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setEditorModeUpdater}
 */
export const setEditorModeUpdater = (state, {mode}) => ({
  ...state,
  editor: {
    ...state.editor,
    mode,
    selectedFeature: null
  }
});

// const featureToFilterValue = (feature) => ({...feature, id: feature.id});
/**
 * Update editor features
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setFeaturesUpdater}
 */
export function setFeaturesUpdater(state, {features = []}) {
  const lastFeature = features.length && features[features.length - 1];

  const newState = {
    ...state,
    editor: {
      ...state.editor,
      // only save none filter features to editor
      features: features.filter(f => !getFilterIdInFeature(f)),
      mode: lastFeature && lastFeature.properties.isClosed ? EDITOR_MODES.EDIT : state.editor.mode
    }
  };

  // Retrieve existing feature
  const {selectedFeature} = state.editor;

  // If no feature is selected we can simply return since no operations
  if (!selectedFeature) {
    return newState;
  }

  // TODO: check if the feature has changed
  const feature = features.find(f => f.id === selectedFeature.id);

  // if feature is part of a filter
  const filterId = feature && getFilterIdInFeature(feature);
  if (filterId && feature) {
    const featureValue = featureToFilterValue(feature, filterId);
    const filterIdx = state.filters.findIndex(fil => fil.id === filterId);
    return setFilterUpdater(newState, {
      idx: filterIdx,
      prop: 'value',
      value: featureValue
    });
  }

  return newState;
}

/**
 * Set the current selected feature
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setSelectedFeatureUpdater}
 */
export const setSelectedFeatureUpdater = (state, {feature}) => ({
  ...state,
  editor: {
    ...state.editor,
    selectedFeature: feature
  }
});

/**
 * Delete existing feature from filters
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').deleteFeatureUpdater}
 */
export function deleteFeatureUpdater(state, {feature}) {
  if (!feature) {
    return state;
  }

  const newState = {
    ...state,
    editor: {
      ...state.editor,
      selectedFeature: null
    }
  };

  if (getFilterIdInFeature(feature)) {
    const filterIdx = newState.filters.findIndex(f => f.id === getFilterIdInFeature(feature));

    return filterIdx > -1 ? removeFilterUpdater(newState, {idx: filterIdx}) : newState;
  }

  // modify editor object
  const newEditor = {
    ...state.editor,
    features: state.editor.features.filter(f => f.id !== feature.id),
    selectedFeature: null
  };

  return {
    ...state,
    editor: newEditor
  };
}

/**
 * Toggle feature as layer filter
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').setPolygonFilterLayerUpdater}
 */
export function setPolygonFilterLayerUpdater(state, payload) {
  const {layer, feature} = payload;
  const filterId = getFilterIdInFeature(feature);

  // let newFilter = null;
  let filterIdx;
  let newLayerId = [layer.id];
  let newState = state;
  // If polygon filter already exists, we need to find out if the current layer is already included
  if (filterId) {
    filterIdx = state.filters.findIndex(f => f.id === filterId);

    if (!state.filters[filterIdx]) {
      // what if filter doesn't exist?... not possible.
      // because features in the editor is passed in from filters and editors.
      // but we will move this feature back to editor just in case
      const noneFilterFeature = {
        ...feature,
        properties: {
          ...feature.properties,
          filterId: null
        }
      };

      return {
        ...state,
        editor: {
          ...state.editor,
          features: [...state.editor.features, noneFilterFeature],
          selectedFeature: noneFilterFeature
        }
      };
    }
    const filter = state.filters[filterIdx];
    const {layerId = []} = filter;
    const isLayerIncluded = layerId.includes(layer.id);

    newLayerId = isLayerIncluded
      ? // if layer is included, remove it
        layerId.filter(l => l !== layer.id)
      : [...layerId, layer.id];
  } else {
    // if we haven't create the polygon filter, create it
    const newFilter = generatePolygonFilter([], feature);
    filterIdx = state.filters.length;

    // add feature, remove feature from eidtor
    newState = {
      ...state,
      filters: [...state.filters, newFilter],
      editor: {
        ...state.editor,
        features: state.editor.features.filter(f => f.id !== feature.id),
        selectedFeature: newFilter.value
      }
    };
  }

  return setFilterUpdater(newState, {
    idx: filterIdx,
    prop: 'layerId',
    value: newLayerId
  });
}

/**
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').sortTableColumnUpdater}
 * @public
 */
export function sortTableColumnUpdater(state, {dataId, column, mode}) {
  const dataset = state.datasets[dataId];
  if (!dataset) {
    return state;
  }
  let sortMode = mode;
  if (!sortMode) {
    const currentMode = get(dataset, ['sortColumn', column]);
    // @ts-ignore - should be fixable in a TS file
    sortMode = currentMode
      ? Object.keys(SORT_ORDER).find(m => m !== currentMode)
      : SORT_ORDER.ASCENDING;
  }

  const sorted = sortDatasetByColumn(dataset, column, sortMode);
  return set(['datasets', dataId], sorted, state);
}

/**
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').pinTableColumnUpdater}
 * @public
 */
export function pinTableColumnUpdater(state, {dataId, column}) {
  const dataset = state.datasets[dataId];
  if (!dataset) {
    return state;
  }
  const field = dataset.fields.find(f => f.name === column);
  if (!field) {
    return state;
  }

  let pinnedColumns;
  if (Array.isArray(dataset.pinnedColumns) && dataset.pinnedColumns.includes(field.name)) {
    // unpin it
    pinnedColumns = dataset.pinnedColumns.filter(co => co !== field.name);
  } else {
    pinnedColumns = (dataset.pinnedColumns || []).concat(field.name);
  }

  return set(['datasets', dataId, 'pinnedColumns'], pinnedColumns, state);
}

/**
 * Copy column content as strings
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').copyTableColumnUpdater}
 * @public
 */
export function copyTableColumnUpdater(state, {dataId, column}) {
  const dataset = state.datasets[dataId];
  if (!dataset) {
    return state;
  }
  const fieldIdx = dataset.fields.findIndex(f => f.name === column);
  if (fieldIdx < 0) {
    return state;
  }
  const {type} = dataset.fields[fieldIdx];
  const text = dataset.allData.map(d => parseFieldValue(d[fieldIdx], type)).join('\n');

  copy(text);

  return state;
}

/**
 * Update editor
 * @type {typeof import('./vis-state-updaters').toggleEditorVisibilityUpdater}
 */
export function toggleEditorVisibilityUpdater(state) {
  return {
    ...state,
    editor: {
      ...state.editor,
      visible: !state.editor.visible
    }
  };
}

/**
 * Add marker with custom info on the map
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').addMarkerUpdater}
 * @public
 */
 export function addMarkerUpdater(state, { payload }) {
  let task, newState;

  if (Array.isArray(payload)) {
    newState = {
      ...state,
      marked: state.marked.concat(payload)
    };
    task = ACTION_TASK().map(_ => onMouseMove({ point: [0, 0], lngLat: payload?.[0].lngLat }));
  }
  else {
    task = ACTION_TASK().map(_ => onMouseMove({ point: [0, 0], lngLat: payload.lngLat }));
    newState = {
      ...state,
      marked: [
        ...state.marked,
        payload
      ]
    };
  }

  return withTask(newState, task);
}

/**
 * Remove marker
 * @memberof visStateUpdaters
 * @type {typeof import('./vis-state-updaters').removeMakerUpdater}
 * @public
 */
export function removeMarkerUpdater(state, { id }) {
  return {
    ...state,
    marked: (!id ? [] : state.marked.filter(m => m.id != id))
  }
}

export function enableDatasetUpdater(state, { datasetKey }) {
  const dataset = state.datasets[datasetKey];
  dataset.enabled = !dataset.enabled;
  const {enabled, id, allData, label, sessions, query, type} = dataset;
  const mutation = GQL_UPDATE_DATASET();
  const updateTask = GRAPHQL_MUTATION_TASK({
    variables: {id, label, query, sessions, type, enabled},
    mutation
  });
  let tasks = [updateTask];

  if (enabled) {
    if (allData.length) {
      const profileId = localStorage.getItem('default_profile_id');
      tasks =  [...tasks, ACTION_TASK().map(_ => applyProfile(profileId, {visState: state}, {centerMap: false}))];
    }
    else {
      tasks =  [...tasks, ACTION_TASK().map(_ => startReloadingDataset(datasetKey))];
    }
  }
  else {
    const layersToRemove = state.layers.filter(layer => layer.config.dataId == id);
    const idxsToRemove = [];
    layersToRemove.reduce((remainedLayers, layer) => {
      const idxToRemove = remainedLayers.findIndex(l => l.id == layer.id);
      idxsToRemove.push(idxToRemove);
      return remainedLayers.filter(l => l.id != layer.id);
    }, state.layers);

    tasks = [
      ...tasks,
      ...idxsToRemove.map(idx => ACTION_TASK().map(_ => removeLayer(idx)))
    ];
  };


  const newState = {
    ...state,
    datasets: {
      ...state.datasets,
      [datasetKey]: {
        ...dataset,
        reloading: enabled
      }
    }
  };

  return withTask(newState, tasks);
};

export function startReloadingDatasetUpdater(state, { datasetKey }) {
  const dataset = typeof datasetKey == 'object' ? datasetKey : state.datasets[datasetKey];
  const oldDataset = state.datasets[dataset.id];
  const { query: qstr, sessions } = dataset;
  const shouldReload = typeof datasetKey == 'string' 
    || oldDataset.query != qstr 
    || JSON.stringify(oldDataset.sessions) != JSON.stringify(sessions);

  const query = gql(restrictSession(qstr, sessions));
  const reloadTask = GRAPHQL_QUERY_TASK({ query, fetchPolicy: 'network-only' }).map(
    result => addDataToMap({
      datasets: {
        info: {
          ...dataset,
          reloading: false,
          timestamp: moment().valueOf()
        },
        data: makeDataset(query, result.data[extractOperation(query)], sessions)
      },
      options: {
        keepExistingConfig: true,
        centerMap: false,
        autoCreateLayers: false
      }
    })
  );
  const closeModalTask = ACTION_TASK().map(_ => toggleModal(null));
  const task = shouldReload ? reloadTask : closeModalTask;

  const newState = {
    ...state,
    datasets: {
      ...state.datasets,
      [dataset.id]: {
        ...dataset,
        reloading: shouldReload && dataset.enabled
      }
    }
  };

  return withTask(newState, task);
};

/**
 * Toggle data report
 * @memberof visStateUpdaters
 * @param state `visState`
 * @returns nextState
 * @type {typeof import('./ui-state-updaters').toggleDataReportUpdater}
 * @public
 */
 export const toggleDataReportUpdater = (state) => ({
  ...state,
  dataReport: {
    ...state.dataReport,
    toggled: !state.dataReport.toggled
  }
});

/**
 * Set the data source of the data reporting
 * @memberof visStateUpdaters
 * @param state `visState`
 * @param action
 * @param action.payload
 * @param action.payload.dataId dataId
 * @returns nextState
 * @type {typeof import('./vis-state-updaters').setReportDataSourceUpdater}
 * @public
 */
 export const setReportDataSourceUpdater = (state, {payload: dataId}) => ({
  ...state,
  dataReport: {
    ...state.dataReport,
    dataId,
    field: dataId != state.dataReport.dataId ? null : state.dataReport.field
  }
});

/**
 * Set the field of the data reporting
 * @memberof visStateUpdaters
 * @param state `visState`
 * @param action
 * @param action.payload
 * @param action.payload.field field
 * @returns nextState
 * @type {typeof import('./vis-state-updaters').setReportFieldUpdater}
 * @public
 */
 export function setReportFieldUpdater(state, {payload: field}) {
   const {datasets, dataReport: {dataId, aggregation, interval, type}} = state;

   return {
    ...state,
    dataReport: {
      ...state.dataReport,
      field,
      chartData: generateDataReport(datasets[dataId], field, aggregation, interval, type)
    }
   }
};

/**
 * Set the aggregation of the data reporting
 * @memberof visStateUpdaters
 * @param state `visState`
 * @param action
 * @param action.payload
 * @param action.payload.field field
 * @returns nextState
 * @type {typeof import('./vis-state-updaters').setReportAggregationUpdater}
 * @public
 */
 export function setReportAggregationUpdater(state, {payload: aggregation}) {
  const {datasets, dataReport: {dataId, field, interval, type}} = state;

  return {
   ...state,
   dataReport: {
     ...state.dataReport,
     aggregation,
     chartData: generateDataReport(datasets[dataId], field, aggregation, interval, type)
   }
  }
};

/**
 * Set the aggregation of the data reporting
 * @memberof visStateUpdaters
 * @param state `visState`
 * @param action
 * @param action.payload
 * @param action.payload.interval interval
 * @returns nextState
 * @type {typeof import('./vis-state-updaters').setReportIntervalUpdater}
 * @public
 */
 export function setReportIntervalUpdater(state, {payload: interval}) {
  const {datasets, dataReport: {dataId, field, aggregation, type}} = state;

  return {
   ...state,
   dataReport: {
     ...state.dataReport,
     interval,
     chartData: generateDataReport(datasets[dataId], field, aggregation, interval, type)
   }
  }
};

/**
 * Set the type of the data reporting
 * @memberof visStateUpdaters
 * @param state `visState`
 * @param action
 * @param action.payload
 * @param action.payload.type type
 * @returns nextState
 * @type {typeof import('./vis-state-updaters').setReportTypeUpdater}
 * @public
 */
 export function setReportTypeUpdater(state, {payload: type}) {
  const {datasets, dataReport: {dataId, field, aggregation, interval}} = state;

  return {
   ...state,
   dataReport: {
     ...state.dataReport,
     type,
     chartData: generateDataReport(datasets[dataId], field, aggregation, interval, type)
   }
  }
};

export function generateDataReport(dataset, field, aggregation, interval, type) {
  const {allData, filteredIndexForDomain} = dataset;
  const {valueAccessor: fieldAccessor} = field;
  const filtered = filteredIndexForDomain.map(i => allData[i]);
  const minionColumnIdx = dataset.getColumnFieldIdx('minion_id');
  const dateField = dataset.getColumnField('date');
  
  if (minionColumnIdx < 0 || !dateField) {
    return null;
  }

  const {valueAccessor: dateAccessor} = dateField;
  const dates = filtered.map(dateAccessor);
  const startDate = Math.min(...dates);
  const endDate = Math.max(...dates);
  interval *= 1000; // convert interval time to ms
  const samplingDates = [];
  const avgs = [];
  let stackedValues = [];
   
  for(let pointer = startDate; pointer <= endDate; pointer += interval) {
    samplingDates.push(pointer);
    stackedValues.push(0);
  }

  const groups = _.groupBy(filtered, minionColumnIdx);
  const series = Object.keys(groups).sort((a, b) => a > b ? 1 : -1).reduce((acc, key) => {
    const entries = groups[key].sort((a, b) => dateAccessor(a) - dateAccessor(b));
    const values = entries.map(fieldAccessor);
    const minionDates = entries.map(dateAccessor);
    const avg = _.round(aggregate(values, AGGREGATION_TYPES.average), 2);
    avgs.push(avg);

    if (aggregation == null) {
      return [
        ...acc,
        {
          type: 'line',
          text: key,
          values: values.map((v, idx) => [minionDates[idx], v])
        }
      ];
    }
    else {
      let idx = 0;
      let newValues = [];
      
      samplingDates.forEach(dt => {
        const spanValues = [];
        
        while(minionDates[idx] <= dt + interval) {
          if (notNullorUndefined(values[idx])) {
            spanValues.push(values[idx]);
          }
          idx++;
        }
  
        if (spanValues.length == 0) {
          newValues.push(0);
        }
        else {
          const aggr = aggregate(spanValues, aggregation);
          newValues.push(_.round(aggr, 2));
        }
      });

      if (type == REPORT_TYPES.stacked_sum) {
        stackedValues = newValues.map((nv, idx) => _.round(stackedValues[idx] + nv, 2));
      }
      
      return [
        ...acc,
        {
          type: type == REPORT_TYPES.normal ? 'line' : 'area',
          text: key,
          'legend-text': `${key}: ${avg}`,
          values: newValues,
        }
      ];
    }
  }, []).reverse();

  const aggrOfAvgs = aggregate(avgs, type == REPORT_TYPES.normal ? AGGREGATION_TYPES.average : AGGREGATION_TYPES.sum);
  
  if (type == REPORT_TYPES.stacked_sum) {
    series.push({
      text: 'SUM',
      'alpha-area': 0,
      values: stackedValues,
      stack: 2,
      'line-width': 0
    });  
  }

  return {
    stacked: type == REPORT_TYPES.stacked_sum,
    series,
    timestamp: new Date(),
    title: {
      text: aggregation ? type == REPORT_TYPES.normal ? 'AVG' : 'SUM AVG' : '',
      paddingTop: '50px',
      paddingLeft: '800px',
      backgroundColor: 'transparent',
      fontColor: 'white',
      fontSize: '15px',
      textAlign: 'left'
    },
    subtitle: {
      text: aggregation ? _.round(aggrOfAvgs, 2) : '',
      paddingTop: '50px',
      paddingLeft: '800px',
      backgroundColor: 'transparent',
      fontSize: '40px',
      fontColor: 'white',
      textAlign: 'left'
    },
    ...(aggregation ? {
      scaleX: {
        values: samplingDates
      }
    } : {})
  };
};
