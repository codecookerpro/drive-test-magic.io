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

import React, { Component, useCallback } from 'react';
import classnames from 'classnames';

import PropTypes from 'prop-types';
import { SortableContainer, SortableElement } from 'react-sortable-hoc';
import styled from 'styled-components';
import { createSelector } from 'reselect';
import { injectIntl } from 'react-intl';
import { FormattedMessage } from 'localization';
import { arrayMove } from 'utils/data-utils';
import axios from 'axios';
import JqxWindow from 'jqwidgets-scripts/jqwidgets-react-tsx/jqxwindow';

import LayerPanelFactory from './layer-panel/layer-panel';
import SourceDataCatalogFactory from './common/source-data-catalog';
import { Add } from 'components/common/icons';
import ItemSelector from 'components/common/item-selector/item-selector';
import {
  Button,
  PanelLabel,
  SidePanelDivider,
  SidePanelSection
} from 'components/common/styled-components';

import { LAYER_BLENDINGS, USER_ROLES } from 'constants/default-settings';

import $ from 'jquery';
import 'gasparesganga-jquery-loading-overlay';

const LayerBlendingSelector = ({ layerBlending, updateLayerBlending, intl }) => {
  const labeledLayerBlendings = Object.keys(LAYER_BLENDINGS).reduce(
    (acc, current) => ({
      ...acc,
      [intl.formatMessage({ id: LAYER_BLENDINGS[current].label })]: current
    }),
    {}
  );

  const onChange = useCallback(blending => updateLayerBlending(labeledLayerBlendings[blending]), [
    updateLayerBlending,
    labeledLayerBlendings
  ]);

  return (
    <SidePanelSection>
      <PanelLabel>
        <FormattedMessage id="layerBlending.title" />
      </PanelLabel>
      <ItemSelector
        selectedItems={intl.formatMessage({ id: LAYER_BLENDINGS[layerBlending].label })}
        options={Object.keys(labeledLayerBlendings)}
        multiSelect={false}
        searchable={false}
        onChange={onChange}
      />
    </SidePanelSection>
  );
};

// make sure the element is always visible while is being dragged
// item being dragged is appended in body, here to reset its global style
const SortableStyledItem = styled.div`
  z-index: ${props => props.theme.dropdownWrapperZ + 1};

  &.sorting {
    pointer-events: none;
  }

  &.sorting-layers .layer-panel__header {
    background-color: ${props => props.theme.panelBackgroundHover};
    font-family: ${props => props.theme.fontFamily};
    font-weight: ${props => props.theme.fontWeight};
    font-size: ${props => props.theme.fontSize};
    line-height: ${props => props.theme.lineHeight};
    *,
    *:before,
    *:after {
      box-sizing: border-box;
    }
    .layer__drag-handle {
      opacity: 1;
      color: ${props => props.theme.textColorHl};
    }
  }
`;

const WelcomeText = styled.div`
  margin-bottom: 16px;
  color: white;
  font-size: 16px;
  line-height: 24px;
`;

export function AddDataButtonFactory() {
  const AddDataButton = ({ onClick, isInactive }) => (
    <Button
      className="add-data-button"
      onClick={onClick}
      isInactive={!isInactive}
      width="105px"
      secondary
    >
      <Add height="12px" />
      <FormattedMessage id={'layerManager.addData'} />
    </Button>
  );

  return AddDataButton;
}

LayerManagerFactory.deps = [AddDataButtonFactory, LayerPanelFactory, SourceDataCatalogFactory];

