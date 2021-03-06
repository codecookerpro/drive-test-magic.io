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

import React, {Component, createRef} from 'react';
import {console as Console} from 'global/window';
import {bindActionCreators} from 'redux';
import styled, {ThemeProvider, withTheme} from 'styled-components';
import {createSelector} from 'reselect';
import {connect as keplerGlConnect} from 'connect/keplergl-connect';
import {IntlProvider} from 'react-intl';
import {messages} from '../localization';
import {RootContext} from 'components/context';

import * as MinionStateActions from 'actions/minion-state-actions';
import * as VisStateActions from 'actions/vis-state-actions';
import * as MapStateActions from 'actions/map-state-actions';
import * as MapStyleActions from 'actions/map-style-actions';
import * as MapProfileActions from 'actions/map-profile-actions';
import * as UIStateActions from 'actions/ui-state-actions';
import * as ProviderActions from 'actions/provider-actions';
import * as AuthStateActions from 'actions/auth-state-actions';

import {
  DIMENSIONS,
  KEPLER_GL_NAME,
  KEPLER_GL_VERSION,
  THEME,
  DEFAULT_MAPBOX_API_URL
} from 'constants/default-settings';
import {MISSING_MAPBOX_TOKEN} from 'constants/user-feedbacks';

import SidePanelFactory from './side-panel';
import MapContainerFactory from './map-container';
import BottomWidgetFactory from './bottom-widget';
import ModalContainerFactory from './modal-container';
import PlotContainerFactory from './plot-container';
import NotificationPanelFactory from './notification-panel';
import GeoCoderPanelFactory from './geocoder-panel';

import {generateHashId} from 'utils/utils';
import {validateToken} from 'utils/mapbox-utils';
import {mergeMessages} from 'utils/locale-utils';

import {theme as basicTheme, themeLT, themeBS} from 'styles/base';

// Maybe we should think about exporting this or creating a variable
// as part of the base.js theme
const GlobalStyle = styled.div`
  font-family: ${props => props.theme.fontFamily};
  font-weight: ${props => props.theme.fontWeight};
  font-size: ${props => props.theme.fontSize};
  line-height: ${props => props.theme.lineHeight};

  *,
  *:before,
  *:after {
    -webkit-box-sizing: border-box;
    -moz-box-sizing: border-box;
    box-sizing: border-box;
  }

  ul {
    margin: 0;
    padding: 0;
  }

  li {
    margin: 0;
  }

  a {
    text-decoration: none;
    color: ${props => props.theme.labelColor};
  }

  .mapboxgl-ctrl .mapboxgl-ctrl-logo {
    display: none;
  }
`;

KeplerGlFactory.deps = [
  BottomWidgetFactory,
  GeoCoderPanelFactory,
  MapContainerFactory,
  ModalContainerFactory,
  SidePanelFactory,
  PlotContainerFactory,
  NotificationPanelFactory
];

