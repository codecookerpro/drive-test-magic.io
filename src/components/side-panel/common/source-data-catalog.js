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

import React from 'react';
import styled from 'styled-components';

import {SidePanelSection} from 'components/common/styled-components';
import DatasetTitleFactory from 'components/side-panel/common/dataset-title';
import DatasetInfoFactory from 'components/side-panel/common/dataset-info';

const SourceDataCatalogWrapper = styled.div`
  transition: ${props => props.theme.transition};
`;

SourceDataCatalogFactory.deps = [DatasetTitleFactory, DatasetInfoFactory];

function SourceDataCatalogFactory(DatasetTitle, DatasetInfo) {
  const SourceDataCatalog = ({
    userRole,
    datasets,
    showDatasetTable,
    removeDataset,
    startReloadingDataset,
    setupDataset,
    enableDataset,
    onTitleClick,
    showDeleteDataset = false
  }) => (
    <SourceDataCatalogWrapper className="source-data-catalog">
      {Object.values(datasets).sort((a, b) => a.label > b.label ? 1 : -1).map((dataset, index) => (
        <SidePanelSection key={dataset.id}>
          <DatasetTitle
            userRole={userRole}
            showDatasetTable={showDatasetTable}
            showDeleteDataset={showDeleteDataset}
            removeDataset={removeDataset}
            startReloadingDataset={startReloadingDataset}
            setupDataset={setupDataset}
            enableDataset={enableDataset}
            dataset={dataset}
            onTitleClick={onTitleClick}
          />
          {showDatasetTable ? <DatasetInfo dataset={dataset} /> : null}
        </SidePanelSection>
      ))}
    </SourceDataCatalogWrapper>
  );

  return SourceDataCatalog;
}

export default SourceDataCatalogFactory;
