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

import React, { PureComponent } from 'react';
import PropTypes from 'prop-types';
import { Place, PlaceMedium, PlaceSmall } from 'components/common/icons';
import { injectIntl } from 'react-intl';
import styled from 'styled-components';
import moment from 'moment';

const Marker = ({ IconComponent, x, y, scale, offset, height, mode, name }) => (
  <IconComponent
    style={{
      left: x - scale * offset,
      top: y - height * scale,
      position: 'absolute',
    }}
    mode={mode}
    name={name}
    onClick={() => {
      const targetRow = minionGridRef.getrows().find(r => r.name == name).boundindex;
      const selectedRows = minionGridRef.getselectedrowindexes();

      if (selectedRows.length == 1 && selectedRows.findIndex(r => r == targetRow) >= 0) {
        return;
      }

      minionGridRef.clearselection();
      minionGridRef.selectrow(targetRow);
    }}
  />
);


const StyledMarkerWrapper = styled.div`
`;

MapMarkerFactory.deps = [];

export default function MapMarkerFactory() {
  class MapMarker extends PureComponent {
    static propTypes = {
      x: PropTypes.number.isRequired,
      y: PropTypes.number.isRequired,
      color: PropTypes.string,
      info: PropTypes.object,
      markerScale: PropTypes.string
    };

    static defaultProps = {
      color: 'yellow',
      info: {},
      markerScale: 'large'
    }

    render() {
      const {
        mapW,
        x,
        y,
        markerScale,
        info: {
          operation_mode,
          name,
          lastupdate,
          gps_fix_lastupdate
        }
      } = this.props;

      const scale = 1;
      let mode = operation_mode;

      const lastFix = moment(gps_fix_lastupdate).format('YYYY-MM-DD HH:mm:ss');
      const lastUpdate = moment(lastupdate).format('YYYY-MM-DD HH:mm:ss');
      const now = moment().format('YYYY-MM-DD HH:mm:ss');
      const fixDiff = moment(now).diff(moment(lastFix), 'seconds');
      const updateDiff = moment(now).diff(moment(lastUpdate), 'seconds');

      if (fixDiff > 120) {
        if (updateDiff <= 120) {
          mode = 'no fix';
        }
        else {
          mode = 'offline';
        }
      }
      else if (updateDiff > 120 || !lastupdate) {
        mode = 'offline';
      }

      const props = { x, y, name, mode, scale };
      let offset = 0, height = 0, placeComp = Place;

      switch (markerScale) {
        case 'large':
          placeComp = Place;
          offset = 23;
          height = 79;
          break;
        case 'medium':
          placeComp = PlaceMedium;
          offset = 22;
          height = 61;
          break;
        case 'small':
          placeComp = PlaceSmall;
          offset = 10;
          height = 18;
          break;
      }

      return (
        <StyledMarkerWrapper>
          <Marker
            {...props}
            IconComponent={placeComp}
            offset={offset}
            height={height}
          />
        </StyledMarkerWrapper>
      );
    }
  }

  return injectIntl(MapMarker);
}
