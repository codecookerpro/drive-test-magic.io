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

import React, {Component} from 'react';
import {createSelector} from 'reselect';

import ItemSelector from 'components/common/item-selector/item-selector';
import DatasetTagFactory from 'components/side-panel/common/dataset-tag';

const defaultPlaceHolder = 'Select A Data Source';

DatasetSelectorFactory.deps = [DatasetTagFactory];

function DatasetSelectorFactory(DatasetTag) {
  const DatasetItem = ({value}) => <DatasetTag dataset={value} />;

  class DatasetSelector extends Component {    
    /* selectors */
    /* eslint-disable no-invalid-this */
    datasetsSelector = props => props.datasets;
    dsOptionsSelector = createSelector(this.datasetsSelector, datasets =>
      Object.values(datasets).map(ds => ({
        label: ds.label,
        value: ds.id,
        color: ds.color,
      })).sort((a, b) => a.label > b.label ? 1 : -1)
    );

    render() {
      const {dataId, disabled, onSelect, defaultValue, inputTheme, placement} = this.props;
      const dsOptions = this.dsOptionsSelector(this.props);

      return (
        <div className="dataset-selector">
          <ItemSelector
            inputTheme={inputTheme}
            selectedItems={dataId ? this.props.datasets[dataId] : null}
            options={dsOptions}
            getOptionValue={'value'}
            filterOption={'label'}
            multiSelect={false}
            placement={placement}
            onChange={onSelect}
            placeholder={defaultValue}
            disabled={Boolean(disabled)}
            displayOption={'label'}
            DropDownLineItemRenderComponent={DatasetItem}
          />
        </div>
      );
    }
  }
  
  DatasetSelector.defaultProps = {
    defaultValue: defaultPlaceHolder
  };

  return DatasetSelector;
}


export default DatasetSelectorFactory;
