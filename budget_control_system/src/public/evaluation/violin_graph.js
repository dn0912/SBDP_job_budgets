// Plotly.d3.csv("https://raw.githubusercontent.com/plotly/datasets/master/violin_data.csv", function (err, rows) {

const unpack = (rows, key) => {
  console.log('rows', rows)
  return rows.map((row) => parseInt(row[key].trim(), 10))
}

// eslint-disable-next-line no-undef
Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-local.csv', (err, rows) => {
  const unpackedData = unpack(rows, 'passedTime')

  const data = [{
    type: 'violin',
    y: unpackedData,
    points: 'none',
    box: {
      visible: true
    },
    boxpoints: false,
    line: {
      color: 'black'
    },
    fillcolor: '#8dd3c7',
    opacity: 0.6,
    meanline: {
      visible: true
    },
    x0: 'Delay (ms)'
  }]

  const layout = {
    title: 'Delay of fetching data with local trace-backend',
    yaxis: {
      zeroline: false
    },
    autosize: false,
    width: 550,
    height: 550,
    margin: {
      l: 50,
      r: 50,
      b: 100,
      t: 100,
      pad: 4
    },
    // paper_bgcolor: '#7f7f7f',
    // plot_bgcolor: '#c7c7c7'
  }

  // eslint-disable-next-line no-undef
  Plotly.newPlot('myDiv', data, layout)
})

// eslint-disable-next-line no-undef
Plotly.d3.csv(
  'http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-deployed_trace_backend.csv',
  (err, rows) => {
    const unpackedData = unpack(rows, 'passedTime')

    const data2 = [{
      type: 'violin',
      y: unpackedData,
      points: 'none',
      box: {
        visible: true
      },
      boxpoints: false,
      line: {
        color: 'black'
      },
      fillcolor: '#8dd3c7',
      opacity: 0.6,
      meanline: {
        visible: true
      },
      x0: 'Delay (ms)'
    }]

    const layout2 = {
      title: 'Delay of fetching data with deployed trace-backend',
      yaxis: {
        zeroline: false
      },
      autosize: false,
      width: 550,
      height: 550,
      margin: {
        l: 50,
        r: 50,
        b: 100,
        t: 100,
        pad: 4
      },
      // paper_bgcolor: '#7f7f7f',
      // plot_bgcolor: '#c7c7c7'
    }

    // eslint-disable-next-line no-undef
    Plotly.newPlot('myDiv2', data2, layout2)
  }
)

// eslint-disable-next-line no-undef
Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-local.csv', (err, localDataRows) => {
  // eslint-disable-next-line no-undef
  Plotly.d3.csv('http://localhost:8080/evaluation/trace-fetching-delay/traceFetchingDelaysRedis_log-deployed_trace_backend.csv', (err, deployedTraceBackendRows) => {
    const unpackedLocalData = unpack(localDataRows, 'passedTime')
    const unpackedDeployedTraceBackendData = unpack(deployedTraceBackendRows, 'passedTime')

    // const xValues = localDataRows.map(() => 'Delay (ms)')

    const _unpack = (rows, key) => {
      console.log('rows', rows)
      return rows.map((row) => `${row[key].trim()} lambdas`)
    }

    const data = [{
      type: 'violin',
      x: _unpack(deployedTraceBackendRows, 'parallelLambdas'),
      y: unpackedLocalData,
      legendgroup: 'local BE',
      scalegroup: 'local BE',
      name: 'local BE',
      side: 'negative',
      box: {
        visible: true
      },
      line: {
        color: 'blue',
        width: 2
      },
      meanline: {
        visible: true
      }
    },
    {
      type: 'violin',
      x: _unpack(localDataRows, 'parallelLambdas'),
      y: unpackedDeployedTraceBackendData,
      legendgroup: 'deployed BE',
      scalegroup: 'deployed BE',
      name: 'deployed BE',
      side: 'positive',
      box: {
        visible: true
      },
      line: {
        color: 'green',
        width: 2
      },
      meanline: {
        visible: true
      }
    }]

    const layout = {
      title: 'Split local and deployed trace-backend',
      yaxis: {
        zeroline: false,
      },
      violingap: 0,
      violingroupgap: 0,
      violinmode: 'overlay',
      width: 1000,
      height: 550,
    }

    // eslint-disable-next-line no-undef
    Plotly.newPlot('myDiv3', data, layout)
  })
})