function KeplerGlFactory(
  BottomWidget,
  GeoCoderPanel,
  MapContainer,
  ModalContainer,
  SidePanel,
  PlotContainer,
  NotificationPanel
) {
  /** @typedef {import('./kepler-gl').KeplerGlProps} KeplerGlProps */
  /** @augments React.Component<KeplerGlProps> */
  class KeplerGL extends Component {
    static defaultProps = {
      mapStyles: [],
      mapStylesReplaceDefault: false,
      mapboxApiUrl: DEFAULT_MAPBOX_API_URL,
      width: 800,
      height: 800,
      appName: KEPLER_GL_NAME,
      version: KEPLER_GL_VERSION,
      sidePanelWidth: DIMENSIONS.sidePanel.width.default,
      theme: {},
      cloudProviders: [],
      readOnly: false
    };

    componentDidMount() {
      this._validateMapboxToken();
      this._loadMapStyle(this.props.mapStyles);
      this._handleResize(this.props);
      
      const queryString = window.location.search;
      const urlParams = new URLSearchParams(queryString);
      const token = urlParams.get('token');
      this.props.authStateActions.getAuthInfo(token);

      if (typeof this.props.onKeplerGlInitialized === 'function') {
        this.props.onKeplerGlInitialized();
      }
    }

    componentDidUpdate(prevProps) {
      if (
        // if dimension props has changed
        this.props.height !== prevProps.height ||
        this.props.width !== prevProps.width ||
        // react-map-gl will dispatch updateViewport after this._handleResize is called
        // here we check if this.props.mapState.height is sync with props.height
        this.props.height !== this.props.mapState.height
      ) {
        this._handleResize(this.props);
      }
    }

    root = createRef();
    static contextType = RootContext;

    /* selectors */
    themeSelector = props => props.theme;
    availableThemeSelector = createSelector(this.themeSelector, theme =>
      typeof theme === 'object'
        ? {
            ...basicTheme,
            ...theme
          }
        : theme === THEME.light
        ? themeLT
        : theme === THEME.base
        ? themeBS
        : theme
    );

    availableProviders = createSelector(
      props => props.cloudProviders,
      providers =>
        Array.isArray(providers) && providers.length
          ? {
              hasStorage: providers.some(p => p.hasPrivateStorage()),
              hasShare: providers.some(p => p.hasSharingUrl())
            }
          : {}
    );

    localeMessagesSelector = createSelector(
      props => props.localeMessages,
      customMessages => (customMessages ? mergeMessages(messages, customMessages) : messages)
    );

    /* private methods */
    _validateMapboxToken() {
      const {mapboxApiAccessToken} = this.props;
      if (!validateToken(mapboxApiAccessToken)) {
        Console.warn(MISSING_MAPBOX_TOKEN);
      }
    }

    _handleResize({width, height}) {
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        Console.warn('width and height is required');
        return;
      }
      this.props.mapStateActions.updateMap({
        width: width / (1 + Number(this.props.mapState.isSplit)),
        height
      });
    }

    _loadMapStyle = () => {
      const defaultStyles = Object.values(this.props.mapStyle.mapStyles);
      // add id to custom map styles if not given
      const customStyles = (this.props.mapStyles || []).map(ms => ({
        ...ms,
        id: ms.id || generateHashId()
      }));

      const allStyles = [...customStyles, ...defaultStyles].reduce(
        (accu, style) => {
          const hasStyleObject = style.style && typeof style.style === 'object';
          accu[hasStyleObject ? 'toLoad' : 'toRequest'][style.id] = style;

          return accu;
        },
        {toLoad: {}, toRequest: {}}
      );

      this.props.mapStyleActions.loadMapStyles(allStyles.profile);
      this.props.mapStyleActions.requestMapStyles(allStyles.toRequest);
    };

    render() {
      const {
        // props
        id,
        appName,
        version,
        appWebsite,
        onSaveMap,
        onViewStateChange,
        onDeckInitialized,
        width,
        height,
        mapboxApiAccessToken,
        mapboxApiUrl,
        getMapboxRef,
        deckGlProps,

        // redux state
        mapStyle,
        mapState,
        uiState,
        visState,
        minionState,
        providerState,
        mapProfile,
        authState,

        // actions,
        minionStateActions,
        visStateActions,
        mapStateActions,
        mapStyleActions,
        mapProfileActions,
        uiStateActions,
        providerActions,
        authStateActions,

        // readOnly override
        readOnly
      } = this.props;

      const availableProviders = this.availableProviders(this.props);

      const {
        filters,
        layers,
        splitMaps, // this will store support for split map view is necessary
        layerOrder,
        layerBlending,
        layerClasses,
        interactionConfig,
        datasets,
        layerData,
        hoverInfo,
        clicked,
        marked,
        mousePos,
        animationConfig,
        mapInfo
      } = visState;

      const notificationPanelFields = {
        removeNotification: uiStateActions.removeNotification,
        notifications: uiState.notifications
      };

      const sideFields = {
        appName,
        version,
        appWebsite,
        datasets,
        filters,
        layers,
        layerOrder,
        layerClasses,
        interactionConfig,
        mapStyle,
        mapInfo,
        layerBlending,
        onSaveMap,
        uiState,
        mapState,
        minionState,
        mapStyleActions,
        mapProfileActions,
        mapStateActions,
        visStateActions,
        uiStateActions,
        minionStateActions,
        providerActions,
        authStateActions,
        width: this.props.sidePanelWidth,
        height: this.props.height - DIMENSIONS.sidePanel.margin.top - DIMENSIONS.sidePanel.margin.bottom,
        availableProviders,
        mapSaved: providerState.mapSaved,
        mapProfile,
        authState
      };

      const mapFields = {
        datasets,
        getMapboxRef,
        mapboxApiAccessToken,
        mapboxApiUrl,
        mapState,
        locale: uiState.locale,
        isGraphShow: uiState.isGraphShow,
        dataReportToggled: visState.dataReport.toggled,
        editor: visState.editor,
        mapStyle,
        mapControls: uiState.mapControls,
        layers,
        layerOrder,
        layerData,
        layerBlending,
        filters,
        interactionConfig,
        hoverInfo,
        clicked,
        marked,
        mousePos,
        readOnly: uiState.readOnly,
        onDeckInitialized,
        onViewStateChange,
        uiStateActions,
        visStateActions,
        mapStateActions,
        animationConfig,
        deckGlProps,
        markerScale: minionState.markerScale
      };
      
      const isSplit = splitMaps && splitMaps.length > 1;
      const containerW = mapState.width * (Number(isSplit) + 1);

      const mapContainers = !isSplit
        ? [<MapContainer key={0} index={0} {...mapFields} mapLayers={null} />]
        : splitMaps.map((settings, index) => (
            <MapContainer
              key={index}
              index={index}
              {...mapFields}
              mapLayers={splitMaps[index].layers}
            />
          ));

      const isExportingImage = uiState.exportImage.exporting;
      const theme = this.availableThemeSelector(this.props);
      const localeMessages = this.localeMessagesSelector(this.props);

      return (
        <RootContext.Provider value={this.root}>
          <IntlProvider locale={uiState.locale} messages={localeMessages[uiState.locale]}>
            <ThemeProvider theme={theme}>
              <GlobalStyle
                className="kepler-gl"
                id={`kepler-gl__${id}`}
                style={{
                  position: 'relative',
                  width: `${width}px`,
                  height: `${height}px`
                }}
                ref={this.root}
              >
                <NotificationPanel {...notificationPanelFields} />
                {!uiState.readOnly && !readOnly && <SidePanel {...sideFields} />}
                <div className="maps" style={{display: 'flex'}}>
                  {mapContainers}
                </div>
                {isExportingImage && (
                  <PlotContainer
                    width={width}
                    height={height}
                    exportImageSetting={uiState.exportImage}
                    mapFields={mapFields}
                    addNotification={uiStateActions.addNotification}
                    setExportImageSetting={uiStateActions.setExportImageSetting}
                    setExportImageDataUri={uiStateActions.setExportImageDataUri}
                    setExportImageError={uiStateActions.setExportImageError}
                    splitMaps={splitMaps}
                  />
                )}
                {interactionConfig.geocoder.enabled && (
                  <GeoCoderPanel
                    isGeocoderEnabled={interactionConfig.geocoder.enabled}
                    mapboxApiAccessToken={mapboxApiAccessToken}
                    mapState={mapState}
                    updateVisData={visStateActions.updateVisData}
                    removeDataset={visStateActions.removeDataset}
                    updateMap={mapStateActions.updateMap}
                  />
                )}
                <BottomWidget
                  filters={filters}
                  datasets={datasets}
                  uiState={uiState}
                  layers={layers}
                  animationConfig={animationConfig}
                  visState={visState}
                  visStateActions={visStateActions}
                  uiStateActions={uiStateActions}
                  sidePanelWidth={
                    uiState.readOnly ? 0 : this.props.sidePanelWidth + theme.sidePanel.margin.left
                  }
                  containerW={containerW}
                />
                <ModalContainer
                  mapStyle={mapStyle}
                  visState={visState}
                  mapState={mapState}
                  uiState={uiState}
                  authState={authState}
                  mapboxApiAccessToken={mapboxApiAccessToken}
                  mapboxApiUrl={mapboxApiUrl}
                  visStateActions={visStateActions}
                  uiStateActions={uiStateActions}
                  minionStateActions={minionStateActions}
                  mapStyleActions={mapStyleActions}
                  providerActions={providerActions}
                  authStateActions={authStateActions}
                  rootNode={this.root.current}
                  containerW={containerW}
                  containerH={mapState.height}
                  providerState={this.props.providerState}
                  // User defined cloud provider props
                  cloudProviders={this.props.cloudProviders}
                  onExportToCloudSuccess={this.props.onExportToCloudSuccess}
                  onLoadCloudMapSuccess={this.props.onLoadCloudMapSuccess}
                  onLoadCloudMapError={this.props.onLoadCloudMapError}
                  onExportToCloudError={this.props.onExportToCloudError}
                />
              </GlobalStyle>
            </ThemeProvider>
          </IntlProvider>
        </RootContext.Provider>
      );
    }
  }

  return keplerGlConnect(mapStateToProps, makeMapDispatchToProps)(withTheme(KeplerGL));
}

