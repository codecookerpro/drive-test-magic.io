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

import geoViewport from '@mapbox/geo-viewport';
import WebMercatorViewport from 'viewport-mercator-project';

/** @typedef {import('./map-state-updaters').MapState} MapState */

/**
 * Updaters for `mapState` reducer. Can be used in your root reducer to directly modify kepler.gl's state.
 * Read more about [Using updaters](../advanced-usage/using-updaters.md)
 * @public
 * @example
 *
 * import keplerGlReducer, {mapStateUpdaters} from 'kepler.gl/reducers';
 * // Root Reducer
 * const reducers = combineReducers({
 *  keplerGl: keplerGlReducer,
 *  app: appReducer
 * });
 *
 * const composedReducer = (state, action) => {
 *  switch (action.type) {
 *    // click button to close side panel
 *    case 'CLICK_BUTTON':
 *      return {
 *        ...state,
 *        keplerGl: {
 *          ...state.keplerGl,
 *          foo: {
 *             ...state.keplerGl.foo,
 *             mapState: mapStateUpdaters.fitBoundsUpdater(
 *               mapState, {payload: [127.34, 31.09, 127.56, 31.59]]}
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
const mapStateUpdaters = null;
/* eslint-enable no-unused-vars */

/**
 * Default initial `mapState`
 * @memberof mapStateUpdaters
 * @constant
 * @property pitch Default: `0`
 * @property bearing Default: `0`
 * @property latitude Default: `50.03677807190906`
 * @property longitude Default: `22.00812137998123`
 * @property zoom Default: `9`
 * @property dragRotate Default: `false`
 * @property width Default: `800`
 * @property height Default: `800`
 * @property isSplit Default: `false`
 * @type {MapState}
 * @public
 */
export const INITIAL_MAP_STATE = {
  pitch: 0,
  bearing: 0,
  latitude: 50.03677807190906,
  longitude: 22.00812137998123,
  zoom: 16.82080489066417,
  dragRotate: false,
  width: 800,
  height: 800,
  isSplit: false
};

/* Updaters */
/**
 * Update map viewport
 * @memberof mapStateUpdaters
 * @type {typeof import('./map-state-updaters').updateMapUpdater}
 * @public
 */
export const updateMapUpdater = (state, action) => ({
  ...state,
  ...(action.payload || {})
});

/**
 * Fit map viewport to bounds
 * @memberof mapStateUpdaters
 * @type {typeof import('./map-state-updaters').fitBoundsUpdater}
 * @public
 */
export const fitBoundsUpdater = (state, action) => {
  const bounds = action.payload;
  // const {zoom} = geoViewport.viewport(bounds, [state.width, state.height]);
  // center being calculated by geo-vieweport.viewport has a complex logic that
  // projects and then unprojects the coordinates to determine the center
  // Calculating a simple average instead as that is the expected behavior in most of cases
  const [x1, y1, x2, y2, paddingEnabled] = bounds;
  const viewport = new WebMercatorViewport(state);
  const paddingHeight = state.height * 0.1;
  const paddingWidth = state.width * 0.1;
  const padding = paddingEnabled ? { left: 500, top: paddingHeight, bottom: paddingHeight, right: paddingWidth } : { left: 0, top: 0, right: 0, bottom: 0 };
  const { zoom, latitude, longitude } = viewport.fitBounds([[x1, y1], [x2, y2]], { padding });

  return {
    ...state,
    latitude,
    longitude,
    zoom
  };
};

/**
 * Toggle between 3d and 2d map.
 * @memberof mapStateUpdaters
 * @type {typeof import('./map-state-updaters').togglePerspectiveUpdater}
 * @public
 */
export const togglePerspectiveUpdater = state => ({
  ...state,
  ...{
    pitch: state.dragRotate ? 0 : 50,
    bearing: state.dragRotate ? 0 : 24
  },
  dragRotate: !state.dragRotate
});

/**
 * reset mapState to initial State
 * @memberof mapStateUpdaters
 * @type {typeof import('./map-state-updaters').resetMapConfigUpdater}
 * @public
 */
export const resetMapConfigUpdater = state => ({
  ...INITIAL_MAP_STATE,
  ...state.initialState,
  initialState: state.initialState
});

// consider case where you have a split map and user wants to reset
/**
 * Update `mapState` to propagate a new config
 * @memberof mapStateUpdaters
 * @type {typeof import('./map-state-updaters').receiveMapConfigUpdater}
 * @public
 */
export const receiveMapConfigUpdater = (
  state,
  { payload: { config = {}, options = {}, bounds = null } }
) => {
  const { mapState } = config || {};

  // merged received mapstate with previous state
  let mergedState = { ...state, ...mapState };

  // if center map
  // center map will override mapState config
  if (options.centerMap && bounds) {
    mergedState = fitBoundsUpdater(mergedState, {
      payload: bounds
    });
  }

  return {
    ...mergedState,
    // update width if `isSplit` has changed
    ...getMapDimForSplitMap(mergedState.isSplit, state)
  };
};

/**
 * Toggle between one or split maps
 * @memberof mapStateUpdaters
 * @type {typeof import('./map-state-updaters').toggleSplitMapUpdater}
 * @public
 */
export const toggleSplitMapUpdater = state => ({
  ...state,
  isSplit: !state.isSplit,
  ...getMapDimForSplitMap(!state.isSplit, state)
});

// Helpers
export function getMapDimForSplitMap(isSplit, state) {
  // cases:
  // 1. state split: true - isSplit: true
  // do nothing
  // 2. state split: false - isSplit: false
  // do nothing
  if (state.isSplit === isSplit) {
    return {};
  }

  const width =
    state.isSplit && !isSplit
      ? // 3. state split: true - isSplit: false
      // double width
      state.width * 2
      : // 4. state split: false - isSplit: true
      // split width
      state.width / 2;

  return {
    width
  };
}
