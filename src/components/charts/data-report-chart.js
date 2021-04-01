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
import zingchart from 'zingchart/es6';
import ZingChart from 'zingchart-react';
import _ from 'lodash';
import { mean, min, max, sum } from 'd3-array';

let chartConfig = {
  type: 'area',
  globals: {
    fontFamily: 'Helvetica',
    shadow: false
  },
  backgroundColor: "#29323c",
  // title: {
  //   text: 'Bandwidth for All Sites',
  //   padding: '15px 15px',
  //   backgroundColor: 'transparent',
  //   fontColor: '#5f5f5f',
  //   fontSize: '20px',
  //   textAlign: 'left'
  // },
  legend: {
    marginTop: '30px',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    item: {
      fontColor: '#5f5f5f'
    },
    layout: 'float',
    marker: {
      borderColor: 'transparent',
      borderRadius: '50px'
    }
  },
  plot: {
    alphaArea: 1,

    aspect: 'none',
    contourOnTop: true,
    lineWidth: '2px',
    marker: {
      visible: false
    }
  },
  scaleX: {
    values: [1563778800000, 1563782400000, 1563786000000, 1563789600000, 1563793200000, 1563796800000, 1563800400000, 1563804000000, 1563807600000, 1563811200000, 1563814800000, 1563818400000, 1563822000000],
    guide: {
      visible: false
    },
    item: {
      fontColor: '#5f5f5f'
    },
    lineColor: '#5f5f5f',
    lineWidth: '1px',
    maxItems: 8,
    tick: {
      lineColor: '#5f5f5f',
      lineWidth: '1px'
    },
    transform: {
      type: 'date'
    },
    zooming: true
  },
  scaleY: {
    guide: {
      lineColor: '#4e5053',
      lineStyle: 'solid'
    },
    item: {
      fontColor: '#5f5f5f'
    },
    lineColor: '#5f5f5f',
    lineWidth: '1px',
    tick: {
      lineColor: '#5f5f5f',
      lineWidth: '1px'
    }
  },
  crosshairX: {
    plotLabel: {
      backgroundColor: '#434343',
      fontColor: '#FFF'
    },
    scaleLabel: {
      backgroundColor: '#fff',
      borderColor: '#333',
      borderRadius: '3px',
      borderWidth: '1px',
      fontColor: 'black'
    }
  },
  tooltip: {
    visible: false
  },
  series: [
    {
      text: 'All Sites',
      values: [2596, 2626, 4480, 6394, 7488, 14510, 7012, 3389, 20281, 48597, 53309, 52385, 47097, 50813, 13510],
      backgroundColor1: '#E84F28',
      backgroundColor2: '#E84F28',
      lineColor: '#E84F28'
    },
    {
      text: 'www.zingchart.com',
      values: [479, 199, 583, 1624, 2772, 7899, 3467, 2227, 12885, 27873, 34420, 32569, 27721, 31569, 7362],
      backgroundColor1: '#45C392',
      backgroundColor2: '#45C392',
      lineColor: '#45C392'
    },
    {
      text: 'blog.zingchart.com',
      values: [408, 343, 410, 840, 1614, 3274, 2092, 914, 5709, 15317, 15633, 16720, 15504, 15821, 4565],
      backgroundColor1: '#28C2D1',
      backgroundColor2: '#28C2D1',
      lineColor: '#28C2D1'
    },
    {
      text: 'help.zingchart.com',
      values: [989, 1364, 2161, 2644, 1754, 2015, 818, 77, 1260, 3912, 1671, 1836, 2589, 1706, 1161],
      backgroundColor1: '#FBA645',
      backgroundColor2: '#FBA645',
      lineColor: '#FBA645'
    }
  ]
};

function DataReportChartFactory() {
  class DataReportChart extends Component {
    render() {
      return (
        <ZingChart
          id='data-report-chart'
          height={300}
          data={chartConfig}
        />
      );
    }
  }

  return DataReportChart;
}

export default DataReportChartFactory;