function mapStateToProps(state = {}, props) {
  return {
    ...props,
    minionState: state.minionState,
    visState: state.visState,
    mapStyle: state.mapStyle,
    mapState: state.mapState,
    uiState: state.uiState,
    providerState: state.providerState,
    mapProfile: state.mapProfile,
    authState: state.authState,
    sidePanelWidth: DIMENSIONS.sidePanel.width[state.uiState.activeSidePanel]
  };
}

const defaultUserActions = {};
const getDispatch = dispatch => dispatch;
const getUserActions = (dispatch, props) => props.actions || defaultUserActions;

function makeGetActionCreators() {
  return createSelector([getDispatch, getUserActions], (dispatch, userActions) => {
    const [minionStateActions, visStateActions, mapStateActions, mapStyleActions, mapProfileActions, uiStateActions, providerActions, authStateActions] = [
      MinionStateActions,
      VisStateActions,
      MapStateActions,
      MapStyleActions,
      MapProfileActions,
      UIStateActions,
      ProviderActions,
      AuthStateActions
    ].map(actions => bindActionCreators(mergeActions(actions, userActions), dispatch));

    return {
      minionStateActions,
      visStateActions,
      mapStateActions,
      mapStyleActions,
      mapProfileActions,
      uiStateActions,
      providerActions,
      authStateActions,
      dispatch
    };
  });
}

function makeMapDispatchToProps() {
  const getActionCreators = makeGetActionCreators();
  const mapDispatchToProps = (dispatch, ownProps) => {
    const groupedActionCreators = getActionCreators(dispatch, ownProps);

    return {
      ...groupedActionCreators,
      dispatch
    };
  };

  return mapDispatchToProps;
}

/**
 * Override default kepler.gl actions with user defined actions using the same key
 */
function mergeActions(actions, userActions) {
  const overrides = {};
  for (const key in userActions) {
    if (userActions.hasOwnProperty(key) && actions.hasOwnProperty(key)) {
      overrides[key] = userActions[key];
    }
  }

  return {...actions, ...overrides};
}

export default KeplerGlFactory;
