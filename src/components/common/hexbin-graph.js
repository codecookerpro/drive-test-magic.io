// Copyright (c) 2020 Uber Technologies, Inc.
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

import React, { Component } from 'react';
import ReactHighcharts from 'react-highcharts';
import _ from 'lodash';
import { mean, min, max, median, deviation, variance, sum } from 'd3-array';

function HexbinGraphFactory() {
  class HexbinGraph extends Component {
    static chartState = {
      index: null,
      aggregation: null,
      visState: { object: { points: [] } },
    };

    shouldComponentUpdate(nextProps) {
      const { index: newIdx, aggregation: newAggr, visState: { object: { points: newPoints } } } = nextProps;
      const { index: oldIdx, aggregation: oldAggr, visState: { object: { points: oldPoints } } } = HexbinGraph.chartState;
      HexbinGraph.chartState = { index: newIdx, aggregation: newAggr, visState: nextProps.visState };

      if (oldIdx != newIdx) {
        return true;
      }
      
      if (oldAggr != newAggr) {
        return true;
      }

      if (JSON.stringify(oldPoints) != JSON.stringify(newPoints)) {
        return true;
      }

      return false;
    }

    render() {
      const {
        visState,
        index,
        aggregation,
        ymin,
        ymax,
        cellnames
      } = this.props;

      const lineChart = visState?.object?.points;

      const data = (lineChart != undefined) ? lineChart.map((item) => {
        item.value = item.data[index - 1];
        item.time = item.data[8]
        // item.time = moment(item.data[8]).format('YYYY-MM-dd HH:mm:ss');
        // item.time = new Date(new Date(item.data[8]).setMilliseconds(0)).toString()
        item.enodeb = item.data[11]
        return { value: item.value, time: item.time, enodeb: item.enodeb }
      }) : [];

      const result = data.reduce(function (r, o) {
        var k = o.time + o.enodeb;
        if (r[k]) {
          if (o.value) r[k].values.push(o.value);
        } else {
          r[k] = o;
          r[k].values = [o.value];
          r[k].average = o.value; // taking 'Minimum' attribute as an items counter(on the first phase)
          r[k].sum = o.value; // taking 'Minimum' attribute as an items counter(on the first phase)
          r[k].max = o.value; // taking 'Maximum' attribute as an items counter(on the first phase)
          r[k].min = o.value; // taking 'Minimum' attribute as an items counter(on the first phase)
          r[k].median = o.value; // taking 'Minimum' attribute as an items counter(on the first phase)
          r[k].stdev = 0; // taking 'Stdev' attribute as an items counter(on the first phase)
          r[k].v = 0; // taking 'variance' attribute as an items counter(on the first phase)
        }
        return r;
      }, {});

      Object.keys(result).forEach(function (k) {
        result[k].average = result[k].value != undefined ? mean(result[k].values).toFixed(2) : null;
        result[k].max = result[k].value != undefined ? max(result[k].values).toFixed(2) : null;
        result[k].min = result[k].value != undefined ? min(result[k].values).toFixed(2) : null;
        result[k].median = result[k].value != undefined ? median(result[k].values).toFixed(2) : null;
        result[k].sum = result[k].value != undefined ? sum(result[k].values).toFixed(2) : null;
        result[k].stdev = result[k].values.length > 1 ? deviation(result[k].values).toFixed(2) : 0;
        result[k].v = result[k].values.length > 1 ? variance(result[k].values).toFixed(2) : 0;
      })

      const labels = Object.keys(_.groupBy(result, 'time')).map(item => { return new Date(item).getTime() });
      const diff = max(labels) - min(labels);

      const dataset = _.groupBy(result, 'enodeb');
      const enodebIds = Object.keys(dataset)

      if (diff > 3600000 * 24 * 30 * 36) {
        // groupBy 3m
      } else if (diff > 3600000 * 24 * 30 * 12) {
        // groupBy 1m
      } else if (diff > 3600000 * 24 * 30 * 3) {
        // groupBy 10d
      } else if (diff > 3600000 * 24 * 10 * 30) {
        // groupBy 4d
      } else if (diff > 3600000 * 24 * 10 * 30) {
        // groupBy 1d
      } else if (diff > 3600000 * 24 * 10 * 30) {
        // groupBy 4h
      } else {
        // groupBy 1h
      }

      const yvalues = [];
      for (var i of enodebIds) {
        yvalues[i] = []
        for (var k of dataset[i]) {
          let v = {
            x: new Date(k.time).getTime()
          };
          switch (aggregation) {
            case 'maximum':
              v.y = parseFloat(k.max);
              break;
            case 'minimum':
              v.y = parseFloat(k.min);
              break;
            case 'median':
              v.y = parseFloat(k.median);
              break;
            case 'sum':
              v.y = parseFloat(k.sum);
              break;
            case 'stdev':
              v.y = parseFloat(k.stdev);
              break;
            case 'variance':
              v.y = parseFloat(k.v);
              break;
            default:
              v.y = parseFloat(k.average);
          }
          yvalues[i].push(v);
        }
      }

      const colors = ['#2E93fA', '#66DA26', '#FF9800', '#7E36AF', '#00ECFF', '#f0ec26', '#E91E63'];

      const series = [];
      const annos = [];
      let iter = 0;

      for (var ids of enodebIds) {
        const item = {
          name: ids,
          type: 'line',
          data: yvalues[ids]
        }
        const anno = {
          value: mean(yvalues[ids].map(it => { return it.y })),
          color: colors[iter++],
          dashStyle: 'shortdash',
          width: 1
        }
        series.push(item);
        annos.push(anno);
      }

      const withZero = num => {
        if (num < 10)
          return '0' + num;
        return num;
      }

      const config = {
        chart: {
          height: 350,
          type: 'line',
          backgroundColor: '#29323c'
        },
        title: {
          text: null
        },
        colors: colors,
        xAxis: {
          type: 'datetime',
          lineWidth: 1,
          lineColor: '#4e5053',
          gridLineWidth: 1,
          gridLineColor: '#4e5053',
          labels: {
            style: {
              color: '#e3e3e3'
            }
          }
        },
        yAxis: {
          tickAmount: 6,
          title: {
            text: null
          },
          min: aggregation == 'average' || aggregation == 'minimum' || aggregation == 'maximum' ? ymin : undefined,
          max: aggregation == 'average' || aggregation == 'minimum' || aggregation == 'maximum' ? ymax : undefined,
          lineWidth: 0,
          lineColor: '#4e5053',
          gridLineWidth: 1,
          gridLineColor: '#4e5053',
          labels: {
            style: {
              color: '#e3e3e3'
            }
          },
          plotLines: annos
        },
        series: series,
        plotOptions: {
          series: {
            step: 'center',
            animation: {
              duration: 1000
            }
          },
          line: {
            events: {
              legendItemClick: function () {
                if (this.yAxis.plotLinesAndBands.length < enodebIds.length) {
                  this.yAxis.update({
                    plotLines: annos
                  })
                } else {
                  this.yAxis.plotLinesAndBands[this.index].destroy();
                }
              }
            }
          }
        },
        legend: {
          align: 'right',
          verticalAlign: 'middle',
          itemStyle: {
            color: '#e3e3e3',
          },
          layout: 'vertical',
          useHTML: true,
          itemHiddenStyle: { "color": "#616b75" },
          labelFormatter: function () {
            const color = this.color;
            const val = this.yData;
            return cellnames[this.name] + "<br/><span style='padding-left:3em'>" +
              "<span style='color:" + color + "'>#min:</span>" + min(val).toFixed(2) +
              "<span style='color:" + color + "'>#max:</span>" + max(val).toFixed(2) +
              "<span style='color:" + color + "'>#avg:</span>" + mean(val).toFixed(2) +
              "<span style='color:" + color + "'>#smp:</span>" + val.length +
              "</span>";
          }
        },
        tooltip: {
          shared: true,
          backgroundColor: '#232630',
          borderColor: '#19222c',
          style: {
            color: '#e3e3e3'
          },
          xDateFormat: '%Y-%m-%d %H',
          useHTML: true,
          headerFormat: '<center>{point.key}</center><table>',
          pointFormat: '<tr><td style="color: {series.color}">{series.name}: </td>' +
            '<td style="text-align: right">{point.y}</td></tr>',
          footerFormat: '</table>',
          valueDecimals: 2
        }
      }

      return (
        <ReactHighcharts config={config} />
      );
    }
  }

  return HexbinGraph;
}

export default HexbinGraphFactory;