function LayerManagerFactory(AddDataButton, LayerPanel, SourceDataCatalog) {
  // By wrapping layer panel using a sortable element we don't have to implement the drag and drop logic into the panel itself;
  // Developers can provide any layer panel implementation and it will still be sortable
  const SortableItem = SortableElement(({ children, isSorting }) => {
    return (
      <SortableStyledItem className={classnames('sortable-layer-items', { sorting: isSorting })}>
        {children}
      </SortableStyledItem>
    );
  });

  const WrappedSortableContainer = SortableContainer(({ children }) => {
    return <div>{children}</div>;
  });

  class LayerManager extends Component {
    static propTypes = {
      datasets: PropTypes.object.isRequired,
      layerBlending: PropTypes.string.isRequired,
      layerClasses: PropTypes.object.isRequired,
      layers: PropTypes.arrayOf(PropTypes.any).isRequired,
      // functions
      addLayer: PropTypes.func.isRequired,
      layerColorUIChange: PropTypes.func.isRequired,
      layerConfigChange: PropTypes.func.isRequired,
      layerTextLabelChange: PropTypes.func.isRequired,
      layerVisualChannelConfigChange: PropTypes.func.isRequired,
      layerTypeChange: PropTypes.func.isRequired,
      layerVisConfigChange: PropTypes.func.isRequired,
      openModal: PropTypes.func.isRequired,
      removeLayer: PropTypes.func.isRequired,
      duplicateLayer: PropTypes.func.isRequired,
      removeDataset: PropTypes.func.isRequired,
      startReloadingDataset: PropTypes.func.isRequired,
      enableDataset: PropTypes.func.isRequired,
      setupDataset: PropTypes.func.isRequired,
      loadDataset: PropTypes.func.isRequired,
      showDatasetTable: PropTypes.func.isRequired,
      updateLayerBlending: PropTypes.func.isRequired,
      updateLayerOrder: PropTypes.func.isRequired
    };
    state = {
      isSorting: false,
      welcomeText: '',
    };
    welcomeWnd = React.createRef();

    componentDidMount() {
      const { userRole } = this.props;
      if (userRole && userRole != USER_ROLES.not_allowed && Object.keys(this.props.datasets).length == 0) {
        $('.side-panel__content').LoadingOverlay('show');

        if (userRole == USER_ROLES.guest) {
          axios.get('/welcome.txt').then(res => {
            $('.side-panel__content').LoadingOverlay('hide', true);
            this.setState({ welcomeText: res.data });
            this.welcomeWnd.current?.open();
          });
        } else {
          this.props.loadDataset();
        }
      }
    }

    layerClassSelector = props => props.layerClasses;
    layerTypeOptionsSelector = createSelector(this.layerClassSelector, layerClasses =>
      Object.keys(layerClasses).map(key => {
        const layer = new layerClasses[key]();
        return {
          id: key,
          label: layer.name,
          icon: layer.layerIcon,
          requireData: layer.requireData
        };
      })
    );

    _addEmptyNewLayer = () => {
      this.props.addLayer();
    };

    _handleSort = ({ oldIndex, newIndex }) => {
      this.props.updateLayerOrder(arrayMove(this.props.layerOrder, oldIndex, newIndex));
      this.setState({ isSorting: false });
    };

    _handleWelcomeContinue = () => {
      this.welcomeWnd.current?.close();
      this.props.loadDataset();
      $('.side-panel__content').LoadingOverlay('show');
    };

    _onSortStart = () => {
      this.setState({ isSorting: true });
    };

    _updateBeforeSortStart = ({ index }) => {
      // if layer config is active, close it
      const { layerOrder, layers, layerConfigChange } = this.props;
      const layerIdx = layerOrder[index];
      if (layers[layerIdx].config.isConfigActive) {
        layerConfigChange(layers[layerIdx], { isConfigActive: false });
      }
    };

    render() {
      const { layers, datasets, layerOrder, openModal, intl, userRole } = this.props;
      const hadDBPrivilege = userRole == USER_ROLES.admin || userRole == USER_ROLES.user;
      const defaultDataset = Object.keys(datasets)[0];
      const layerTypeOptions = this.layerTypeOptionsSelector(this.props);

      const layerActions = {
        layerColorUIChange: this.props.layerColorUIChange,
        layerConfigChange: this.props.layerConfigChange,
        layerVisualChannelConfigChange: this.props.layerVisualChannelConfigChange,
        layerTypeChange: this.props.layerTypeChange,
        layerVisConfigChange: this.props.layerVisConfigChange,
        layerTextLabelChange: this.props.layerTextLabelChange,
        removeLayer: this.props.removeLayer,
        duplicateLayer: this.props.duplicateLayer
      };

      const panelProps = {
        datasets,
        openModal,
        layerTypeOptions
      };

      return (
        <div className="layer-manager">
          <SourceDataCatalog
            userRole={userRole}
            datasets={datasets}
            showDatasetTable={this.props.showDatasetTable}
            removeDataset={this.props.removeDataset}
            startReloadingDataset={this.props.startReloadingDataset}
            setupDataset={this.props.setupDataset}
            enableDataset={this.props.enableDataset}
            showDeleteDataset
          />
          {hadDBPrivilege && <AddDataButton onClick={this.props.showAddDataModal} isInactive={!defaultDataset} />}
          <SidePanelDivider />
          <SidePanelSection>
            <WrappedSortableContainer
              onSortEnd={this._handleSort}
              onSortStart={this._onSortStart}
              updateBeforeSortStart={this._updateBeforeSortStart}
              lockAxis="y"
              helperClass="sorting-layers"
              useDragHandle
            >
              {layerOrder.map(
                (layerIdx, index) =>
                  !layers[layerIdx].config.hidden && (
                    <SortableItem
                      key={`layer-${layerIdx}`}
                      index={index}
                      isSorting={this.state.isSorting}
                    >
                      <LayerPanel
                        {...panelProps}
                        {...layerActions}
                        sortData={layerIdx}
                        key={layers[layerIdx].id}
                        idx={layerIdx}
                        layer={layers[layerIdx]}
                      />
                    </SortableItem>
                  )
              )}
            </WrappedSortableContainer>
          </SidePanelSection>
          <SidePanelSection>
            {defaultDataset ? (
              <Button className="add-layer-button" onClick={this._addEmptyNewLayer} width="105px">
                <Add height="12px" />
                <FormattedMessage id={'layerManager.addLayer'} />
              </Button>
            ) : null}
          </SidePanelSection>
          <LayerBlendingSelector
            layerBlending={this.props.layerBlending}
            updateLayerBlending={this.props.updateLayerBlending}
            intl={intl}
          />
          <JqxWindow
            ref={this.welcomeWnd}
            theme={"metrodark"}
            width={800}
            height={600}
            closeButtonSize={0}
            autoOpen={false}
            resizable={false}
            isModal={true}
            draggable={false}
          >
            <div style={{ border: 'none', padding: 0 }} />
            <div>
              <div style={{ padding: 24, height: 'calc(100% - 48px)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
                  <WelcomeText>
                    {this.state.welcomeText.split(/\n/).map(str => <p>{str}</p>)}
                  </WelcomeText>
                  <div>
                    <Button secondary onClick={this._handleWelcomeContinue} width={50} style={{ float: 'right' }}>
                      Continue
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </JqxWindow>
        </div>
      );
    }
  }
  return injectIntl(LayerManager);
}

export default LayerManagerFactory;
